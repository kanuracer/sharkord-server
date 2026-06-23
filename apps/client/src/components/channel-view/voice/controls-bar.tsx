import { useRecentEmojis } from '@/components/emoji-picker/use-recent-emojis';
import {
  customEmojiReactionValue,
  shouldUseFallbackImage
} from '@/components/tiptap-input/helpers';
import { useChannelCan } from '@/features/server/hooks';
import {
  leaveVoice,
  recoverVoiceMedia,
  sendVoiceReaction,
  sendVoiceSoundboard,
  type TVoiceSoundboardId
} from '@/features/server/voice/actions';
import { useOwnVoiceState, useVoice } from '@/features/server/voice/hooks';
import { cn } from '@/lib/utils';
import { ChannelPermission } from '@sharkord/shared';
import { Button, Tooltip } from '@sharkord/ui';
import {
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  RefreshCw,
  ScreenShareOff,
  Video,
  VideoOff
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { ControlToggleButton } from './control-toggle-button';
import { useControlsBarVisibility } from './hooks/use-controls-bar-visibility';

type TControlsBarProps = {
  channelId: number;
};

const ControlsBar = memo(({ channelId }: TControlsBarProps) => {
  const { toggleMic, toggleWebcam, toggleScreenShare, isScreenShareSupported } =
    useVoice();
  const ownVoiceState = useOwnVoiceState();
  const channelCan = useChannelCan(channelId);
  const isVisible = useControlsBarVisibility();
  const { recentEmojis } = useRecentEmojis();
  const recentVoiceReactionEmojis = useMemo(
    () => recentEmojis.filter((emoji) => emoji.customId).slice(0, 4),
    [recentEmojis]
  );
  const voiceSoundboard = true;
  const voiceMediaRecovery = true;
  const soundboardSounds: Array<{
    id: TVoiceSoundboardId;
    label: string;
    emoji: string;
  }> = [
    { id: 'pop', label: 'Pop', emoji: '✨' },
    { id: 'airhorn', label: 'Airhorn', emoji: '📣' },
    { id: 'rimshot', label: 'Rimshot', emoji: '🥁' }
  ];

  const permissions = useMemo(
    () => ({
      canSpeak: channelCan(ChannelPermission.SPEAK),
      canWebcam: channelCan(ChannelPermission.WEBCAM),
      canShareScreen: channelCan(ChannelPermission.SHARE_SCREEN)
    }),
    [channelCan]
  );

  return (
    <div
      className={cn(
        'absolute bottom-8 left-0 right-0 hidden md:flex justify-center items-center pointer-events-none',
        'transition-all duration-300 ease-in-out gap-3',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 pointer-events-auto',
          'h-14 px-2 rounded-md border shadow-xl',
          'bg-card border-border/50 backdrop-blur-md'
        )}
      >
        {['👍', '❤️', '😂', '🎉', '😮'].map((emoji) => (
          <Tooltip key={emoji} content={`React ${emoji}`}>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full text-xl"
              onClick={() => void sendVoiceReaction(emoji)}
              aria-label={`Voice reaction ${emoji}`}
            >
              {emoji}
            </Button>
          </Tooltip>
        ))}

        {recentVoiceReactionEmojis.map((emoji) => {
          const reactionValue = customEmojiReactionValue(emoji);
          const useImage = shouldUseFallbackImage(emoji);

          return (
            <Tooltip key={reactionValue} content={`React :${emoji.name}:`}>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-full text-xl"
                onClick={() => void sendVoiceReaction(reactionValue)}
                aria-label={`Voice reaction ${emoji.name}`}
              >
                {emoji.fallbackImage && useImage ? (
                  <img
                    src={emoji.fallbackImage}
                    alt={`:${emoji.name}:`}
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  (emoji.emoji ?? `:${emoji.name}:`)
                )}
              </Button>
            </Tooltip>
          );
        })}

        {voiceSoundboard &&
          soundboardSounds.map((sound) => (
            <Tooltip key={sound.id} content={`Soundboard ${sound.label}`}>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-full text-lg"
                onClick={() => void sendVoiceSoundboard(sound.id)}
                aria-label={`Soundboard ${sound.label}`}
              >
                {sound.emoji}
              </Button>
            </Tooltip>
          ))}

        {voiceMediaRecovery && (
          <Tooltip content="Recover media">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              onClick={() => void recoverVoiceMedia()}
              aria-label="Recover voice media"
            >
              <RefreshCw size={18} />
            </Button>
          </Tooltip>
        )}

        <ControlToggleButton
          enabled={ownVoiceState.micMuted}
          enabledLabel="Unmute"
          disabledLabel="Mute"
          enabledIcon={MicOff}
          disabledIcon={Mic}
          enabledClassName="bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-500"
          onClick={toggleMic}
          disabled={!permissions.canSpeak || ownVoiceState.soundMuted}
        />

        <ControlToggleButton
          enabled={ownVoiceState.webcamEnabled}
          enabledLabel="Stop Video"
          disabledLabel="Start Video"
          enabledIcon={Video}
          disabledIcon={VideoOff}
          enabledClassName="bg-green-500/20 text-green-500 hover:bg-green-500/30 hover:text-green-500"
          onClick={toggleWebcam}
          disabled={!permissions.canWebcam}
        />

        {isScreenShareSupported && (
          <ControlToggleButton
            enabled={ownVoiceState.sharingScreen}
            enabledLabel="Stop Sharing"
            disabledLabel="Share Screen"
            enabledIcon={ScreenShareOff}
            disabledIcon={Monitor}
            enabledClassName="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 hover:text-blue-500"
            onClick={toggleScreenShare}
            disabled={!permissions.canShareScreen}
          />
        )}
      </div>

      <Tooltip content="Disconnect">
        <Button
          size="icon"
          className={cn(
            'pointer-events-auto h-14 w-18 rounded-md text-white shadow-xl transition-all active:scale-95',
            'bg-[#ec4245] hover:bg-[#da373c]'
          )}
          onClick={() => leaveVoice()}
          aria-label="Disconnect"
        >
          <PhoneOff size={24} fill="currentColor" />
        </Button>
      </Tooltip>
    </div>
  );
});

export { ControlsBar };
