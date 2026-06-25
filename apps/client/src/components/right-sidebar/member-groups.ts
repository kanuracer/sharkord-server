import {
  DELETED_USER_IDENTITY_AND_NAME,
  OWNER_ROLE_ID,
  UserStatus,
  type TJoinedPublicUser,
  type TJoinedRole
} from '@sharkord/shared';

export type TMemberRoleGroup = {
  key: string;
  title: string;
  users: TJoinedPublicUser[];
};

export type TMemberStatusGroup = {
  key: 'online' | 'offline';
  title: string;
  usersCount: number;
  roleGroups: TMemberRoleGroup[];
};

const compareName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

export const roleSortRank = (role?: TJoinedRole) => {
  if (!role) return 900;
  if (role.id === OWNER_ROLE_ID) return 0;
  const weight = Number(role.weight);
  if (Number.isFinite(weight) && weight >= 0) return weight;
  return 100;
};

const compareRoles = (a: TJoinedRole, b: TJoinedRole) => {
  const rankDiff = roleSortRank(a) - roleSortRank(b);
  if (rankDiff !== 0) return rankDiff;
  if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
  const nameDiff = compareName(a.name, b.name);
  if (nameDiff !== 0) return nameDiff;
  return a.id - b.id;
};

export const isOnlineMember = (user: TJoinedPublicUser) => {
  const status = user.status ?? UserStatus.OFFLINE;
  return status === UserStatus.ONLINE || status === UserStatus.IDLE;
};

const compareUsers = (a: TJoinedPublicUser, b: TJoinedPublicUser) => {
  const nameDiff = compareName(a.name, b.name);
  if (nameDiff !== 0) return nameDiff;
  return a.id - b.id;
};

const isExplicitRole = (role: TJoinedRole | undefined): role is TJoinedRole => {
  if (!role) return false;
  return !role.isDefault;
};

export const highestSortableRole = (
  user: TJoinedPublicUser,
  rolesById: Map<number, TJoinedRole>,
  defaultRole?: TJoinedRole
) => {
  const explicitRole = user.roleIds
    .map((roleId) => rolesById.get(roleId))
    .filter(isExplicitRole)
    .sort(compareRoles)[0];

  return explicitRole ?? defaultRole;
};

export const groupUsersByRole = (
  users: TJoinedPublicUser[],
  roles: TJoinedRole[],
  fallbackTitle: string
): TMemberRoleGroup[] => {
  if (!users.length) return [];

  const sortedRoles = [...roles].sort(compareRoles);
  const rolesById = new Map(sortedRoles.map((role) => [role.id, role]));
  const defaultRole = sortedRoles.find((role) => role.isDefault);
  const hasAnyKnownRoleAssignment = users.some((user) =>
    user.roleIds.some((roleId) => rolesById.has(roleId))
  );

  if (!defaultRole && !hasAnyKnownRoleAssignment) {
    return [
      {
        key: 'members',
        title: fallbackTitle,
        users: [...users].sort(compareUsers)
      }
    ];
  }

  const groups = new Map<
    string,
    TMemberRoleGroup & { rank: number; defaultRank: number }
  >();

  for (const user of users) {
    const role = highestSortableRole(user, rolesById, defaultRole);
    const key = role ? `role-${role.id}` : 'members';
    const title = role ? role.name : fallbackTitle;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title,
        users: [],
        rank: roleSortRank(role),
        defaultRank: role?.isDefault ? 1 : 0
      });
    }

    groups.get(key)?.users.push(user);
  }

  return [...groups.values()]
    .map(({ rank: _rank, defaultRank: _defaultRank, ...group }) => ({
      ...group,
      users: [...group.users].sort(compareUsers)
    }))
    .sort((a, b) => {
      const aRole = sortedRoles.find((role) => `role-${role.id}` === a.key);
      const bRole = sortedRoles.find((role) => `role-${role.id}` === b.key);
      const rankDiff = roleSortRank(aRole) - roleSortRank(bRole);
      if (rankDiff !== 0) return rankDiff;
      if (aRole?.isDefault !== bRole?.isDefault)
        return aRole?.isDefault ? 1 : -1;
      return compareName(a.title, b.title);
    });
};

export const groupUsersByStatusAndRole = (
  users: TJoinedPublicUser[],
  roles: TJoinedRole[],
  fallbackTitle: string,
  onlineTitle: string,
  offlineTitle: string
): TMemberStatusGroup[] => {
  const filtered = users.filter(
    (user) => user.name !== DELETED_USER_IDENTITY_AND_NAME
  );
  const onlineUsers = filtered.filter(isOnlineMember);
  const offlineUsers = filtered.filter((user) => !isOnlineMember(user));

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
