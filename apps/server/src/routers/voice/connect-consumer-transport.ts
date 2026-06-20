import { Permission } from '@sharkord/shared';
import { z } from 'zod';
import { getCurrentVoiceRuntime } from './current-runtime';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const connectConsumerTransportRoute = protectedProcedure
  .input(
    z.object({
      dtlsParameters: z.any()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const runtime = getCurrentVoiceRuntime(ctx.user.id);

    const consumerTransport = runtime.getConsumerTransport(ctx.user.id);

    invariant(consumerTransport, {
      code: 'NOT_FOUND',
      message: 'Consumer transport not found'
    });

    await consumerTransport.connect({ dtlsParameters: input.dtlsParameters });
  });

export { connectConsumerTransportRoute };
