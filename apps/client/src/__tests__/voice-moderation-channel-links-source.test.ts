import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice media moderation and channel links webclient source contracts', () => {
  test('webclient exposes fork-only voice media moderation actions', () => {
    const actions = read('features/server/voice/actions.ts');
    expect(actions).toContain('export const stopUserVoiceMedia');
    expect(actions).toContain('client.voice.closeUserProducer.mutate');
    expect(actions).toContain('voiceUserMediaModeration');
  });

  test('webclient exposes fork-only channel link resolver/copy action', () => {
    const actions = read('features/server/channels/actions.ts');
    expect(actions).toContain('export const resolveChannelLink');
    expect(actions).toContain('client.channels.resolveLink.query');
    expect(actions).toContain('channelLinks');
  });
});
