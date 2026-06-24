import { describe, expect, test } from 'bun:test';
import {
  ipMatchesRule,
  isIpAllowedByRules,
  normalizeClientIp,
  resolveTrustedClientIp
} from '../ip-security';

describe('IP security helpers', () => {
  test('only trusts forwarded headers from configured trusted proxies', () => {
    const headers = { 'x-forwarded-for': '203.0.113.9, 172.18.0.8' };

    expect(
      resolveTrustedClientIp({ headers, remoteAddress: '198.51.100.7', trustedProxies: [] })
    ).toBe('198.51.100.7');
    expect(
      resolveTrustedClientIp({ headers, remoteAddress: '172.18.0.5', trustedProxies: ['172.16.0.0/12'] })
    ).toBe('203.0.113.9');
  });

  test('normalizes IPv4-mapped addresses, CIDR ranges, and Docker-style wildcards', () => {
    expect(normalizeClientIp('::ffff:192.0.2.44')).toBe('192.0.2.44');
    expect(ipMatchesRule('192.0.2.44', '192.0.2.0/24')).toBe(true);
    expect(ipMatchesRule('192.0.3.44', '192.0.2.0/24')).toBe(false);
    expect(ipMatchesRule('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(ipMatchesRule('172.16.0.42', '172.16.0.%')).toBe(true);
    expect(ipMatchesRule('172.16.1.42', '172.16.0.%')).toBe(false);
  });

  test('active allowlist entries override block entries without granting auth', () => {
    const now = Date.now();
    expect(
      isIpAllowedByRules('203.0.113.10', [
        { kind: 'block', ipRange: '203.0.113.0/24', expiresAt: null },
        { kind: 'allow', ipRange: '203.0.113.10', expiresAt: now + 60_000 }
      ], now)
    ).toBe(true);
  });
});
