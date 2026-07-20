import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice member move drag-and-drop client source contracts', () => {
  test('uses the authoritative move mutation without faking a voice map move', () => {
    const actions = read('features/server/voice/actions.ts');

    expect(actions).toContain("export const VOICE_USER_DND_MIME = 'application/x-sharkord-voice-user'");
    expect(actions).toContain('export const moveUserToVoiceChannel');
    expect(actions).toContain('client.voice.moveUser.mutate({ userId, destinationChannelId: channelId })');
    expect(actions).not.toMatch(/moveUserToVoiceChannel[\s\S]{0,600}voiceMap/);
  });

  test('reconnects only matching directed moves through normal join/provider init and cleans failures', () => {
    const subscriptions = read('features/server/voice/subscriptions.ts');
    const provider = read('components/voice-provider/index.tsx');
    const actions = read('features/server/voice/actions.ts');

    expect(subscriptions).toContain('trpc.voice.onMoved.subscribe');
    expect(subscriptions).toContain('sourceChannelId');
    expect(subscriptions).toContain('Number.isSafeInteger(sourceChannelId)');
    expect(subscriptions).toContain('reconnectMovedVoice(sourceChannelId, destinationChannelId, init)');
    expect(provider).toContain('subscribeToMovedVoice(init)');
    expect(actions).toContain('currentVoiceChannelId !== sourceChannelId');
    expect(actions).toContain('joinVoice(channel.id)');
    expect(actions).toContain('await init(response, channel.id)');
    expect(actions).toContain("await leaveVoice({ reason: 'directed_move_init_failed' })");
    expect(actions).toContain('setCurrentVoiceChannelId(channelId);');
    expect(actions.indexOf('setCurrentVoiceChannelId(channelId);')).toBeGreaterThan(
      actions.indexOf('await client.voice.join.mutate')
    );
    expect(subscriptions).not.toMatch(/onMoved[\s\S]{0,650}voiceMap/);
  });

  test('serializes directed moves and exposes context actions to keyboard users', () => {
    const actions = read('features/server/voice/actions.ts');
    const user = read('components/left-sidebar/voice-user.tsx');

    expect(actions).toContain('let movedVoiceReconnectQueue = Promise.resolve();');
    expect(actions).toContain('movedVoiceReconnectQueue = reconnect.catch(() => undefined);');
    expect(user).toContain('tabIndex={0}');
    expect(user).toContain("event.key !== 'ContextMenu'");
    expect(user).toContain("event.key === 'F10'");
    expect(user).toContain("new MouseEvent('contextmenu'");
  });

  test('allows privileged native member drags and validates voice-only drops', () => {
    const user = read('components/left-sidebar/voice-user.tsx');
    const channels = read('components/left-sidebar/channels.tsx');

    expect(user).toContain('Permission.MOVE_MEMBERS');
    expect(user).toContain('draggable={canMoveUser}');
    expect(user).toContain('VOICE_USER_DND_MIME');
    expect(user).toContain('JSON.stringify({ userId: user.id, sourceChannelId })');
    expect(channels).toContain('VOICE_USER_DND_MIME');
    expect(channels).toContain('onDragOver={onVoiceUserDragOver}');
    expect(channels).toContain('onDrop={onVoiceUserDrop}');
    expect(channels).toContain("channel.type === 'VOICE'");
    expect(channels).toContain('sourceChannelId === channel.id');
    expect(channels).toContain('await moveUserToVoiceChannel(userId, channel.id)');
  });
});
