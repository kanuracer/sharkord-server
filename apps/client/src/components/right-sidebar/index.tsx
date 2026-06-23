import { ResizableSidebar } from '@/components/resizable-sidebar';
import { UserAvatar } from '@/components/user-avatar';
import { selectedChannelIdSelector } from '@/features/server/channels/selectors';
import { useRoles } from '@/features/server/roles/hooks';
import { useUsers } from '@/features/server/users/hooks';
import type { IRootState } from '@/features/store';
import { LocalStorageKey } from '@/helpers/storage';
import { getTRPCClient } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  DELETED_USER_IDENTITY_AND_NAME,
  OWNER_ROLE_ID,
  UserStatus,
  type TJoinedPublicUser,
  type TJoinedRole
} from '@sharkord/shared';
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

type TMemberRoleGroup = {
  key: string;
  title: string;
  users: TJoinedPublicUser[];
};

type TMemberStatusGroup = {
  key: 'online' | 'offline';
  title: string;
  usersCount: number;
  roleGroups: TMemberRoleGroup[];
};

const roleSortRank = (role: TJoinedRole) => {
  if (role.id === OWNER_ROLE_ID) return 0;
  const weight = Number(role.weight);
  if (Number.isFinite(weight) && weight >= 0) return weight;
  return role.isDefault ? 100 : 100;
};

const isOnlineMember = (user: TJoinedPublicUser) => {
  const status = user.status ?? UserStatus.OFFLINE;
  return status === UserStatus.ONLINE || status === UserStatus.IDLE;
};

const highestSortableRole = (
  user: TJoinedPublicUser,
  rolesById: Map<number, TJoinedRole>
) =>
  user.roleIds
    .map((roleId) => rolesById.get(roleId))
    .filter((role): role is TJoinedRole => Boolean(role))
    .sort((a, b) => {
      const rankDiff = roleSortRank(a) - roleSortRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    })[0];

const sortUsersByRole = (users: TJoinedPublicUser[], roles: TJoinedRole[]) => {
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  return [...users].sort((a, b) => {
    const aRole = highestSortableRole(a, rolesById);
    const bRole = highestSortableRole(b, rolesById);
    const aRank = aRole ? roleSortRank(aRole) : 90;
    const bRank = bRole ? roleSortRank(bRole) : 90;

    if (aRank !== bRank) return aRank - bRank;

    const roleNameDiff = (aRole?.name ?? '').localeCompare(
      bRole?.name ?? '',
      undefined,
      { sensitivity: 'base' }
    );
    if (roleNameDiff !== 0) return roleNameDiff;

    const userNameDiff = a.name.localeCompare(b.name, undefined, {
      sensitivity: 'base'
    });
    if (userNameDiff !== 0) return userNameDiff;

    return a.id - b.id;
  });
};

const groupUsersByRole = (
  users: TJoinedPublicUser[],
  roles: TJoinedRole[],
  fallbackTitle: string
): TMemberRoleGroup[] => {
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const groups = new Map<string, TMemberRoleGroup>();

  for (const user of sortUsersByRole(users, roles)) {
    const role = highestSortableRole(user, rolesById);
    const key = role ? `role-${role.id}` : 'members';
    const title = role ? role.name : fallbackTitle;

    if (!groups.has(key)) {
      groups.set(key, { key, title, users: [] });
    }

    groups.get(key)?.users.push(user);
  }

  return [...groups.values()];
};

const groupUsersByStatusAndRole = (
  users: TJoinedPublicUser[],
  roles: TJoinedRole[],
  fallbackTitle: string,
  onlineTitle: string,
  offlineTitle: string
): TMemberStatusGroup[] => {
  const onlineUsers = users.filter(isOnlineMember);
  const offlineUsers = users.filter((user) => !isOnlineMember(user));

  return [
    {
      key: 'online' as const,
      title: onlineTitle,
      users: onlineUsers
    },
    {
      key: 'offline' as const,
      title: offlineTitle,
      users: offlineUsers
    }
  ]
    .filter((group) => group.users.length > 0)
    .map((group) => ({
      key: group.key,
      title: group.title,
      usersCount: group.users.length,
      roleGroups: groupUsersByRole(group.users, roles, fallbackTitle)
    }));
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
    const roles = useRoles();
    const selectedChannelId = useSelector((state: IRootState) =>
      selectedChannelIdSelector(state)
    );
    const [channelUserIds, setChannelUserIds] = useState<Set<number> | null>(
      null
    );

    useEffect(() => {
      let cancelled = false;
      setChannelUserIds(null);
      if (!selectedChannelId) return undefined;

      getTRPCClient()
        .channels.getAccessibleMembers.query({
          channelId: selectedChannelId,
          includeAll: false
        })
        .then((rows) => {
          if (!cancelled) {
            setChannelUserIds(new Set(rows.map((user) => user.id)));
          }
        })
        .catch(() => {
          if (!cancelled) setChannelUserIds(null);
        });

      return () => {
        cancelled = true;
      };
    }, [selectedChannelId, users.length]);

    const displayUsers = channelUserIds
      ? users.filter((user) => channelUserIds.has(user.id))
      : users;

    const { memberStatusGroups, usersCount, hiddenUsersCount } = useMemo(() => {
      const filtered = displayUsers.filter(
        (user) => user.name !== DELETED_USER_IDENTITY_AND_NAME
      );
      const visible = filtered.slice(0, MAX_USERS_TO_SHOW);

      return {
        memberStatusGroups: groupUsersByStatusAndRole(
          visible,
          roles,
          t('membersFallbackGroup'),
          t('onlineMembersGroup'),
          t('offlineMembersGroup')
        ),
        usersCount: filtered.length,
        hiddenUsersCount: Math.max(filtered.length - MAX_USERS_TO_SHOW, 0)
      };
    }, [displayUsers, roles, t]);

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
        <div className="flex h-12 items-center border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t('membersHeader', { count: usersCount })}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-4">
            {memberStatusGroups.map((statusGroup) => (
              <div key={statusGroup.key} className="space-y-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {statusGroup.title} — {statusGroup.usersCount}
                </div>
                <div className="space-y-3">
                  {statusGroup.roleGroups.map((group) => (
                    <div key={group.key} className="space-y-1">
                      <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        {group.title} — {group.users.length}
                      </div>
                      {group.users.map((user) => (
                        <User
                          key={user.id}
                          userId={user.id}
                          name={user.name}
                          banned={user.banned}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {hiddenUsersCount > 0 && (
              <div className="text-sm text-muted-foreground px-2 py-1.5">
                +{hiddenUsersCount} more...
              </div>
            )}
          </div>
        </div>
      </ResizableSidebar>
    );
  }
);

export { RightSidebar };
