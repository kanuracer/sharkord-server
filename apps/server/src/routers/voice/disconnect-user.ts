import {
  ActivityLogType,
  ChannelPermission,
  ChannelType,
  Permission,
  ServerEvents
} from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { channels } from '../../db/schema';
import { logger } from '../../logger';
import { enqueueActivityLog } from '../../queues/activity-log';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const disconnectUserRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);

    const isSelfDisconnect = ctx.user.id === input.userId;

    if (!isSelfDisconnect) {
      await ctx.needsPermission(Permission.MOVE_MEMBERS);
    }

    const runtime = VoiceRuntime.findRuntimeByUserId(input.userId);

    invariant(runtime, {
      code: 'BAD_REQUEST',
      message: 'Target user is not in a voice channel'
    });

    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.id, runtime.id))
      .get();

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Voice channel not found'
    });
    invariant(channel.type === ChannelType.VOICE, {
      code: 'BAD_REQUEST',
      message: 'Channel is not a voice channel'
    });
    invariant(!channel.isDm, {
      code: 'BAD_REQUEST',
      message: 'Direct message voice channels cannot be disconnected'
    });

    await ctx.needsChannelPermission(channel.id, ChannelPermission.JOIN);

    const userInChannel = runtime.getUser(input.userId);

    invariant(userInChannel, {
      code: 'BAD_REQUEST',
      message: 'Target user is not in a voice channel'
    });

    runtime.removeUser(input.userId);

    ctx.pubsub.publish(ServerEvents.USER_LEAVE_VOICE, {
      channelId: channel.id,
      userId: input.userId
    });
    ctx.pubsub.publishFor(input.userId, ServerEvents.USER_DISCONNECT_VOICE, {
      channelId: channel.id,
      userId: input.userId,
      moderatorId: ctx.user.id
    });
    enqueueActivityLog({
      type: ActivityLogType.VOICE_USER_DISCONNECTED,
      userId: input.userId,
      details: {
        channelId: channel.id,
        targetUserId: input.userId,
        disconnectedBy: ctx.user.id
      }
    });

    if (isSelfDisconnect) {
      ctx.currentVoiceChannelId = undefined;
    }

    logger.info(
      '%s disconnected user %d from voice channel %s',
      ctx.user.name,
      input.userId,
      channel.name
    );
  });

export { disconnectUserRoute };
