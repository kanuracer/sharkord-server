import {
  ChannelPermission,
  OWNER_ROLE_ID,
  type TJoinedPublicUser,
  type TJoinedRole
} from '@sharkord/shared';
import { z } from 'zod';
import { channelUserCan } from '../../db/queries/channels';
import { getRoles } from '../../db/queries/roles';
import { getUsers } from '../../db/queries/users';
import { clearFields } from '../../helpers/clear-fields';
import { protectedProcedure } from '../../utils/trpc';

const roleSortRank = (role: TJoinedRole) => {
  if (role.id === OWNER_ROLE_ID) return 0;
  if (!role.isDefault && role.isPersistent) return 10;
  if (role.isDefault) return 20;
  if (role.isPersistent) return 30;
  return 40;
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

const sortMembersByRole = (
  users: TJoinedPublicUser[],
  roles: TJoinedRole[]
) => {
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

const getAccessibleMembersRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number().min(1),
      includeAll: z.boolean().optional().default(false)
    })
  )
  .query(async ({ input, ctx }) => {
    await ctx.needsChannelPermission(
      input.channelId,
      ChannelPermission.VIEW_CHANNEL
    );

    const users = clearFields(await getUsers(), [
      'identity',
      'password',
      'mfaSecret'
    ]);

    const visibleUsers = input.includeAll
      ? users
      : (
          await Promise.all(
            users.map(async (user) => ({
              user,
              canView: await channelUserCan(
                input.channelId,
                user.id,
                ChannelPermission.VIEW_CHANNEL
              )
            }))
          )
        )
          .filter(({ canView }) => canView)
          .map(({ user }) => user);

    const roles = await getRoles();

    return sortMembersByRole(visibleUsers, roles);
  });

export { getAccessibleMembersRoute };
