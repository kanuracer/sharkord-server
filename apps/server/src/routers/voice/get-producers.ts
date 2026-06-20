import { Permission } from '@sharkord/shared';
import { getCurrentVoiceRuntime } from './current-runtime';
import { protectedProcedure } from '../../utils/trpc';

const getProducersRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

  const runtime = getCurrentVoiceRuntime(ctx.user.id);

  return runtime.getRemoteIds(ctx.user.id);
});

export { getProducersRoute };
