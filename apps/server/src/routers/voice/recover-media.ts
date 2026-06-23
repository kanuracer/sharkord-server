import { Permission, ServerEvents, StreamKind } from '@sharkord/shared';
import { protectedProcedure } from '../../utils/trpc';
import { getCurrentVoiceRuntime } from './current-runtime';

const recoverMediaRoute = protectedProcedure.mutation(async ({ ctx }) => {
  await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

  const runtime = getCurrentVoiceRuntime(ctx.user.id);
  const channelId = runtime.id;
  const recoveredKinds = runtime.recoverUserMedia(ctx.user.id);
  const consumerTransportReset = runtime.recoverUserConsumers(ctx.user.id);

  recoveredKinds.forEach((kind) => {
    ctx.pubsub.publishForChannel(
      channelId,
      ServerEvents.VOICE_PRODUCER_CLOSED,
      {
        channelId,
        remoteId: ctx.user.id,
        kind
      }
    );
  });

  if (
    recoveredKinds.includes(StreamKind.VIDEO) ||
    recoveredKinds.includes(StreamKind.SCREEN) ||
    recoveredKinds.includes(StreamKind.SCREEN_AUDIO)
  ) {
    ctx.pubsub.publish(ServerEvents.USER_VOICE_STATE_UPDATE, {
      channelId,
      userId: ctx.user.id,
      state: runtime.getUserState(ctx.user.id)
    });
  }

  return { recoveredKinds, consumerTransportReset };
});

export { recoverMediaRoute };
