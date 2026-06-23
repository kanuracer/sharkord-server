import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice soundboard and media recovery source contracts', () => {
  test('server exposes fork-only soundboard and media recovery capabilities', () => {
    const capabilities = read('routers/desktop/capabilities.ts');
    expect(capabilities).toContain('voiceSoundboard: true');
    expect(capabilities).toContain('voiceMediaRecovery: true');
  });

  test('soundboard has route, scoped subscription, and shared event', () => {
    expect(read('../../../packages/shared/src/events.ts')).toContain(
      "VOICE_SOUNDBOARD = 'voiceSoundboard'"
    );
    expect(read('routers/voice/index.ts')).toContain(
      'playSoundboard: playSoundboardRoute'
    );
    expect(read('routers/voice/events.ts')).toContain('onVoiceSoundboardRoute');
    const route = read('routers/voice/play-soundboard.ts');
    expect(route).toContain('VoiceRuntime.findRuntimeByUserId(ctx.user.id)');
    expect(route).toContain(
      'publishForChannel(runtime.id, ServerEvents.VOICE_SOUNDBOARD'
    );
    expect(route).toContain('soundId: input.soundId');
  });

  test('media recovery route closes stale media without forcing a voice leave', () => {
    expect(read('routers/voice/index.ts')).toContain(
      'recoverMedia: recoverMediaRoute'
    );
    const route = read('routers/voice/recover-media.ts');
    expect(route).toContain('runtime.recoverUserMedia(ctx.user.id)');
    expect(route).toContain('VOICE_PRODUCER_CLOSED');
    const runtime = read('runtimes/voice.ts');
    expect(runtime).toContain('public recoverUserMedia');
    expect(runtime).toContain('StreamKind.SCREEN_AUDIO');
  });
});
