import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { login } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { ipSecurityEvents, ipSecurityRules } from '../../db/schema';

describe('/login IP abuse protection', () => {
  test('auto-blocks an IP after repeated failed logins and records security events', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' };

    for (let i = 0; i < 5; i += 1) {
      const response = await login('testowner', 'wrongpassword', undefined, undefined, {}, headers);
      expect(response.status).toBe(400);
    }

    const blocked = await login('testowner', 'password123', undefined, undefined, {}, headers);
    expect(blocked.status).toBe(403);

    const blockRule = await tdb
      .select()
      .from(ipSecurityRules)
      .where(eq(ipSecurityRules.kind, 'block'))
      .get();
    expect(blockRule?.ipRange).toBe('203.0.113.77');
    expect(blockRule?.reason).toContain('failed login');

    const events = await tdb.select().from(ipSecurityEvents);
    expect(events.some((event) => event.event === 'login_failed')).toBe(true);
    expect(events.some((event) => event.event === 'ip_auto_blocked')).toBe(true);
  });

  test('allowlisted IPs skip rate-limit and auto-block but still must authenticate', async () => {
    await tdb.insert(ipSecurityRules).values({
      kind: 'allow',
      ipRange: '203.0.113.88',
      reason: 'trusted admin network',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      updatedAt: null,
      createdBy: 1
    });

    const headers = { 'x-forwarded-for': '203.0.113.88' };

    for (let i = 0; i < 8; i += 1) {
      const response = await login('testowner', 'wrongpassword', undefined, undefined, {}, headers);
      expect(response.status).toBe(400);
    }

    const valid = await login('testowner', 'password123', undefined, undefined, {}, headers);
    expect(valid.status).toBe(200);

    const blockRule = await tdb
      .select()
      .from(ipSecurityRules)
      .where(eq(ipSecurityRules.kind, 'block'))
      .get();
    expect(blockRule).toBeUndefined();
  });
});
