import { parseCustomEmojiReactionValue, ServerEvents } from '@sharkord/shared';
import { z } from 'zod';
import { getEmojiById } from '../../db/queries/emojis';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const MAX_VOICE_REACTION_LENGTH = 96;
const VOICE_REACTION_TTL_MS = 5_000;

const reactVoiceRoute = protectedProcedure
  .input(
    z.object({
      emoji: z.string().trim().min(1).max(MAX_VOICE_REACTION_LENGTH)
    })
  )
  .mutation(async ({ input, ctx }) => {
    const runtime = VoiceRuntime.findRuntimeByUserId(ctx.user.id);

    invariant(runtime, {
      code: 'BAD_REQUEST',
      message: 'User is not in a voice channel'
    });

    const customEmoji = parseCustomEmojiReactionValue(input.emoji);
    const emoji = customEmoji ? await getEmojiById(customEmoji.id) : undefined;

    invariant(!customEmoji || (emoji && emoji.name === customEmoji.name), {
      code: 'BAD_REQUEST',
      message: 'Custom emoji not found.'
    });

    ctx.pubsub.publishForChannel(runtime.id, ServerEvents.VOICE_REACTION, {
      channelId: runtime.id,
      userId: ctx.user.id,
      emoji: input.emoji,
      file: emoji?.file ?? null,
      expiresAt: Date.now() + VOICE_REACTION_TTL_MS
    });
  });

export { reactVoiceRoute };
