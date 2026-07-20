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

  test('reconnects a moved client through the normal voice join and provider init path', () => {
    const subscriptions = read('features/server/voice/subscriptions.ts');
    const provider = read('components/voice-provider/index.tsx');
    const actions = read('features/server/voice/actions.ts');

    expect(subscriptions).toContain('trpc.voice.onMoved.subscribe');
    expect(subscriptions).toContain('destinationChannelId');
    expect(subscriptions).toContain('reconnectMovedVoice');
    expect(provider).toContain('subscribeToMovedVoice(init)');
    expect(actions).toContain('joinVoice(channel.id)');
    expect(actions).toContain('await init(response, channel.id)');
    expect(subscriptions).not.toMatch(/onMoved[\s\S]{0,500}voiceMap/);
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
