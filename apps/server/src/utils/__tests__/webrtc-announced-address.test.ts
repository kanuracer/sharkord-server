import { describe, expect, test } from 'bun:test';
import { normalizeWebRtcAnnouncedAddress } from '../webrtc-announced-address';

describe('normalizeWebRtcAnnouncedAddress', () => {
  test('accepts plain FQDN and IPv4 values unchanged', () => {
    expect(normalizeWebRtcAnnouncedAddress('voice.example.com')).toBe('voice.example.com');
    expect(normalizeWebRtcAnnouncedAddress('203.0.113.10')).toBe('203.0.113.10');
  });

  test('strips protocol path and port from URL-style FQDN input', () => {
    expect(normalizeWebRtcAnnouncedAddress('https://voice.example.com:40000/rtc')).toBe('voice.example.com');
    expect(normalizeWebRtcAnnouncedAddress('  voice.example.com:40000  ')).toBe('voice.example.com');
  });

  test('normalizes bracketed IPv6 with optional port for mediasoup ICE candidates', () => {
    expect(normalizeWebRtcAnnouncedAddress('[2001:db8::1234]:40000')).toBe('2001:db8::1234');
    expect(normalizeWebRtcAnnouncedAddress('https://[2001:db8::1234]:40000/voice')).toBe('2001:db8::1234');
  });

  test('keeps empty values empty so production fallback can use public IP discovery', () => {
    expect(normalizeWebRtcAnnouncedAddress('')).toBe('');
    expect(normalizeWebRtcAnnouncedAddress(undefined)).toBe('');
  });
});
