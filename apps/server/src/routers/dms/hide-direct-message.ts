import { ServerEvents } from '@sharkord/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { getSettings } from '../../db/queries/server';
import {
  channels,
  directMessageHiddenStates,
  directMessages
} from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const hideDirectMessageRoute = protectedProcedure
  .input(
    z.object({
      channelId: z.number()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const settings = await getSettings();

    invariant(settings.directMessagesEnabled, {
      code: 'FORBIDDEN',
      message: 'Direct messages are disabled on this server'
    });

    const target = await db
      .select({
        channelId: directMessages.channelId,
        userOneId: directMessages.userOneId,
        userTwoId: directMessages.userTwoId,
        isDm: channels.isDm
      })
      .from(directMessages)
      .innerJoin(channels, eq(channels.id, directMessages.channelId))
      .where(eq(directMessages.channelId, input.channelId))
      .limit(1)
      .get();

    invariant(target?.isDm, {
      code: 'NOT_FOUND',
      message: 'Direct message not found'
    });

    invariant(
      target.userOneId === ctx.userId || target.userTwoId === ctx.userId,
      {
        code: 'FORBIDDEN',
        message: 'You are not a participant in this DM channel'
      }
    );

    await db
      .insert(directMessageHiddenStates)
      .values({
        channelId: input.channelId,
        userId: ctx.userId,
        hiddenAt: Date.now()
      })
      .onConflictDoUpdate({
        target: [
          directMessageHiddenStates.channelId,
          directMessageHiddenStates.userId
        ],
        set: { hiddenAt: Date.now() }
      })
      .execute();

    ctx.pubsub.publishFor(ctx.userId, ServerEvents.DM_CONVERSATION_OPEN, {
      channelId: input.channelId
    });
  });

const unhideDirectMessageForOtherParticipants = async (
  channelId: number,
  senderId: number
): Promise<number[]> => {
  const dm = await db
    .select({
      userOneId: directMessages.userOneId,
      userTwoId: directMessages.userTwoId
    })
    .from(directMessages)
    .where(eq(directMessages.channelId, channelId))
    .limit(1)
    .get();

  if (!dm) return [];

  const recipients = [dm.userOneId, dm.userTwoId].filter(
    (id) => id !== senderId
  );

  if (recipients.length === 0) return [];

  await db
    .delete(directMessageHiddenStates)
    .where(
      and(
        eq(directMessageHiddenStates.channelId, channelId),
        inArray(directMessageHiddenStates.userId, recipients)
      )
    )
    .execute();

  return recipients;
};

export { hideDirectMessageRoute, unhideDirectMessageForOtherParticipants };
