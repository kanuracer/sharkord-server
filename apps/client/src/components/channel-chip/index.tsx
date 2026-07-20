import { setSelectedChannelId } from '@/features/server/channels/actions';
import {
  useChannelById,
  useChannelPermissionsById,
  useSelectedChannelId
} from '@/features/server/channels/hooks';
import { cn } from '@/lib/utils';
import { ChannelType } from '@sharkord/shared';
import { memo, useCallback } from 'react';

type TChannelChipProps = {
  channelId: number;
};

const ChannelChip = memo(({ channelId }: TChannelChipProps) => {
  const channel = useChannelById(channelId);
  const channelPermissions = useChannelPermissionsById(channelId);
  const selectedChannelId = useSelectedChannelId();
  const isCurrentChannel = selectedChannelId === channelId;
  const canReference =
    channel &&
    !channel.isDm &&
    (channel.type === ChannelType.TEXT || channel.type === ChannelType.VOICE) &&
    (!channel.private || channelPermissions.permissions?.VIEW_CHANNEL === true);

  const handleClick = useCallback(() => {
    if (canReference) {
      setSelectedChannelId(channelId);
    }
  }, [canReference, channelId]);

  if (!canReference) {
    return (
      <span className="channel-reference text-muted-foreground">
        #Unavailable channel
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'channel-reference rounded px-0.5 cursor-pointer transition-colors',
        isCurrentChannel
          ? 'text-primary bg-primary/10 font-medium'
          : 'text-primary/80 bg-primary/5 hover:bg-primary/15'
      )}
    >
      #{channel.name}
    </button>
  );
});

export { ChannelChip };
