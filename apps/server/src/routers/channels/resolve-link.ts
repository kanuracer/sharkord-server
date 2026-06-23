import { ChannelPermission, ChannelType } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { channels } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const resolveChannelLinkRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number().min(1)
    })
  )
  .query(async ({ input, ctx }) => {
    const channel = await db
      .select({
        id: channels.id,
        name: channels.name,
        type: channels.type,
        categoryId: channels.categoryId,
        isDm: channels.isDm
      })
      .from(channels)
      .where(eq(channels.id, input.channelId))
      .get();

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Channel not found'
    });
    invariant(!channel.isDm, {
      code: 'BAD_REQUEST',
      message: 'Direct message channel links are not supported'
    });

    await ctx.needsChannelPermission(
      channel.id,
      ChannelPermission.VIEW_CHANNEL
    );
    if (channel.type === ChannelType.VOICE) {
      await ctx.needsChannelPermission(channel.id, ChannelPermission.JOIN);
    }

    return {
      channelId: channel.id,
      id: channel.id,
      name: channel.name,
      type: channel.type as ChannelType,
      categoryId: channel.categoryId
    };
  });

export { resolveChannelLinkRoute };
