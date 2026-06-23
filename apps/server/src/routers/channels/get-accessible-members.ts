import { ChannelPermission } from '@sharkord/shared';
import { z } from 'zod';
import { channelUserCan } from '../../db/queries/channels';
import { getUsers } from '../../db/queries/users';
import { clearFields } from '../../helpers/clear-fields';
import { protectedProcedure } from '../../utils/trpc';

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

    return visibleUsers;
  });

export { getAccessibleMembersRoute };
