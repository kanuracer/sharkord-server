import { ActivityLogType, Permission } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { activityLog, rolePermissions } from '../../db/schema';

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
    expect(after).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 25));
    const rows = await caller.security.getAuditLog({ limit: 10 });
    const clearEntry = rows.find((entry) => entry.type === ActivityLogType.EDIT_SERVER_SETTINGS);
    expect(clearEntry?.userId).toBe(1);
    expect(clearEntry?.user?.identity).toBe('testowner');
    expect(clearEntry?.details).toMatchObject({ values: { securityEventsCleared: expect.any(Number) } });
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

  test('allows dedicated audit-log and security-event permissions', async () => {
    const { caller } = await initTest(2);
    const now = Date.now();

    await expect(caller.security.getAuditLog({ limit: 1 })).rejects.toThrow('Insufficient permissions');

    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.VIEW_AUDIT_LOG,
      createdAt: now
    });

    expect(Array.isArray(await caller.security.getAuditLog({ limit: 1 }))).toBe(true);
    await expect(caller.security.clearSecurityEvents()).rejects.toThrow('Insufficient permissions');

    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.MANAGE_SECURITY_EVENTS,
      createdAt: now + 1
    });

    await expect(caller.security.clearSecurityEvents()).resolves.toMatchObject({ cleared: expect.any(Number) });
  });

});
