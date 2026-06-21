import { ChannelPermission, ChannelType, Permission, ServerEvents } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { channelUserCan } from '../../db/queries/channels';
import { channels } from '../../db/schema';
import { logger } from '../../logger';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const moveUserRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      destinationChannelId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const isSelfMove = ctx.user.id === input.userId;

    if (!isSelfMove) {
      await ctx.needsPermission(Permission.MOVE_MEMBERS);
    }

    const sourceRuntime = VoiceRuntime.findRuntimeByUserId(input.userId);

    invariant(sourceRuntime, {
      code: 'BAD_REQUEST',
      message: 'Target user is not in a voice channel'
    });

    invariant(sourceRuntime.id !== input.destinationChannelId, {
      code: 'BAD_REQUEST',
      message: 'Target user is already in the destination voice channel'
    });

    const [sourceChannel, destinationChannel] = await Promise.all([
      db.select().from(channels).where(eq(channels.id, sourceRuntime.id)).get(),
      db
        .select()
        .from(channels)
        .where(eq(channels.id, input.destinationChannelId))
        .get()
    ]);

    invariant(sourceChannel, {
      code: 'NOT_FOUND',
      message: 'Source voice channel not found'
    });
    invariant(destinationChannel, {
      code: 'NOT_FOUND',
      message: 'Destination channel not found'
    });
    invariant(
      sourceChannel.type === ChannelType.VOICE &&
        destinationChannel.type === ChannelType.VOICE,
      {
        code: 'BAD_REQUEST',
        message: 'Both source and destination must be voice channels'
      }
    );
    invariant(!sourceChannel.isDm && !destinationChannel.isDm, {
      code: 'BAD_REQUEST',
      message: 'Direct message voice channels cannot be moved'
    });

    await Promise.all([
      ctx.needsChannelPermission(sourceChannel.id, ChannelPermission.JOIN),
      ctx.needsChannelPermission(destinationChannel.id, ChannelPermission.JOIN)
    ]);

    const targetCanJoinDestination = await channelUserCan(
      destinationChannel.id,
      input.userId,
      ChannelPermission.JOIN
    );

    invariant(targetCanJoinDestination, {
      code: 'FORBIDDEN',
      message: 'Target user cannot join the destination voice channel'
    });

    const destinationRuntime = VoiceRuntime.findById(destinationChannel.id);

    invariant(destinationRuntime, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Voice runtime not found for destination channel'
    });

    const previousState = sourceRuntime.getUserState(input.userId);

    sourceRuntime.removeUser(input.userId);
    destinationRuntime.addUser(input.userId, previousState);

    ctx.pubsub.publish(ServerEvents.USER_LEAVE_VOICE, {
      channelId: sourceChannel.id,
      userId: input.userId
    });
    ctx.pubsub.publish(ServerEvents.USER_JOIN_VOICE, {
      channelId: destinationChannel.id,
      userId: input.userId,
      state: previousState
    });

    if (isSelfMove) {
      ctx.currentVoiceChannelId = destinationChannel.id;
    }

    logger.info(
      '%s moved user %d from voice channel %s to %s',
      ctx.user.name,
      input.userId,
      sourceChannel.name,
      destinationChannel.name
    );
  });

export { moveUserRoute };
