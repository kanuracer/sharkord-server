import { Permission } from '@sharkord/shared';
import { getCurrentVoiceRuntime } from './current-runtime';
import { protectedProcedure } from '../../utils/trpc';

const createProducerTransportRoute = protectedProcedure.mutation(
  async ({ ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const runtime = getCurrentVoiceRuntime(ctx.user.id);

    const params = await runtime.createProducerTransport(ctx.user.id);

    return params;
  }
);

export { createProducerTransportRoute };
