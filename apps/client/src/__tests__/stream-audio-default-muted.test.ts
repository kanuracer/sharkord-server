import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

describe('stream audio defaults', () => {
  test('screen-share and external stream audio default to muted until explicit opt-in', () => {
    const source = readFileSync(
      path.resolve(
        import.meta.dir,
        '../components/voice-provider/volume-control-context.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('defaultVolumeForKey');
    expect(source).toMatch(/key\.startsWith\('userscreen-'\).*0/s);
    expect(source).toMatch(/key\.startsWith\('external-'\).*0/s);
    expect(source).toContain('volumes[key] ?? defaultVolumeForKey(key)');
    expect(source).toContain('prev[key] ?? defaultVolumeForKey(key)');
  });
});
