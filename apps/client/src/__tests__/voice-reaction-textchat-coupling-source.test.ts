import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice text-chat coupling and voice reactions client source contracts', () => {
  test('switching own voice channel retargets the open voice text-chat sidebar', () => {
    const actions = read('features/server/voice/actions.ts');
    expect(actions).toContain('retargetOpenVoiceChatSidebar(channelId)');
    expect(read('features/app/actions.ts')).toContain('export const retargetOpenVoiceChatSidebar');
  });

  test('voice reactions can be sent and rendered on voice cards', () => {
    expect(read('features/server/voice/actions.ts')).toContain('export const sendVoiceReaction');
    expect(read('features/server/voice/actions.ts')).toContain('client.voice.react.mutate');
    expect(read('features/server/voice/actions.ts')).toContain('onReaction.subscribe');
    expect(read('components/channel-view/voice/voice-user-card.tsx')).toContain('voiceReactionBadge');
    expect(read('components/channel-view/voice/controls-bar.tsx')).toContain('sendVoiceReaction');
  });
});
