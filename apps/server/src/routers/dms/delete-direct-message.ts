import { ServerEvents } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { publishChannelPermissions } from '../../db/publishers';
import { getSettings } from '../../db/queries/server';
import { channels, directMessages } from '../../db/schema';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const deleteDirectMessageRoute = protectedProcedure
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

    const participants = [target.userOneId, target.userTwoId];

    invariant(participants.includes(ctx.userId), {
      code: 'FORBIDDEN',
      message: 'You are not a participant in this DM channel'
    });

    const removedChannel = await db
      .delete(channels)
      .where(eq(channels.id, input.channelId))
      .returning()
      .get();

    invariant(removedChannel, {
      code: 'NOT_FOUND',
      message: 'Direct message not found'
    });

    const runtime = VoiceRuntime.findById(removedChannel.id);

    if (runtime) {
      await runtime.destroy();
    }

    ctx.pubsub.publishFor(
      participants,
      ServerEvents.CHANNEL_DELETE,
      removedChannel.id
    );

    await publishChannelPermissions(participants);
  });

export { deleteDirectMessageRoute };
