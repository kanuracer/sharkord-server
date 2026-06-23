const stripTrailingDot = (value: string) => value.replace(/\.$/, '');

const normalizeWebRtcAnnouncedAddress = (value?: string | null): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw.includes('://') ? raw : `webrtc://${raw}`);
    return stripTrailingDot(parsed.hostname.replace(/^\[(.*)]$/, '$1'));
  } catch {
    // Fall through to conservative parsing for values URL cannot parse.
  }

  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end > 0) return raw.slice(1, end);
  }

  const withoutPath = raw.split(/[/?#]/, 1)[0] ?? raw;
  const colonCount = (withoutPath.match(/:/g) ?? []).length;
  if (colonCount === 1) return stripTrailingDot(withoutPath.split(':')[0] ?? withoutPath);
  return stripTrailingDot(withoutPath);
};

export { normalizeWebRtcAnnouncedAddress };
