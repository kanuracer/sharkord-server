import { ResizableSidebar } from '@/components/resizable-sidebar';
import { UserAvatar } from '@/components/user-avatar';
import { selectedChannelIdSelector } from '@/features/server/channels/selectors';
import { useUsers } from '@/features/server/users/hooks';
import type { IRootState } from '@/features/store';
import { LocalStorageKey } from '@/helpers/storage';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { DELETED_USER_IDENTITY_AND_NAME } from '@sharkord/shared';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { UserPopover } from '../user-popover';

const MAX_USERS_TO_SHOW = 100;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240; // w-60 = 240px

type TUserProps = {
  userId: number;
  name: string;
  banned: boolean;
};

const User = memo(({ userId, name, banned }: TUserProps) => {
  return (
    <UserPopover userId={userId}>
      <div className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent select-none min-w-0">
        <UserAvatar userId={userId} className="h-8 w-8 shrink-0" />
        <span
          className={cn(
            'text-sm text-foreground truncate',
            banned && 'line-through text-muted-foreground'
          )}
        >
          {name}
        </span>
      </div>
    </UserPopover>
  );
});

type TRightSidebarProps = {
  className?: string;
  isOpen?: boolean;
};

const RightSidebar = memo(
  ({ className, isOpen = true }: TRightSidebarProps) => {
    const { t } = useTranslation('sidebar');
    const users = useUsers();
    const selectedChannelId = useSelector((state: IRootState) => selectedChannelIdSelector(state));
    const [channelAccessOnly, setChannelAccessOnly] = useState(true);
    const [channelUsers, setChannelUsers] = useState<typeof users | null>(null);

    useEffect(() => {
      let cancelled = false;
      setChannelUsers(null);
      if (!selectedChannelId || !channelAccessOnly) return undefined;
      getTRPCClient().channels.getAccessibleMembers.query({ channelId: selectedChannelId, includeAll: false })
        .then((rows) => { if (!cancelled) setChannelUsers(rows as typeof users); })
        .catch(() => { if (!cancelled) setChannelUsers(null); });
      return () => { cancelled = true; };
    }, [selectedChannelId, channelAccessOnly, users.length]);

    const displayUsers = channelAccessOnly && channelUsers ? channelUsers : users;

    const { usersToShow, usersCount } = useMemo(() => {
      const filtered = displayUsers.filter(
        (user) => user.name !== DELETED_USER_IDENTITY_AND_NAME
      );

      return {
        usersToShow: filtered.slice(0, MAX_USERS_TO_SHOW),
        usersCount: filtered.length
      };
    }, [displayUsers]);

    const hasHiddenUsers = displayUsers.length > MAX_USERS_TO_SHOW;

    return (
      <ResizableSidebar
        storageKey={LocalStorageKey.RIGHT_SIDEBAR_WIDTH}
        minWidth={MIN_WIDTH}
        maxWidth={MAX_WIDTH}
        defaultWidth={DEFAULT_WIDTH}
        edge="left"
        isOpen={isOpen}
        className={cn('h-full', className)}
      >
        <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t('membersHeader', { count: usersCount })}
          </h3>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={channelAccessOnly} onChange={(event) => setChannelAccessOnly(event.currentTarget.checked)} />
            {t('channelAccessOnly')}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {usersToShow.map((user) => (
              <User
                key={user.id}
                userId={user.id}
                name={user.name}
                banned={user.banned}
              />
            ))}
            {hasHiddenUsers && (
              <div className="text-sm text-muted-foreground px-2 py-1.5">
                +{displayUsers.length - MAX_USERS_TO_SHOW} more...
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>
    );
  }
);

export { RightSidebar };
