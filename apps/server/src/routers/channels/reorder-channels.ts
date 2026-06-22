import { ActivityLogType, Permission } from '@sharkord/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { publishChannel } from '../../db/publishers';
import { channels } from '../../db/schema';
import { enqueueActivityLog } from '../../queues/activity-log';
import { protectedProcedure } from '../../utils/trpc';

const reorderChannelsRoute = protectedProcedure
  .input(
    z.object({
      categoryId: z.number(),
      channelIds: z.array(z.number())
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_CHANNELS);

    const existingCategoryChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.categoryId, input.categoryId))
      .orderBy(asc(channels.position), asc(channels.id));

    const existingCategoryChannelIds = existingCategoryChannels.map(
      (channel) => channel.id
    );
    const existingIds = new Set(existingCategoryChannelIds);
    const requestedIds = [...new Set(input.channelIds)];
    const movableChannels = requestedIds.length
      ? await db
        .select({ id: channels.id })
        .from(channels)
        .where(and(inArray(channels.id, requestedIds), eq(channels.isDm, false)))
      : [];
    const movableIds = new Set(movableChannels.map((channel) => channel.id));
    const nextVisibleIds: number[] = [];

    for (const channelId of requestedIds) {
      if ((existingIds.has(channelId) || movableIds.has(channelId)) && !nextVisibleIds.includes(channelId)) {
        nextVisibleIds.push(channelId);
      }
    }

    const missingChannelIds = existingCategoryChannelIds.filter(
      (channelId) => !nextVisibleIds.includes(channelId)
    );

    const nextChannelOrder = [...nextVisibleIds, ...missingChannelIds];

    await db.transaction(async (tx) => {
      for (let i = 0; i < nextChannelOrder.length; i++) {
        const channelId = nextChannelOrder[i]!;
        const newPosition = i + 1;

        await tx
          .update(channels)
          .set({
            categoryId: input.categoryId,
            position: newPosition,
            updatedAt: Date.now()
          })
          .where(eq(channels.id, channelId));
      }
    });

    nextChannelOrder.forEach((channelId) => {
      publishChannel(channelId, 'update');
    });

    if (nextChannelOrder.length > 0) {
      enqueueActivityLog({
        type: ActivityLogType.UPDATED_CHANNEL,
        userId: ctx.user.id,
        details: {
          channelId: nextChannelOrder[0]!,
          values: {
            position: nextChannelOrder.length
          }
        }
      });
    }
  });

export { reorderChannelsRoute };
