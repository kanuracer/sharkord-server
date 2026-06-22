import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  readFileSync(path.resolve(import.meta.dir, '..', relativePath), 'utf8');

describe('DM hide and voice disconnect UI', () => {
  test('direct message sidebar hides conversations through dms.hide with confirmation', () => {
    const source = read('components/left-sidebar/direct-messages/index.tsx');

    expect(source).toContain('requestConfirmation');
    expect(source).toContain('hideDirectMessageTitle');
    expect(source).toContain('trpc.dms.hide.mutate');
    expect(source).toContain('setSelectedDmChannelId(undefined)');
    expect(source).toContain('directMessageHidden');
  });

  test('voice stream context menu can disconnect remote voice users', () => {
    const source = read('components/left-sidebar/stream-context-menu.tsx');

    expect(source).toContain('Permission.MOVE_MEMBERS');
    expect(source).toContain('disconnectUserFromVoiceTitle');
    expect(source).toContain('voice.disconnectUser.mutate');
    expect(source).toContain('ContextMenuItem variant="destructive"');
    expect(source).toContain('userDisconnectedFromVoice');
  });
});
