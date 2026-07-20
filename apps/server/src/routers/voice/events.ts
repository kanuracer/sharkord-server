import { ServerEvents, type StreamKind, type TFile } from '@sharkord/shared';
import { observable } from '@trpc/server/observable';
import { VoiceRuntime } from '../../runtimes/voice';
import { protectedProcedure } from '../../utils/trpc';

type TVoiceProducerEvent = {
  channelId: number;
  remoteId: number;
  kind: StreamKind;
};

// these events are broadcast to ALL users (for UI population in the sidebar)
const onUserJoinVoiceRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_JOIN_VOICE);
  }
);

const onUserLeaveVoiceRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_LEAVE_VOICE);
  }
);

const onUserDisconnectVoiceRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribeFor(
      ctx.userId,
      ServerEvents.USER_DISCONNECT_VOICE
    );
  }
);

const onUserMovedVoiceRoute = protectedProcedure.subscription(async ({ ctx }) => {
  return ctx.pubsub.subscribeFor(ctx.userId, ServerEvents.USER_VOICE_MOVED);
});

const onUserUpdateVoiceStateRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.USER_VOICE_STATE_UPDATE);
  }
);

// these events are broadcast to ALL users (for external stream UI in the sidebar)
const onVoiceAddExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_ADD_EXTERNAL_STREAM);
  }
);

const onVoiceUpdateExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_UPDATE_EXTERNAL_STREAM);
  }
);

const onVoiceRemoveExternalStreamRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    return ctx.pubsub.subscribe(ServerEvents.VOICE_REMOVE_EXTERNAL_STREAM);
  }
);

// these events are channel-scoped (only sent to users in the same voice channel)
// they relate to actual media streaming, not UI state
const onVoiceNewProducerRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    if (!ctx.currentVoiceChannelId) {
      return observable<TVoiceProducerEvent>(() => () => {});
    }

    return ctx.pubsub.subscribeForChannel(
      ctx.currentVoiceChannelId,
      ServerEvents.VOICE_NEW_PRODUCER
    );
  }
);

const onVoiceProducerClosedRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    if (!ctx.currentVoiceChannelId) {
      return observable<TVoiceProducerEvent>(() => () => {});
    }

    return ctx.pubsub.subscribeForChannel(
      ctx.currentVoiceChannelId,
      ServerEvents.VOICE_PRODUCER_CLOSED
    );
  }
);

const onVoiceReactionRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    const runtime = VoiceRuntime.findRuntimeByUserId(ctx.userId);

    if (!runtime) {
      return observable<{
        channelId: number;
        userId: number;
        emoji: string;
        file?: TFile | null;
        expiresAt: number;
      }>(() => () => {});
    }

    return ctx.pubsub.subscribeForChannel(
      runtime.id,
      ServerEvents.VOICE_REACTION
    );
  }
);

const onVoiceSoundboardRoute = protectedProcedure.subscription(
  async ({ ctx }) => {
    const runtime = VoiceRuntime.findRuntimeByUserId(ctx.userId);

    if (!runtime) {
      return observable<{
        channelId: number;
        userId: number;
        soundId: string;
        createdAt: number;
      }>(() => () => {});
    }

    return ctx.pubsub.subscribeForChannel(
      runtime.id,
      ServerEvents.VOICE_SOUNDBOARD
    );
  }
);

export {
  onUserDisconnectVoiceRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserMovedVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onVoiceAddExternalStreamRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute,
  onVoiceReactionRoute,
  onVoiceRemoveExternalStreamRoute,
  onVoiceSoundboardRoute,
  onVoiceUpdateExternalStreamRoute
};
