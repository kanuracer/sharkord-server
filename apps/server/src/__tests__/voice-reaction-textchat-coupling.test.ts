import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice text-chat coupling and voice reactions source contracts', () => {
  test('server exposes fork-only voice reaction event, router procedure, and capability', () => {
    expect(read('../../../packages/shared/src/events.ts')).toContain("VOICE_REACTION = 'voiceReaction'");
    expect(read('routers/voice/index.ts')).toContain('react: reactVoiceRoute');
    expect(read('routers/voice/events.ts')).toContain('onVoiceReactionRoute');
    expect(read('routers/desktop/capabilities.ts')).toContain('voiceReactions: true');
  });

  test('voice reactions are scoped to current voice runtime/channel', () => {
    const react = read('routers/voice/react.ts');
    expect(react).toContain('VoiceRuntime.findRuntimeByUserId(ctx.user.id)');
    expect(react).toContain('publishForChannel(runtime.id, ServerEvents.VOICE_REACTION');
    expect(react).toContain('channelId: runtime.id');
  });

  test('voice channel text chat is blocked unless user is in that voice channel', () => {
    const guard = read('helpers/assert-voice-text-chat-access.ts');
    expect(guard).toContain('VoiceRuntime.findRuntimeByUserId(ctx.user.id)');
    expect(guard).toContain('!runtime || runtime.id === channelId');
    expect(read('routers/messages/send-message.ts')).toContain('assertVoiceTextChatAccess(ctx, input.channelId)');
    expect(read('routers/messages/get-messages.ts')).toContain('assertVoiceTextChatAccess(ctx, input.channelId)');
    expect(read('routers/messages/signal-typing.ts')).toContain('assertVoiceTextChatAccess(ctx, input.channelId)');
    expect(read('routers/desktop/capabilities.ts')).toContain('voiceTextChatCoupling: true');
  });
});
