import { ChannelPermission, Permission, ServerEvents } from '@sharkord/shared';
import { z } from 'zod';
import { VoiceRuntime } from '../../runtimes/voice';
import { protectedProcedure } from '../../utils/trpc';

const playSoundboardRoute = protectedProcedure
  .input(
    z.object({
      soundId: z
        .enum(['pop', 'airhorn', 'rimshot', 'tada', 'bonk'])
        .default('pop')
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const runtime = VoiceRuntime.findRuntimeByUserId(ctx.user.id);
    if (!runtime) {
      throw new Error('You are not connected to voice');
    }

    await ctx.needsChannelPermission(runtime.id, ChannelPermission.SPEAK);

    ctx.pubsub.publishForChannel(runtime.id, ServerEvents.VOICE_SOUNDBOARD, {
      channelId: runtime.id,
      userId: ctx.user.id,
      soundId: input.soundId,
      createdAt: Date.now()
    });
  });

export { playSoundboardRoute };
