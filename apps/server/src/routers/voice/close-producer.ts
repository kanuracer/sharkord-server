import { Permission, ServerEvents, StreamKind } from '@sharkord/shared';
import z from 'zod';
import { logger } from '../../logger';
import { getCurrentVoiceRuntime } from './current-runtime';
import { protectedProcedure } from '../../utils/trpc';

const closeProducerRoute = protectedProcedure
  .input(
    z.object({
      kind: z.enum(StreamKind)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const runtime = getCurrentVoiceRuntime(ctx.user.id);
    const currentVoiceChannelId = runtime.id;

    const producer = runtime.getProducer(input.kind, ctx.user.id);

    if (!producer) {
      logger.debug(
        'Ignoring closeProducer for %s/%s: producer already missing',
        ctx.user.name,
        input.kind
      );
      return;
    }

    runtime.removeProducer(ctx.user.id, input.kind);

    ctx.pubsub.publishForChannel(
      currentVoiceChannelId,
      ServerEvents.VOICE_PRODUCER_CLOSED,
      {
        channelId: currentVoiceChannelId,
        remoteId: ctx.user.id,
        kind: input.kind
      }
    );
  });

export { closeProducerRoute };
