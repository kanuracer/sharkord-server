import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice soundboard and recovery client source contracts', () => {
  test('webclient exposes fork-only soundboard and recovery actions', () => {
    const actions = read('features/server/voice/actions.ts');
    expect(actions).toContain('export const sendVoiceSoundboard');
    expect(actions).toContain('client.voice.playSoundboard.mutate');
    expect(actions).toContain('export const recoverVoiceMedia');
    expect(actions).toContain('client.voice.recoverMedia.mutate');
    expect(actions).toContain('onSoundboard.subscribe');
  });

  test('webclient renders soundboard and recover controls in voice toolbar', () => {
    const controls = read('components/channel-view/voice/controls-bar.tsx');
    expect(controls).toContain('sendVoiceSoundboard');
    expect(controls).toContain('recoverVoiceMedia');
    expect(controls).toContain('voiceSoundboard');
    expect(controls).toContain('voiceMediaRecovery');
  });
});
