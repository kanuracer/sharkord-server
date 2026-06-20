import {
  ChannelPermission,
  getMediasoupKind,
  Permission,
  ServerEvents,
  StreamKind
} from '@sharkord/shared';
import { z } from 'zod';
import { getCurrentVoiceRuntime } from './current-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const produceRoute = protectedProcedure
  .input(
    z.object({
      transportId: z.string(),
      kind: z.enum(StreamKind),
      rtpParameters: z.any(),
      qualityLayers: z
        .array(
          z.object({
            spatialLayer: z.number().int().nonnegative(),
            label: z.string().trim().min(1)
          })
        )
        .optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const runtime = getCurrentVoiceRuntime(ctx.user.id);
    const currentVoiceChannelId = runtime.id;

    if (input.kind === StreamKind.AUDIO) {
      await ctx.needsChannelPermission(
        currentVoiceChannelId,
        ChannelPermission.SPEAK
      );
    } else if (input.kind === StreamKind.VIDEO) {
      await ctx.needsChannelPermission(
        currentVoiceChannelId,
        ChannelPermission.WEBCAM
      );
    } else if (input.kind === StreamKind.SCREEN) {
      await ctx.needsChannelPermission(
        currentVoiceChannelId,
        ChannelPermission.SHARE_SCREEN
      );
    }

    const producerTransport = runtime.getProducerTransport(ctx.user.id);

    invariant(producerTransport, {
      code: 'NOT_FOUND',
      message: 'Producer transport not found'
    });

    const producer = await producerTransport.produce({
      kind: getMediasoupKind(input.kind),
      rtpParameters: input.rtpParameters,
      appData: { kind: input.kind, userId: ctx.user.id }
    });

    runtime.addProducer(ctx.user.id, input.kind, producer, input.qualityLayers);

    ctx.pubsub.publishForChannel(
      currentVoiceChannelId,
      ServerEvents.VOICE_NEW_PRODUCER,
      {
        channelId: currentVoiceChannelId,
        remoteId: ctx.user.id,
        kind: input.kind
      }
    );

    return producer.id;
  });

export { produceRoute };
