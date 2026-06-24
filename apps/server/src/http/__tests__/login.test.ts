import { sha256 } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { login } from '../../__tests__/helpers';
import { TEST_SECRET_TOKEN } from '../../__tests__/seed';
import { tdb } from '../../__tests__/setup';
import { getChannelsReadStatesForUser } from '../../db/queries/channels';
import {
  channelReadStates,
  invites,
  messages,
  roles,
  settings,
  userAppPasswords,
  userMfaRecoveryCodes,
  userRoles,
  users
} from '../../db/schema';
import { generateTotpCode } from '../../utils/totp';

describe('/login', () => {
  test('should successfully login with valid credentials', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const data = (await response.json()) as { success: boolean; token: string };

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const decoded = jwt.verify(data.token, await sha256(TEST_SECRET_TOKEN));

    expect(decoded).toHaveProperty('userId');
  });

  test('should fail login with a generic auth error for invalid password', async () => {
    const response = await login('testowner', 'wrongpassword');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toEqual({
      identity: 'Invalid identity, password, or invite'
    });
  });

  test('should not reveal whether identity or password was invalid', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    const invalidPassword = await login('testowner', 'wrongpassword');
    const unknownIdentity = await login('missingidentity', 'password123');

    expect(invalidPassword.status).toBe(400);
    expect(unknownIdentity.status).toBe(400);

    expect(await invalidPassword.json()).toEqual(await unknownIdentity.json());
  });

  test('should require and verify TOTP when MFA is enabled', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    await tdb
      .update(users)
      .set({ mfaSecret: secret, mfaEnabled: true, mfaEnabledAt: Date.now() })
      .where(eq(users.identity, 'testowner'))
      .run();

    const missingCode = await login('testowner', 'password123');
    expect(missingCode.status).toBe(400);
    const missingCodeBody = (await missingCode.json()) as {
      errors?: { totpCode?: string };
    };
    expect(missingCodeBody.errors?.totpCode).toBe('Two-factor code required');

    const invalidCode = await login(
      'testowner',
      'password123',
      undefined,
      '000000'
    );
    expect(invalidCode.status).toBe(400);
    const invalidCodeBody = (await invalidCode.json()) as {
      errors?: { totpCode?: string };
    };
    expect(invalidCodeBody.errors?.totpCode).toBe('Invalid two-factor code');

    const validCode = await login(
      'testowner',
      'password123',
      undefined,
      generateTotpCode(secret)
    );
    expect(validCode.status).toBe(200);
    expect(await validCode.json()).toHaveProperty('token');

    await tdb
      .update(users)
      .set({ mfaSecret: null, mfaEnabled: false, mfaEnabledAt: null })
      .where(eq(users.identity, 'testowner'))
      .run();
  });

  test('should mint and accept revocable app passwords after valid TOTP', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    await tdb
      .update(users)
      .set({ mfaSecret: secret, mfaEnabled: true, mfaEnabledAt: Date.now() })
      .where(eq(users.identity, 'testowner'))
      .run();

    const remembered = await login(
      'testowner',
      'password123',
      undefined,
      generateTotpCode(secret),
      { rememberDevice: true, deviceName: 'Desktop test device' }
    );
    expect(remembered.status).toBe(200);
    const rememberedBody = (await remembered.json()) as {
      token: string;
      appPassword?: string;
      appPasswordId?: number;
    };
    expect(rememberedBody.token).toBeTruthy();
    expect(rememberedBody.appPassword).toMatch(/^shk_app_[A-Za-z0-9_-]{32,}$/);
    expect(typeof rememberedBody.appPasswordId).toBe('number');

    const stored = await tdb
      .select()
      .from(userAppPasswords)
      .where(eq(userAppPasswords.id, rememberedBody.appPasswordId!))
      .get();
    expect(stored?.name).toBe('Desktop test device');
    expect(stored?.tokenHash).not.toBe(rememberedBody.appPassword);
    expect(stored?.revokedAt).toBeNull();

    const appPasswordLogin = await login(
      'testowner',
      'password123',
      undefined,
      undefined,
      {
        appPassword: rememberedBody.appPassword
      }
    );
    expect(appPasswordLogin.status).toBe(200);
    expect(await appPasswordLogin.json()).toHaveProperty('token');

    await tdb
      .update(userAppPasswords)
      .set({ revokedAt: Date.now() })
      .where(eq(userAppPasswords.id, rememberedBody.appPasswordId!))
      .run();

    const revokedLogin = await login(
      'testowner',
      'password123',
      undefined,
      undefined,
      {
        appPassword: rememberedBody.appPassword
      }
    );
    expect(revokedLogin.status).toBe(400);
    const revokedBody = (await revokedLogin.json()) as {
      errors?: { totpCode?: string };
    };
    expect(revokedBody.errors?.totpCode).toBe('Two-factor code required');

    await tdb
      .update(users)
      .set({ mfaSecret: null, mfaEnabled: false, mfaEnabledAt: null })
      .where(eq(users.identity, 'testowner'))
      .run();
  });

  test('should issue one-time recovery codes when MFA is enabled and consume them on login', async () => {
    const { caller } = await import('../../__tests__/helpers').then((m) => m.initTest());
    const setup = await caller.users.mfa.start();
    const enabled = await caller.users.mfa.enable({ code: generateTotpCode(setup.secret) }) as { recoveryCodes?: string[] };

    expect(enabled.recoveryCodes).toHaveLength(10);
    expect(enabled.recoveryCodes?.every((code) => /^shk_rec_[A-Za-z0-9_-]{10,}$/.test(code))).toBe(true);

    const storedCodes = await tdb.select().from(userMfaRecoveryCodes);
    expect(storedCodes).toHaveLength(10);
    const firstStoredCode = storedCodes[0];
    expect(firstStoredCode).toBeDefined();
    expect(firstStoredCode!.codeHash).not.toBe(enabled.recoveryCodes![0]);
    expect(firstStoredCode!.usedAt).toBeNull();

    const firstLogin = await login('testowner', 'password123', undefined, undefined, {
      recoveryCode: enabled.recoveryCodes![0]
    });
    expect(firstLogin.status).toBe(200);
    expect(await firstLogin.json()).toHaveProperty('token');

    const used = await tdb.select().from(userMfaRecoveryCodes).where(eq(userMfaRecoveryCodes.codeHash, firstStoredCode!.codeHash)).get();
    expect(used?.usedAt).toBeGreaterThan(0);

    const replay = await login('testowner', 'password123', undefined, undefined, {
      recoveryCode: enabled.recoveryCodes![0]
    });
    expect(replay.status).toBe(400);
    const replayBody = (await replay.json()) as { errors?: { totpCode?: string } };
    expect(replayBody.errors?.totpCode).toBe('Invalid recovery code');
  });

  test('should auto-register new user when allowNewUsers is true', async () => {
    const response = await login('newuser', 'newpassword123');

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const newUser = await tdb
      .select()
      .from(users)
      .where(eq(users.identity, 'newuser'))
      .get();

    expect(newUser).toBeTruthy();
    expect(newUser?.name).toStartWith('SharkordUser');
  });

  test('should mark all existing messages as read for first-time users', async () => {
    const response = await login('readstateuser', 'password123');

    expect(response.status).toBe(200);

    const newUser = await tdb
      .select()
      .from(users)
      .where(eq(users.identity, 'readstateuser'))
      .get();

    expect(newUser).toBeTruthy();

    const readStates = await tdb
      .select()
      .from(channelReadStates)
      .where(eq(channelReadStates.userId, newUser!.id));

    expect(readStates.length).toBeGreaterThan(0);

    const unreadMap = await getChannelsReadStatesForUser(newUser!.id);

    for (const unreadCount of Object.values(unreadMap)) {
      expect(unreadCount).toBe(0);
    }
  });

  test('should only count new messages as unread after first-time login', async () => {
    const response = await login('readstateuser2', 'password123');

    expect(response.status).toBe(200);

    const newUser = await tdb
      .select()
      .from(users)
      .where(eq(users.identity, 'readstateuser2'))
      .get();

    expect(newUser).toBeTruthy();

    await tdb.insert(messages).values({
      userId: 1,
      channelId: 1,
      content: 'A new message after first join',
      metadata: null,
      createdAt: Date.now()
    });

    const unreadMap = await getChannelsReadStatesForUser(newUser!.id);

    expect(unreadMap[1]).toBe(1);
  });

  test('should fail when allowNewUsers is false and no invite provided', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    const response = await login('anothernewuser', 'password123');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty(
      'identity',
      'Invalid identity, password, or invite'
    );
  });

  test('should allow registration with valid invite when allowNewUsers is false', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    await tdb.insert(invites).values({
      code: 'TESTINVITE123',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() + 86400000, // 1 day
      createdAt: Date.now()
    });

    const response = await login('inviteuser', 'password123', 'TESTINVITE123');

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const updatedInvite = await tdb
      .select()
      .from(invites)
      .where(eq(invites.code, 'TESTINVITE123'))
      .get();

    expect(updatedInvite?.uses).toBe(1);
  });

  test('should fail with expired invite', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    await tdb.insert(invites).values({
      code: 'EXPIREDINVITE',
      creatorId: 1,
      maxUses: 5,
      uses: 0,
      expiresAt: Date.now() - 1000, // expired
      createdAt: Date.now() - 86400000
    });

    const response = await login(
      'expiredinviteuser',
      'password123',
      'EXPIREDINVITE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail with maxed out invite', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    // Create a maxed out invite
    await tdb.insert(invites).values({
      code: 'MAXEDINVITE',
      creatorId: 1,
      maxUses: 2,
      uses: 2,
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now()
    });

    const response = await login(
      'maxedinviteuser',
      'password123',
      'MAXEDINVITE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail with non-existent invite', async () => {
    await tdb.update(settings).set({ allowNewUsers: false });

    const response = await login(
      'fakeinviteuser',
      'password123',
      'FAKEINVITECODE'
    );

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
  });

  test('should fail login for banned user', async () => {
    await tdb
      .update(users)
      .set({
        banned: true,
        banReason: 'Test ban reason'
      })
      .where(eq(users.identity, 'testuser'));

    const response = await login('testuser', 'password123');

    expect(response.status).toBe(400);

    const data: any = await response.json();

    expect(data).toHaveProperty('errors');
    expect(data.errors).toHaveProperty('identity');
    expect(data.errors.identity).toContain('banned');
  });

  test('should fail with missing identity', async () => {
    const response = await login('', 'somepassword');

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data).toHaveProperty('errors');
  });

  test('should fail with missing password', async () => {
    const response = await login('someidentity', '');

    expect(response.status).toBe(400);

    const data = await response.json();

    expect(data).toHaveProperty('errors');
  });

  test('should return valid JWT token with userId claim', async () => {
    const response = await login('testowner', 'password123');

    expect(response.status).toBe(200);

    const data: any = await response.json();

    const decoded = jwt.verify(
      data.token,
      await sha256(TEST_SECRET_TOKEN)
    ) as jwt.JwtPayload;

    expect(decoded).toHaveProperty('userId');
    expect(typeof decoded.userId).toBe('number');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('iat');
  });

  test('should assign default role to newly registered user', async () => {
    const response = await login('roleuser', 'password123');

    expect(response.status).toBe(200);

    const newUser = await tdb
      .select()
      .from(users)
      .where(eq(users.identity, 'roleuser'))
      .get();

    expect(newUser).toBeTruthy();

    const userRole = await tdb
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, newUser!.id))
      .get();

    expect(userRole).toBeTruthy();

    const role = await tdb
      .select()
      .from(roles)
      .where(eq(roles.id, userRole!.roleId))
      .get();

    expect(role?.isDefault).toBe(true);
  });

  test('should rate limit excessive login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await login('testowner', 'wrongpassword');

      expect(response.status).toBe(400);
    }

    const limitedResponse = await login('testowner', 'wrongpassword');

    expect(limitedResponse.status).toBe(403);

    const data = await limitedResponse.json();

    expect(data).toHaveProperty(
      'error',
      'Login from this IP is blocked. Contact an administrator.'
    );
  });

  test('should trim identity', async () => {
    const response = await login('  testowner  ', 'password123');

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');
  });

  test('identity should be case-insensitive', async () => {
    const response = await login('TESTOWNER', 'password123');

    expect(response.status).toBe(200);

    const data = (await response.json()) as { token: string };

    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');

    const decoded = jwt.verify(
      data.token,
      await sha256(TEST_SECRET_TOKEN)
    ) as jwt.JwtPayload;

    expect(decoded).toHaveProperty('userId');

    const firstUser = await tdb
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .get();

    const response2 = await login('testowner', 'password123');

    expect(response2.status).toBe(200);

    const data2 = (await response2.json()) as { token: string };

    const decoded2 = jwt.verify(
      data2.token,
      await sha256(TEST_SECRET_TOKEN)
    ) as jwt.JwtPayload;

    expect(decoded2).toHaveProperty('userId');
    expect(decoded2.userId).toBe(firstUser?.id);
  });
});
