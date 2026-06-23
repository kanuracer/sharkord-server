import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('custom emoji reaction id source contracts', () => {
  test('custom emoji picker items carry stable ids and reactions use canonical custom keys', () => {
    expect(read('components/tiptap-input/helpers.ts')).toContain(
      'customEmojiReactionValue'
    );
    expect(read('features/server/emojis/selectors.ts')).toContain(
      'customId: emoji.id'
    );
    expect(read('components/channel-view/text/message-actions.tsx')).toContain(
      'customEmojiReactionValue(emoji)'
    );
    expect(
      read('components/channel-view/text/message-reactions.tsx')
    ).toContain('customEmojiReactionName');
  });

  test('voice reactions can reuse recent custom emoji ids and render custom image badges', () => {
    expect(read('components/channel-view/voice/controls-bar.tsx')).toContain(
      'useRecentEmojis'
    );
    expect(read('components/channel-view/voice/controls-bar.tsx')).toContain(
      'customEmojiReactionValue(emoji)'
    );
    expect(read('features/server/voice/actions.ts')).toContain('file');
    expect(read('components/channel-view/voice/voice-user-card.tsx')).toContain(
      'voiceReaction.file'
    );
  });
});
