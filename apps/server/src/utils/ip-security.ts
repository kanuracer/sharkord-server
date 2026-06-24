import type http from 'http';
import ipaddr from 'ipaddr.js';

const MAX_IP_CANDIDATES = 20;
const MAX_HEADER_LENGTH = 2048;
const DIRECT_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'cf-real-ip',
  'x-real-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'fly-client-ip',
  'fastly-client-ip'
];

type TIpRuleLike = {
  kind: string;
  ipRange: string;
  expiresAt?: number | null;
};

type TResolveTrustedClientIpInput = {
  headers?: http.IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  remoteAddress?: string;
  trustedProxies?: string[];
};

const toCanonical = (
  parsed: ipaddr.IPv4 | ipaddr.IPv6
): ipaddr.IPv4 | ipaddr.IPv6 => {
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return v6.toIPv4Address();
  }
  return parsed;
};

const normalizeClientIp = (value: string): string | undefined => {
  try {
    let candidate = value.trim();

    if (!candidate) return undefined;

    if (candidate.toLowerCase().startsWith('for=')) {
      candidate = candidate.slice(4).trim();
    }

    candidate = candidate.replace(/^["']|["']$/g, '');

    if (candidate.startsWith('[') && candidate.includes(']')) {
      candidate = candidate.slice(1, candidate.indexOf(']'));
    }

    const colonCount = candidate.split(':').length - 1;

    if (colonCount === 1 && candidate.includes('.')) {
      const host = candidate.slice(0, candidate.indexOf(':'));
      if (ipaddr.isValid(host)) {
        candidate = host;
      }
    }

    if (!ipaddr.isValid(candidate)) return undefined;

    return toCanonical(ipaddr.parse(candidate)).toString();
  } catch {
    return undefined;
  }
};

const normalizeWildcardIpRange = (value: string): string | undefined => {
  if (!/[\*%]/.test(value)) return undefined;

  const parts = value.trim().split('.');
  if (parts.length !== 4) return undefined;

  const firstWildcard = parts.findIndex((part) => part === '*' || part === '%');
  if (firstWildcard < 0) return undefined;

  if (!parts.slice(firstWildcard).every((part) => part === '*' || part === '%')) {
    return undefined;
  }

  const normalizedParts = parts.map((part, index) => {
    if (index >= firstWildcard) return '0';
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) return undefined;
    return String(parsed);
  });

  if (normalizedParts.some((part) => part === undefined)) return undefined;

  return `${normalizedParts.join('.')}/${firstWildcard * 8}`;
};

const normalizeIpRange = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const wildcardRange = normalizeWildcardIpRange(trimmed);
  if (wildcardRange) return wildcardRange;

  if (!trimmed.includes('/')) {
    return normalizeClientIp(trimmed);
  }

  try {
    const [addr, prefixRaw] = trimmed.split('/');
    if (!addr || !prefixRaw) return undefined;

    const ip = toCanonical(ipaddr.parse(addr.trim()));
    const prefix = Number(prefixRaw);
    const maxPrefix = ip.kind() === 'ipv4' ? 32 : 128;

    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return undefined;
    }

    return `${ip.toString()}/${prefix}`;
  } catch {
    return undefined;
  }
};

const getHeaderValue = (
  headers: TResolveTrustedClientIpInput['headers'] = {},
  name: string
): string | undefined => {
  const value = headers[name] ?? headers[name.toLowerCase()];

  if (!value) return undefined;

  let result: string;

  if (Array.isArray(value)) {
    result = value
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
  } else {
    result = value.trim();
  }

  if (!result || result.length > MAX_HEADER_LENGTH) return undefined;

  return result;
};

const splitCommaSeparated = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, MAX_IP_CANDIDATES);

const isPublicIp = (ip: string): boolean => {
  try {
    return toCanonical(ipaddr.parse(ip)).range() === 'unicast';
  } catch {
    return false;
  }
};

const pickBestIp = (candidates: string[]): string | undefined => {
  const normalized = candidates
    .slice(0, MAX_IP_CANDIDATES)
    .map(normalizeClientIp)
    .filter((ip): ip is string => Boolean(ip));

  if (!normalized.length) return undefined;

  return normalized.find(isPublicIp) ?? normalized[0];
};

const extractForwardedCandidates = (value: string): string[] =>
  value
    .split(',')
    .flatMap((entry) =>
      entry
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p.toLowerCase().startsWith('for='))
        .map((p) => p.slice(4))
    )
    .slice(0, MAX_IP_CANDIDATES);

const ipMatchesRule = (ip: string, ruleRange: string): boolean => {
  const normalizedIp = normalizeClientIp(ip);
  const normalizedRange = normalizeIpRange(ruleRange);

  if (!normalizedIp || !normalizedRange) return false;

  try {
    const parsedIp = toCanonical(ipaddr.parse(normalizedIp));

    if (!normalizedRange.includes('/')) {
      return parsedIp.toString() === normalizedRange;
    }

    const [rangeIp, prefixRaw] = normalizedRange.split('/');
    if (!rangeIp || !prefixRaw) return false;

    const parsedRangeIp = toCanonical(ipaddr.parse(rangeIp));
    const prefix = Number(prefixRaw);

    if (parsedIp.kind() !== parsedRangeIp.kind()) return false;

    return parsedIp.match(parsedRangeIp, prefix);
  } catch {
    return false;
  }
};

const isRuleActive = (rule: Pick<TIpRuleLike, 'expiresAt'>, now = Date.now()) =>
  !rule.expiresAt || rule.expiresAt > now;

const findMatchingIpRule = <T extends TIpRuleLike>(
  ip: string | undefined,
  rules: T[],
  kind: 'allow' | 'block',
  now = Date.now()
): T | undefined => {
  if (!ip) return undefined;

  return rules.find(
    (rule) =>
      rule.kind === kind && isRuleActive(rule, now) && ipMatchesRule(ip, rule.ipRange)
  );
};

const isIpAllowedByRules = (
  ip: string | undefined,
  rules: TIpRuleLike[],
  now = Date.now()
): boolean => Boolean(findMatchingIpRule(ip, rules, 'allow', now));

const isTrustedProxyIp = (remoteAddress: string | undefined, trustedProxies: string[]) => {
  const normalizedRemote = normalizeClientIp(remoteAddress ?? '');
  if (!normalizedRemote) return false;

  return trustedProxies.some((rule) => ipMatchesRule(normalizedRemote, rule));
};

const getForwardedIp = (headers: TResolveTrustedClientIpInput['headers']) => {
  for (const header of DIRECT_HEADERS) {
    const value = getHeaderValue(headers, header);
    if (!value) continue;

    const ip = pickBestIp(splitCommaSeparated(value));
    if (ip) return ip;
  }

  const xForwardedFor = getHeaderValue(headers, 'x-forwarded-for');
  if (xForwardedFor) {
    const ip = pickBestIp(splitCommaSeparated(xForwardedFor));
    if (ip) return ip;
  }

  const forwarded = getHeaderValue(headers, 'forwarded');
  if (forwarded) {
    const ip = pickBestIp(extractForwardedCandidates(forwarded));
    if (ip) return ip;
  }

  return undefined;
};

const resolveTrustedClientIp = ({
  headers,
  remoteAddress,
  trustedProxies = []
}: TResolveTrustedClientIpInput): string | undefined => {
  const socketIp = normalizeClientIp(remoteAddress ?? '');

  if (trustedProxies.length > 0 && isTrustedProxyIp(socketIp, trustedProxies)) {
    return getForwardedIp(headers) ?? socketIp;
  }

  return socketIp;
};

export {
  findMatchingIpRule,
  ipMatchesRule,
  isIpAllowedByRules,
  isRuleActive,
  normalizeClientIp,
  normalizeIpRange,
  resolveTrustedClientIp
};
export type { TIpRuleLike };
