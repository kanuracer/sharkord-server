import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';

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
});
