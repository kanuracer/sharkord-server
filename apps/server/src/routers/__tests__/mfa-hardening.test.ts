import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { activityLog } from '../../db/schema';
import { generateTotpCode } from '../../utils/totp';

const enableMfa = async () => {
  const { caller } = await initTest(1);
  const setup = await caller.users.mfa.start();
  await caller.users.mfa.enable({ code: generateTotpCode(setup.secret) });
  return { caller, secret: setup.secret };
};

describe('MFA reauth hardening', () => {
  test('rate limits repeated failed reauth attempts before allowing recovery-code regeneration', async () => {
    const { caller, secret } = await enableMfa();
    const code = generateTotpCode(secret);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        caller.users.mfa.regenerateRecoveryCodes({ password: 'wrong-password', code })
      ).rejects.toThrow('Current password is incorrect');
    }

    await expect(
      caller.users.mfa.regenerateRecoveryCodes({ password: 'password123', code })
    ).rejects.toThrow('Too many reauthentication attempts');
  });

  test('writes account-security audit events without storing passwords, TOTP codes, or recovery codes', async () => {
    const { caller, secret } = await enableMfa();

    await expect(
      caller.users.mfa.regenerateRecoveryCodes({ password: 'password123', code: '000000' })
    ).rejects.toThrow('Invalid two-factor code');

    const regenerated = await caller.users.mfa.regenerateRecoveryCodes({
      password: 'password123',
      code: generateTotpCode(secret)
    });
    expect(regenerated).toHaveLength(10);

    await caller.users.mfa.disable({
      password: 'password123',
      code: generateTotpCode(secret)
    });

    const rows = await tdb
      .select({ type: activityLog.type, details: activityLog.details })
      .from(activityLog)
      .where(eq(activityLog.userId, 1))
      .orderBy(desc(activityLog.createdAt));

    expect(rows.map((row) => row.type)).toContain('MFA_REAUTH_FAILED');
    expect(rows.map((row) => row.type)).toContain('MFA_RECOVERY_CODES_REGENERATED');
    expect(rows.map((row) => row.type)).toContain('MFA_DISABLED');

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('password123');
    expect(serialized).not.toContain('000000');
    for (const code of regenerated) expect(serialized).not.toContain(code);
  });
});
