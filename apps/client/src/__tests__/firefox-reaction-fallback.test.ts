import { describe, expect, test } from 'bun:test';
import { shouldForceEmojiFallbackImages, shouldUseFallbackImage } from '../components/tiptap-input/helpers';

describe('Firefox/LibreWolf emoji fallback images', () => {
  const emoji = { name: 'party', shortcodes: ['tada'], emoji: '🎉', fallbackImage: 'https://example.invalid/tada.png' };

  test('forces fallback images in Firefox and LibreWolf when available', () => {
    expect(shouldForceEmojiFallbackImages('Mozilla/5.0 Firefox/126.0')).toBe(true);
    expect(shouldForceEmojiFallbackImages('Mozilla/5.0 LibreWolf/126.0')).toBe(true);
    expect(shouldUseFallbackImage(emoji, 'Mozilla/5.0 Firefox/126.0')).toBe(true);
  });

  test('keeps Chromium native emoji unless text-presentation fallback is needed', () => {
    expect(shouldForceEmojiFallbackImages('Mozilla/5.0 Chrome/126.0 Safari/537.36')).toBe(false);
    expect(shouldUseFallbackImage(emoji, 'Mozilla/5.0 Chrome/126.0 Safari/537.36')).toBe(false);
    expect(shouldUseFallbackImage({ ...emoji, emoji: '©' }, 'Mozilla/5.0 Chrome/126.0 Safari/537.36')).toBe(true);
  });
});
