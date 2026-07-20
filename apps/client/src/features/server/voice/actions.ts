import type { TPinnedCard } from '@/components/channel-view/voice/hooks/use-pin-card-controller';
import { retargetOpenVoiceChatSidebar } from '@/features/app/actions';
import { store } from '@/features/store';
import { logVoice } from '@/helpers/browser-logger';
import {
  LocalStorageKey,
  setLocalStorageItem,
  setLocalStorageItemBool
} from '@/helpers/storage';
import { getTRPCClient } from '@/lib/trpc';
import {
  ChannelType,
  getTrpcError,
  StreamKind,
  type TExternalStream,
  type TVoiceUserState
} from '@sharkord/shared';
import type { RtpCapabilities } from 'mediasoup-client/types';
import { toast } from 'sonner';
import {
  setCurrentVoiceChannelId,
  setSelectedChannelId
} from '../channels/actions';
import {
  channelByIdSelector,
  currentVoiceChannelIdSelector,
  selectedChannelIdSelector
} from '../channels/selectors';
import { serverSliceActions } from '../slice';
import { playSound } from '../sounds/actions';
import { SoundType } from '../types';
import { ownUserIdSelector } from '../users/selectors';
import { ownVoiceStateSelector } from './selectors';

export const VOICE_USER_DND_MIME = 'application/x-sharkord-voice-user';

let movedVoiceReconnectQueue = Promise.resolve();

export const addUserToVoiceChannel = (
  userId: number,
  channelId: number,
  voiceState: TVoiceUserState
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.addUserToVoiceChannel({
      userId,
      channelId,
      state: voiceState
    })
  );

  if (userId === ownUserId) {
    retargetOpenVoiceChatSidebar(channelId);
  }

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_JOINED_VOICE_CHANNEL);
  }
};

export const removeUserFromVoiceChannel = (
  userId: number,
  channelId: number
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  store.dispatch(
    serverSliceActions.removeUserFromVoiceChannel({ userId, channelId })
  );

  if (userId !== ownUserId && channelId === currentChannelId) {
    playSound(SoundType.REMOTE_USER_LEFT_VOICE_CHANNEL);
  }
};

export const addExternalStreamToVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.addExternalStreamToChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const updateExternalStreamInVoiceChannel = (
  channelId: number,
  streamId: number,
  stream: TExternalStream
): void => {
  store.dispatch(
    serverSliceActions.updateExternalStreamInChannel({
      channelId,
      streamId,
      stream
    })
  );
};

export const removeExternalStreamFromVoiceChannel = (
  channelId: number,
  streamId: number
): void => {
  store.dispatch(
    serverSliceActions.removeExternalStreamFromChannel({
      channelId,
      streamId
    })
  );
};

export const updateVoiceUserState = (
  userId: number,
  channelId: number,
  newState: Partial<TVoiceUserState>
): void => {
  const state = store.getState();
  const ownUserId = ownUserIdSelector(state);
  const currentChannelId = currentVoiceChannelIdSelector(state);

  if (userId !== ownUserId && channelId === currentChannelId) {
    const currentUserState = state.server.voiceMap[channelId]?.users[userId];

    if (newState.sharingScreen === true && !currentUserState?.sharingScreen) {
      playSound(SoundType.REMOTE_USER_STARTED_SCREENSHARE);
    } else if (
      newState.sharingScreen === false &&
      currentUserState?.sharingScreen
    ) {
      playSound(SoundType.REMOTE_USER_STOPPED_SCREENSHARE);
    }
  }

  store.dispatch(
    serverSliceActions.updateVoiceUserState({ userId, channelId, newState })
  );
};

export const updateOwnVoiceState = (
  newState: Partial<TVoiceUserState>
): void => {
  store.dispatch(serverSliceActions.updateOwnVoiceState(newState));
};

export const joinVoice = async (
  channelId: number
): Promise<RtpCapabilities | undefined> => {
  const state = store.getState();
  const currentChannelId = currentVoiceChannelIdSelector(state);

  if (channelId === currentChannelId) {
    // already in the desired channel
    return undefined;
  }

  if (currentChannelId) {
    // is already in a voice channel, leave it first
    await leaveVoice({ reason: 'switch_channel' });
  }

  const { micMuted, soundMuted } = ownVoiceStateSelector(state);
  const client = getTRPCClient();

  try {
    const { routerRtpCapabilities } = await client.voice.join.mutate({
      channelId,
      state: { micMuted, soundMuted }
    });

    setCurrentVoiceChannelId(channelId);
    retargetOpenVoiceChatSidebar(channelId);

    return routerRtpCapabilities;
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to join voice channel'));
  }

  return undefined;
};

export const moveUserToVoiceChannel = async (
  userId: number,
  channelId: number
): Promise<boolean> => {
  const client = getTRPCClient();

  try {
    await client.voice.moveUser.mutate({ userId, destinationChannelId: channelId });
    return true;
  } catch (error) {
    logVoice('Failed to move voice user', { error, userId, channelId });
    toast.error(getTrpcError(error, 'Failed to move voice user'));
    return false;
  }
};

export const reconnectMovedVoice = (
  sourceChannelId: number,
  destinationChannelId: number,
  init: (routerRtpCapabilities: RtpCapabilities, channelId: number) => Promise<void>
): Promise<void> => {
  const reconnect = movedVoiceReconnectQueue.then(() =>
    reconnectMovedVoiceNow(sourceChannelId, destinationChannelId, init)
  );
  movedVoiceReconnectQueue = reconnect.catch(() => undefined);
  return reconnect;
};

const reconnectMovedVoiceNow = async (
  sourceChannelId: number,
  destinationChannelId: number,
  init: (routerRtpCapabilities: RtpCapabilities, channelId: number) => Promise<void>
): Promise<void> => {
  const state = store.getState();
  const currentVoiceChannelId = currentVoiceChannelIdSelector(state);

  if (currentVoiceChannelId !== sourceChannelId) {
    logVoice('Ignoring stale directed voice move', {
      sourceChannelId,
      destinationChannelId,
      currentVoiceChannelId
    });
    return;
  }

  const channel = channelByIdSelector(state, destinationChannelId);

  if (!channel || channel.type !== ChannelType.VOICE) {
    logVoice('Ignoring moved voice event for unavailable voice channel', {
      sourceChannelId,
      destinationChannelId
    });
    return;
  }

  logVoice('Reconnecting after directed voice move', {
    sourceChannelId,
    destinationChannelId
  });
  setSelectedChannelId(channel.id);
  const response = await joinVoice(channel.id);

  if (!response) {
    setSelectedChannelId(undefined);
    logVoice('Failed to join directed voice move destination', {
      sourceChannelId,
      destinationChannelId
    });
    return;
  }

  try {
    await init(response, channel.id);
  } catch (error) {
    await leaveVoice({ reason: 'directed_move_init_failed' });
    logVoice('Failed to initialize directed voice move destination', {
      error,
      sourceChannelId,
      destinationChannelId
    });
    toast.error('Failed to initialize voice connection');
  }
};

export type TLeaveVoiceReason =
  | 'user_disconnect_button'
  | 'switch_channel'
  | 'directed_move_init_failed'
  | 'unknown';

export const leaveVoice = async (options?: {
  reason?: TLeaveVoiceReason;
}): Promise<void> => {
  const state = store.getState();
  const currentChannelId = currentVoiceChannelIdSelector(state);
  const selectedChannelId = selectedChannelIdSelector(state);
  const reason = options?.reason ?? 'unknown';

  if (!currentChannelId) {
    logVoice('Leave voice requested without active channel', { reason });
    return;
  }

  logVoice('Leave voice requested', {
    reason,
    channelId: currentChannelId,
    selectedChannelId
  });

  if (selectedChannelId === currentChannelId) {
    setSelectedChannelId(undefined);
  }

  setCurrentVoiceChannelId(undefined);
  updateOwnVoiceState({ webcamEnabled: false, sharingScreen: false });
  setPinnedCard(undefined);

  const client = getTRPCClient();

  try {
    await client.voice.leave.mutate();
    playSound(SoundType.OWN_USER_LEFT_VOICE_CHANNEL);
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to leave voice channel'));
  }
};

export const setPinnedCard = (pinnedCard: TPinnedCard | undefined): void => {
  store.dispatch(serverSliceActions.setPinnedCard(pinnedCard));
};

export const sendVoiceReaction = async (emoji: string): Promise<void> => {
  const client = getTRPCClient();

  try {
    await client.voice.react.mutate({ emoji });
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to send voice reaction'));
  }
};

export type TVoiceSoundboardId =
  | 'pop'
  | 'airhorn'
  | 'rimshot'
  | 'tada'
  | 'bonk';

const SOUND_BOARD_BY_ID: Record<TVoiceSoundboardId, SoundType> = {
  pop: SoundType.SOUNDBOARD_POP,
  airhorn: SoundType.SOUNDBOARD_AIRHORN,
  rimshot: SoundType.SOUNDBOARD_RIMSHOT,
  tada: SoundType.SOUNDBOARD_TADA,
  bonk: SoundType.SOUNDBOARD_BONK
};

export const sendVoiceSoundboard = async (
  soundId: TVoiceSoundboardId
): Promise<void> => {
  const client = getTRPCClient();

  try {
    await client.voice.playSoundboard.mutate({ soundId });
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to send soundboard'));
  }
};

export const stopUserVoiceMedia = async (
  userId: number,
  kind: StreamKind.VIDEO | StreamKind.SCREEN | StreamKind.SCREEN_AUDIO
): Promise<void> => {
  const voiceUserMediaModeration = true;
  if (!voiceUserMediaModeration) return;
  const client = getTRPCClient();

  try {
    await client.voice.closeUserProducer.mutate({ userId, kind });
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to stop user voice media'));
  }
};

export const recoverVoiceMedia = async (): Promise<void> => {
  const client = getTRPCClient();

  try {
    const result = await client.voice.recoverMedia.mutate();
    const recoveredKinds = (result?.recoveredKinds ?? []) as StreamKind[];
    if (recoveredKinds.includes(StreamKind.VIDEO))
      updateOwnVoiceState({ webcamEnabled: false });
    if (
      recoveredKinds.includes(StreamKind.SCREEN) ||
      recoveredKinds.includes(StreamKind.SCREEN_AUDIO)
    ) {
      updateOwnVoiceState({ sharingScreen: false });
    }
    toast.success('Voice media recovered');
  } catch (error) {
    toast.error(getTrpcError(error, 'Failed to recover voice media'));
  }
};

export const subscribeToVoiceSoundboard = (): (() => void) => {
  const client = getTRPCClient();

  const subscription = client.voice.onSoundboard.subscribe(undefined, {
    onData: ({ soundId }) => {
      void playSound(
        SOUND_BOARD_BY_ID[soundId as TVoiceSoundboardId] ??
          SoundType.SOUNDBOARD_POP
      );
    },
    onError: (error) => {
      logVoice('Voice soundboard subscription error', { error });
    }
  });

  return () => subscription.unsubscribe();
};

export const subscribeToVoiceReactions = (): (() => void) => {
  const client = getTRPCClient();
  const timers = new Map<number, () => void>();

  const subscription = client.voice.onReaction.subscribe(undefined, {
    onData: ({ userId, emoji, file, expiresAt }) => {
      timers.get(userId)?.();
      store.dispatch(
        serverSliceActions.setVoiceReaction({ userId, emoji, file, expiresAt })
      );

      const timeout = setTimeout(
        () => {
          store.dispatch(serverSliceActions.setVoiceReaction({ userId }));
          timers.delete(userId);
        },
        Math.max(0, expiresAt - Date.now())
      );

      timers.set(userId, () => clearTimeout(timeout));
    },
    onError: (error) => {
      logVoice('Voice reaction subscription error', { error });
    }
  });

  return () => {
    timers.forEach((cancel) => cancel());
    timers.clear();
    subscription.unsubscribe();
  };
};

export const setHideNonVideoParticipants = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideNonVideoParticipants(value));

  try {
    setLocalStorageItem(
      LocalStorageKey.HIDE_NON_VIDEO_PARTICIPANTS,
      String(value)
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setShowUserBannersInVoice = (value: boolean): void => {
  store.dispatch(serverSliceActions.setShowUserBannersInVoice(value));

  try {
    setLocalStorageItemBool(
      LocalStorageKey.VOICE_CHAT_SHOW_USER_BANNERS,
      value
    );
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};

export const setHideOwnScreenShare = (value: boolean): void => {
  store.dispatch(serverSliceActions.setHideOwnScreenShare(value));

  try {
    setLocalStorageItemBool(LocalStorageKey.HIDE_OWN_SCREEN_SHARE, value);
  } catch (error) {
    console.error('Failed to save voice options:', error);
  }
};
