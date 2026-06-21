import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { userAppPasswords, users } from '../../db/schema';
import { generateTotpCode } from '../../utils/totp';

describe('users MFA router', () => {
  test('starts setup, enables MFA with a valid code, and reports status', async () => {
    const { caller } = await initTest(1);

    expect(await caller.users.mfa.status()).toEqual({ enabled: false });

    const setup = await caller.users.mfa.start();

    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUrl).toContain('otpauth://totp/Sharkord%3Atestowner');
    expect(setup.otpauthUrl).toContain(`secret=${setup.secret}`);

    await expect(caller.users.mfa.enable({ code: '000000' })).rejects.toThrow(
      'Invalid two-factor code'
    );

    const enabled = await caller.users.mfa.enable({
      code: generateTotpCode(setup.secret)
    });

    expect(enabled).toEqual({ enabled: true });
    expect(await caller.users.mfa.status()).toEqual({ enabled: true });

    const user = await tdb
      .select({
        mfaSecret: users.mfaSecret,
        mfaEnabled: users.mfaEnabled,
        mfaEnabledAt: users.mfaEnabledAt
      })
      .from(users)
      .where(eq(users.id, 1))
      .get();

    expect(user!.mfaSecret).toBe(setup.secret);
    expect(user!.mfaEnabled).toBe(true);
    expect(typeof user!.mfaEnabledAt).toBe('number');
  });

  test('disables MFA only with current password and code', async () => {
    const { caller } = await initTest(1);
    const setup = await caller.users.mfa.start();
    const code = generateTotpCode(setup.secret);

    await caller.users.mfa.enable({ code });

    await tdb.insert(userAppPasswords).values({
      userId: 1,
      name: 'Desktop app',
      tokenHash: 'disable-revokes-token',
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null
    });

    await expect(
      caller.users.mfa.disable({ password: 'wrong-password', code })
    ).rejects.toThrow('Current password is incorrect');

    await expect(
      caller.users.mfa.disable({ password: 'password123', code: '000000' })
    ).rejects.toThrow('Invalid two-factor code');

    const disabled = await caller.users.mfa.disable({
      password: 'password123',
      code: generateTotpCode(setup.secret)
    });

    expect(disabled).toEqual({ enabled: false });

    const user = await tdb
      .select({
        mfaSecret: users.mfaSecret,
        mfaEnabled: users.mfaEnabled,
        mfaEnabledAt: users.mfaEnabledAt
      })
      .from(users)
      .where(eq(users.id, 1))
      .get();

    expect(user).toEqual({
      mfaSecret: null,
      mfaEnabled: false,
      mfaEnabledAt: null
    });

    const appPassword = await tdb
      .select({ revokedAt: userAppPasswords.revokedAt })
      .from(userAppPasswords)
      .where(eq(userAppPasswords.tokenHash, 'disable-revokes-token'))
      .get();

    expect(appPassword!.revokedAt).toBeNumber();
  });

  test('starting a new MFA setup revokes existing app passwords', async () => {
    const { caller } = await initTest(1);
    await tdb.insert(userAppPasswords).values({
      userId: 1,
      name: 'Old Desktop app',
      tokenHash: 'setup-revokes-token',
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null
    });

    await caller.users.mfa.start();

    const appPassword = await tdb
      .select({ revokedAt: userAppPasswords.revokedAt })
      .from(userAppPasswords)
      .where(eq(userAppPasswords.tokenHash, 'setup-revokes-token'))
      .get();

    expect(appPassword!.revokedAt).toBeNumber();
  });

  test('lists and revokes current user app passwords', async () => {
    const { caller } = await initTest(1);
    await tdb.insert(userAppPasswords).values({
      userId: 1,
      name: 'Desktop app',
      tokenHash: 'hash-one',
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null
    });
    await tdb.insert(userAppPasswords).values({
      userId: 2,
      name: 'Other user app',
      tokenHash: 'hash-two',
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null
    });

    const list = await caller.users.mfa.appPasswords();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Desktop app');
    expect(list[0]).not.toHaveProperty('tokenHash');

    const revoked = await caller.users.mfa.revokeAppPassword({ id: list[0]!.id });
    expect(revoked).toEqual({ revoked: true });

    const refreshed = await caller.users.mfa.appPasswords();
    expect(refreshed[0]!.revokedAt).toBeNumber();
  });
});
