import { sha256 } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { initTest } from '../../__tests__/helpers';
import { TEST_SECRET_TOKEN } from '../../__tests__/seed';
import { tdb } from '../../__tests__/setup';
import { getUserByToken } from '../../db/queries/users';
import { userAppPasswords, users } from '../../db/schema';
import { generateTotpCode } from '../../utils/totp';
import {
  closeSocketsForAppPassword,
  closeSocketsForUser,
  registerWsClient,
  unregisterWsClient
} from '../../utils/ws-client-registry';

describe('users MFA router', () => {
  test('starts setup, enables MFA with a valid code, and reports status', async () => {
    const { caller } = await initTest(1);

    expect(await caller.users.mfa.status()).toEqual({
      enabled: false,
      recoveryCodesRemaining: 0
    });

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

    expect(enabled.enabled).toBe(true);
    expect(enabled.recoveryCodes).toHaveLength(10);
    expect(await caller.users.mfa.status()).toEqual({
      enabled: true,
      recoveryCodesRemaining: 10
    });

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

    const revoked = await caller.users.mfa.revokeAppPassword({
      id: list[0]!.id
    });
    expect(revoked).toEqual({ revoked: true });

    const refreshed = await caller.users.mfa.appPasswords();
    expect(refreshed[0]!.revokedAt).toBeNumber();
  });

  test('getUserByToken rejects banned users even when their JWT is still valid', async () => {
    const token = jwt.sign({ userId: 2 }, await sha256(TEST_SECRET_TOKEN), {
      expiresIn: '86400s'
    });

    expect(await getUserByToken(token)).toBeTruthy();

    await tdb
      .update(users)
      .set({
        banned: true,
        banReason: 'Token revocation regression',
        bannedAt: Date.now()
      })
      .where(eq(users.id, 2));

    expect(await getUserByToken(token)).toBeUndefined();
  });

  test('getUserByToken rejects JWTs tied to revoked app passwords', async () => {
    const { caller } = await initTest(1);
    const inserted = await tdb
      .insert(userAppPasswords)
      .values({
        userId: 1,
        name: 'Desktop app',
        tokenHash: 'revocable-token-hash',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        revokedAt: null
      })
      .returning({ id: userAppPasswords.id })
      .get();

    const token = jwt.sign(
      { userId: 1, appPasswordId: inserted.id },
      await sha256(TEST_SECRET_TOKEN),
      { expiresIn: '86400s' }
    );

    expect(await getUserByToken(token)).toBeTruthy();
    await caller.users.mfa.revokeAppPassword({ id: inserted.id });
    expect(await getUserByToken(token)).toBeUndefined();
  });

  test('closeSocketsForUser closes every active socket for that user', async () => {
    const firstToken = jwt.sign(
      { userId: 2 },
      await sha256(TEST_SECRET_TOKEN),
      {
        expiresIn: '86400s'
      }
    );
    const secondToken = jwt.sign(
      { userId: 2 },
      await sha256(TEST_SECRET_TOKEN),
      {
        expiresIn: '86400s'
      }
    );
    const otherToken = jwt.sign(
      { userId: 3 },
      await sha256(TEST_SECRET_TOKEN),
      {
        expiresIn: '86400s'
      }
    );
    const closeCalls: Array<{ code?: number; reason?: string }> = [];
    const firstSocket = {
      token: firstToken,
      userId: 2,
      readyState: WebSocket.OPEN,
      close: (code?: number, reason?: string) =>
        closeCalls.push({ code, reason })
    } as unknown as WebSocket;
    const secondSocket = {
      token: secondToken,
      readyState: WebSocket.OPEN,
      close: (code?: number, reason?: string) =>
        closeCalls.push({ code, reason })
    } as unknown as WebSocket;
    const otherSocket = {
      token: otherToken,
      userId: 3,
      readyState: WebSocket.OPEN,
      close: (code?: number, reason?: string) =>
        closeCalls.push({ code, reason })
    } as unknown as WebSocket;

    registerWsClient(firstSocket);
    registerWsClient(secondSocket);
    registerWsClient(otherSocket);
    try {
      await closeSocketsForUser(2, 4003, 'Banned');
    } finally {
      unregisterWsClient(firstSocket);
      unregisterWsClient(secondSocket);
      unregisterWsClient(otherSocket);
    }

    expect(closeCalls).toEqual([
      { code: 4003, reason: 'Banned' },
      { code: 4003, reason: 'Banned' }
    ]);
  });

  test('app-password revoke closes matching active desktop sockets', async () => {
    await initTest(1);
    const inserted = await tdb
      .insert(userAppPasswords)
      .values({
        userId: 1,
        name: 'Desktop app',
        tokenHash: 'revocable-token-hash',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        revokedAt: null
      })
      .returning({ id: userAppPasswords.id })
      .get();

    const matchingToken = jwt.sign(
      { userId: 1, appPasswordId: inserted.id },
      await sha256(TEST_SECRET_TOKEN),
      { expiresIn: '86400s' }
    );
    const passwordToken = jwt.sign(
      { userId: 1 },
      await sha256(TEST_SECRET_TOKEN),
      {
        expiresIn: '86400s'
      }
    );
    const closeCalls: Array<{ code?: number; reason?: string }> = [];
    const matchingSocket = {
      token: matchingToken,
      readyState: WebSocket.OPEN,
      close: (code?: number, reason?: string) =>
        closeCalls.push({ code, reason })
    } as unknown as WebSocket;
    const passwordSocket = {
      token: passwordToken,
      readyState: WebSocket.OPEN,
      close: (code?: number, reason?: string) =>
        closeCalls.push({ code, reason })
    } as unknown as WebSocket;

    registerWsClient(matchingSocket);
    registerWsClient(passwordSocket);
    try {
      await closeSocketsForAppPassword(1, inserted.id);
    } finally {
      unregisterWsClient(matchingSocket);
      unregisterWsClient(passwordSocket);
    }

    expect(closeCalls).toEqual([
      { code: 4001, reason: 'App password revoked' }
    ]);
  });
});
