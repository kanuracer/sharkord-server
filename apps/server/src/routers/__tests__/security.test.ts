import { ActivityLogType } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { activityLog } from '../../db/schema';

describe('security admin router', () => {
  test('lists, allowlists, removes allowlist, and unblocks IPs', async () => {
    const { caller } = await initTest();

    const created = await caller.security.addIpAllowlist({
      ipRange: '203.0.113.0/24',
      reason: 'trusted office',
      expiresAt: Date.now() + 86_400_000
    });
    expect(created.kind).toBe('allow');

    await caller.security.addIpBlock({
      ipRange: '198.51.100.10',
      reason: 'manual test block',
      expiresAt: Date.now() + 86_400_000
    });

    const list = await caller.security.getIpRules();
    expect(list.allowed.some((rule) => rule.ipRange === '203.0.113.0/24')).toBe(true);
    expect(list.blocked.some((rule) => rule.ipRange === '198.51.100.10')).toBe(true);

    await caller.security.removeIpRule({ ruleId: created.id });
    await caller.security.unblockIp({ ip: '198.51.100.10' });

    const after = await caller.security.getIpRules();
    expect(after.allowed.some((rule) => rule.ipRange === '203.0.113.0/24')).toBe(false);
    expect(after.blocked.some((rule) => rule.ipRange === '198.51.100.10')).toBe(false);

    const events = await caller.security.getSecurityEvents({ limit: 20 });
    expect(events.some((event) => event.event === 'ip_allowlisted')).toBe(true);
    expect(events.some((event) => event.event === 'ip_unblocked')).toBe(true);
  });

  test('clears security events and leaves an auditable clear marker', async () => {
    const { caller } = await initTest();

    await caller.security.addIpBlock({
      ipRange: '198.51.100.42',
      reason: 'clear test'
    });
    expect((await caller.security.getSecurityEvents({ limit: 20 })).length).toBeGreaterThan(0);

    const result = await caller.security.clearSecurityEvents();
    expect(result.cleared).toBeGreaterThan(0);

    const after = await caller.security.getSecurityEvents({ limit: 20 });
    expect(after).toHaveLength(1);
    expect(after[0]?.event).toBe('security_events_cleared');
    expect(after[0]?.metadata).toMatchObject({ clearedBy: 1 });
  });

  test('returns server security audit log entries for admins without leaking secrets', async () => {
    const { caller } = await initTest();
    await tdb.insert(activityLog).values({
      userId: 1,
      type: ActivityLogType.MFA_REAUTH_FAILED,
      details: { action: 'disable', reason: 'totp' },
      ip: '203.0.113.99',
      createdAt: Date.now()
    });

    const rows = await caller.security.getAuditLog({ limit: 10 });
    const row = rows.find((entry) => entry.type === ActivityLogType.MFA_REAUTH_FAILED);

    expect(row).toBeDefined();
    expect(row?.userId).toBe(1);
    expect(row?.ip).toBe('203.0.113.99');
    expect(row?.user?.id).toBe(1);
    expect(JSON.stringify(row)).not.toContain('password123');
    expect(JSON.stringify(row)).not.toContain('000000');
  });
});
