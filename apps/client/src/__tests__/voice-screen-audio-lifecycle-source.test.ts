import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('screen-share audio lifecycle source contracts', () => {
  test('cleans screen audio producer and local stream on every screen-share exit path', () => {
    const provider = read('components/voice-provider/index.tsx');

    expect(provider).toContain('localScreenShareAudioProducer.current?.close()');
    expect(provider).toContain('localScreenShareAudioProducer.current = undefined');
    expect(provider).toContain('setLocalScreenShareAudio(undefined)');
    expect(provider).toContain('kind: StreamKind.SCREEN_AUDIO');
    expect(provider).toContain('setLocalScreenShareAudio(new MediaStream([audioTrack]))');
  });

  test('uses dedicated screen-share simulcast encodings and persisted quality', () => {
    const provider = read('components/voice-provider/index.tsx');
    const helpers = read('components/voice-provider/helpers.ts');
    const transports = read('components/voice-provider/hooks/use-transports.ts');

    expect(provider).toContain('getScreenShareSimulcastEncodings');
    expect(helpers).toContain('const getScreenShareSimulcastEncodings');
    expect(helpers).toContain("index === 0 ? 'Low'");
    expect(transports).toContain('getStoredStreamQuality(remoteId, kind, qualityLayers)');
  });
});