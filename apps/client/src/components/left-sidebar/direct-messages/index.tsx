import { UnreadCount } from '@/components/unread-count';
import { UserAvatar } from '@/components/user-avatar';
import { setSelectedDmChannelId } from '@/features/app/actions';
import { useSelectedDmChannelId } from '@/features/app/hooks';
import { requestConfirmation } from '@/features/dialogs/actions';
import { useChannels } from '@/features/server/channels/hooks';
import { useUnreadMessagesCount } from '@/features/server/hooks';
import {
  useOwnUserId,
  useUserById,
  useUsers
} from '@/features/server/users/hooks';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  DELETED_USER_IDENTITY_AND_NAME,
  type TDirectMessageConversation
} from '@sharkord/shared';
import { Spinner } from '@sharkord/ui';
import { X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SearchUserDropdown } from './search-user-dropdown';

type TDirectMessageItemProps = {
  dm: TDirectMessageConversation;
  selected: boolean;
  onSelect: () => void;
  onHide: (dm: TDirectMessageConversation) => void;
};

const DirectMessageItem = memo(
  ({ dm, selected, onSelect, onHide }: TDirectMessageItemProps) => {
    const { t } = useTranslation('sidebar');
    const user = useUserById(dm.userId);
    const unreadCount = useUnreadMessagesCount(dm.channelId);

    if (!user) {
      return null;
    }

    return (
      <div className="group flex items-center rounded hover:bg-accent hover:text-accent-foreground">
        <button
          type="button"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground group-hover:text-accent-foreground',
            selected && 'bg-accent text-accent-foreground'
          )}
          onClick={onSelect}
        >
          <UserAvatar userId={user.id} className="h-6 w-6" showUserPopover />
          <span className="truncate flex-1 text-left">{user.name}</span>
          <UnreadCount count={unreadCount} />
        </button>
        <button
          type="button"
          className="mr-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
          aria-label={t('hideDirectMessageWith', { name: user.name })}
          title={t('hideDirectMessage')}
          onClick={(event) => {
            event.stopPropagation();
            onHide(dm);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
);

const DirectMessages = memo(() => {
  const { t } = useTranslation('sidebar');
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<
    TDirectMessageConversation[]
  >([]);
  const [query, setQuery] = useState('');
  const users = useUsers();
  const channels = useChannels();
  const ownUserId = useOwnUserId();
  const selectedDmChannelId = useSelectedDmChannelId();

  const fetchConversations = useCallback(async () => {
    const trpc = getTRPCClient();

    setLoading(true);

    try {
      const items = await trpc.dms.get.query();

      setConversations(items);
    } catch {
      toast.error(t('failedLoadDMs'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchConversations();
  }, [channels.length, fetchConversations]);

  // subscribe to new conversations being opened, when a new conversation is opened we refetch the list of conversations
  useEffect(() => {
    const trpc = getTRPCClient();

    const sub = trpc.dms.onConversationOpen.subscribe(undefined, {
      onData: () => fetchConversations()
    });

    return () => sub.unsubscribe();
  }, [fetchConversations]);

  const usersToStartDm = useMemo(() => {
    const directMessageUserIds = new Set(conversations.map((dm) => dm.userId));

    return users.filter(
      (user) =>
        user.id !== ownUserId &&
        !user.banned &&
        user.name !== DELETED_USER_IDENTITY_AND_NAME &&
        !directMessageUserIds.has(user.id) &&
        user.name.toLowerCase().includes(query.trim().toLowerCase())
    );
  }, [conversations, ownUserId, query, users]);

  const onStartDm = useCallback(
    async (userId: number) => {
      const trpc = getTRPCClient();

      try {
        const result = await trpc.dms.open.mutate({ userId });

        setSelectedDmChannelId(result.channelId);
        await fetchConversations();
      } catch {
        toast.error(t('couldNotOpenDM'));
      }
    },
    [fetchConversations, t]
  );

  const onHideDm = useCallback(
    async (dm: TDirectMessageConversation) => {
      const user = users.find((candidate) => candidate.id === dm.userId);
      const confirmed = await requestConfirmation({
        title: t('hideDirectMessageTitle'),
        message: t('hideDirectMessageMsg', {
          name: user?.name ?? t('unknownUser', { ns: 'common' })
        }),
        confirmLabel: t('hideDirectMessage'),
        cancelLabel: t('cancel', { ns: 'common' })
      });

      if (!confirmed) return;

      const trpc = getTRPCClient();

      try {
        await trpc.dms.hide.mutate({ channelId: dm.channelId });
        setConversations((current) =>
          current.filter((item) => item.channelId !== dm.channelId)
        );
        if (selectedDmChannelId === dm.channelId) {
          setSelectedDmChannelId(undefined);
        }
        toast.success(t('directMessageHidden'));
      } catch {
        toast.error(t('failedHideDirectMessage'));
      }
    },
    [selectedDmChannelId, t, users]
  );

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-muted-foreground">
          {t('directMessages')}
        </span>
        <SearchUserDropdown
          query={query}
          setQuery={setQuery}
          usersToStartDm={usersToStartDm}
          onStartDm={onStartDm}
        />
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="space-y-0.5">
          {conversations.map((dm) => (
            <DirectMessageItem
              key={dm.channelId}
              dm={dm}
              selected={selectedDmChannelId === dm.channelId}
              onSelect={() => setSelectedDmChannelId(dm.channelId)}
              onHide={onHideDm}
            />
          ))}
          {conversations.length === 0 && (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              {t('noDMsYet')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export { DirectMessages };
