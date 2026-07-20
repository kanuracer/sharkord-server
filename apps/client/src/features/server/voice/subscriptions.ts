import { logDebug } from '@/helpers/browser-logger';
import { getTRPCClient } from '@/lib/trpc';
import {
  addExternalStreamToVoiceChannel,
  addUserToVoiceChannel,
  removeExternalStreamFromVoiceChannel,
  removeUserFromVoiceChannel,
  reconnectMovedVoice,
  updateExternalStreamInVoiceChannel,
  updateVoiceUserState
} from './actions';
import type { RtpCapabilities } from 'mediasoup-client/types';

const subscribeToMovedVoice = (
  init: (routerRtpCapabilities: RtpCapabilities, channelId: number) => Promise<void>
) => {
  const trpc = getTRPCClient();
  const onMovedSub = trpc.voice.onMoved.subscribe(undefined, {
    onData: (payload) => {
      if (!payload || typeof payload !== 'object') {
        logDebug('[EVENTS] ignoring malformed voice.onMoved payload');
        return;
      }

      const { sourceChannelId, destinationChannelId } = payload;

      if (
        !Number.isSafeInteger(sourceChannelId) ||
        sourceChannelId <= 0 ||
        !Number.isSafeInteger(destinationChannelId) ||
        destinationChannelId <= 0
      ) {
        logDebug('[EVENTS] ignoring invalid voice.onMoved channel IDs', payload);
        return;
      }

      logDebug('[EVENTS] voice.onMoved', {
        sourceChannelId,
        destinationChannelId
      });
      void reconnectMovedVoice(sourceChannelId, destinationChannelId, init);
    },
    onError: (err) => console.error('onMoved voice subscription error:', err)
  });

  return () => onMovedSub.unsubscribe();
};

const subscribeToVoice = () => {
  const trpc = getTRPCClient();

  const onUserJoinVoiceSub = trpc.voice.onJoin.subscribe(undefined, {
    onData: ({ channelId, userId, state }) => {
      logDebug('[EVENTS] voice.onJoin', { channelId, userId, state });
      addUserToVoiceChannel(userId, channelId, state);
    },
    onError: (err) => console.error('onUserJoinVoice subscription error:', err)
  });

  const onUserLeaveVoiceSub = trpc.voice.onLeave.subscribe(undefined, {
    onData: ({ channelId, userId }) => {
      logDebug('[EVENTS] voice.onLeave', { channelId, userId });
      removeUserFromVoiceChannel(userId, channelId);
    },
    onError: (err) => console.error('onUserLeaveVoice subscription error:', err)
  });

  const onUserUpdateVoiceSub = trpc.voice.onUpdateState.subscribe(undefined, {
    onData: ({ channelId, userId, state }) => {
      logDebug('[EVENTS] voice.onUpdateState', { channelId, userId, state });
      updateVoiceUserState(userId, channelId, state);
    },
    onError: (err) =>
      console.error('onUserUpdateVoice subscription error:', err)
  });

  const onVoiceAddExternalStreamSub = trpc.voice.onAddExternalStream.subscribe(
    undefined,
    {
      onData: ({ channelId, streamId, stream }) => {
        logDebug('[EVENTS] voice.onAddExternalStream', {
          channelId,
          streamId,
          stream
        });
        addExternalStreamToVoiceChannel(channelId, streamId, stream);
      },
      onError: (err) =>
        console.error('onVoiceAddExternalStreamSub subscription error:', err)
    }
  );

  const onVoiceUpdateExternalStreamSub =
    trpc.voice.onUpdateExternalStream.subscribe(undefined, {
      onData: ({ channelId, streamId, stream }) => {
        logDebug('[EVENTS] voice.onUpdateExternalStream', {
          channelId,
          streamId,
          stream
        });
        updateExternalStreamInVoiceChannel(channelId, streamId, stream);
      },
      onError: (err) =>
        console.error('onVoiceUpdateExternalStreamSub subscription error:', err)
    });

  const onVoiceRemoveExternalStreamSub =
    trpc.voice.onRemoveExternalStream.subscribe(undefined, {
      onData: ({ channelId, streamId }) => {
        logDebug('[EVENTS] voice.onRemoveExternalStream', {
          channelId,
          streamId
        });
        removeExternalStreamFromVoiceChannel(channelId, streamId);
      },
      onError: (err) =>
        console.error('onVoiceRemoveExternalStreamSub subscription error:', err)
    });

  return () => {
    onUserJoinVoiceSub.unsubscribe();
    onUserLeaveVoiceSub.unsubscribe();
    onUserUpdateVoiceSub.unsubscribe();
    onVoiceAddExternalStreamSub.unsubscribe();
    onVoiceUpdateExternalStreamSub.unsubscribe();
    onVoiceRemoveExternalStreamSub.unsubscribe();
  };
};

export { subscribeToMovedVoice, subscribeToVoice };
