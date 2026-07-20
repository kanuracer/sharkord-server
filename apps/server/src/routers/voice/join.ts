import {
  ChannelPermission,
  ChannelType,
  Permission,
  ServerEvents
} from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config';
import { db } from '../../db';
import { channelUserCan } from '../../db/queries/channels';
import { channels } from '../../db/schema';
import {
  consumeVoiceMoveGrant,
  hasVoiceMoveGrant,
  withVoiceMoveLock
} from '../../helpers/voice-move-grants';
import { logger } from '../../logger';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

const joinVoiceRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.joinVoiceChannel.maxRequests,
  windowMs: config.rateLimiters.joinVoiceChannel.windowMs,
  logLabel: 'joinVoice'
})
  .input(
    z.object({
      channelId: z.number(),
      state: z.object({
        micMuted: z.boolean().default(false),
        soundMuted: z.boolean().default(false)
      })
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);
    return withVoiceMoveLock(ctx.user.id, async () => {
      const hasPendingMoveGrant = hasVoiceMoveGrant(ctx.user.id, input.channelId);
      if (!hasPendingMoveGrant) {
        await ctx.needsChannelPermission(input.channelId, ChannelPermission.JOIN);
      }

      const channel = await db
        .select()
        .from(channels)
        .where(eq(channels.id, input.channelId))
        .get();

      invariant(channel, {
        code: 'NOT_FOUND',
        message: 'Channel not found'
      });

      invariant(channel.type === ChannelType.VOICE, {
        code: 'BAD_REQUEST',
        message: 'Channel is not a voice channel'
      });

      const hasJoinPermission = await channelUserCan(
        input.channelId,
        ctx.user.id,
        ChannelPermission.JOIN
      );
      const userAlreadyInVoiceChannel = VoiceRuntime.findRuntimeByUserId(
        ctx.user.id
      );

      invariant(!userAlreadyInVoiceChannel, {
        code: 'BAD_REQUEST',
        message: 'User already in a voice channel'
      });

      const canJoin =
        hasJoinPermission ||
        (hasPendingMoveGrant && consumeVoiceMoveGrant(ctx.user.id, input.channelId));
      invariant(canJoin, {
        code: 'FORBIDDEN',
        message: 'Insufficient channel permissions'
      });

      const runtime = VoiceRuntime.findById(input.channelId);

      invariant(runtime, {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Voice runtime not found for this channel'
      });

      runtime.addUser(ctx.user.id, input.state);

      const state = runtime.getUserState(ctx.user.id);

      ctx.currentVoiceChannelId = channel.id;
      ctx.pubsub.publish(ServerEvents.USER_JOIN_VOICE, {
        channelId: input.channelId,
        userId: ctx.user.id,
        state
      });

      logger.info('%s joined voice channel %s', ctx.user.name, channel.name);

      const router = runtime.getRouter();

      return {
        routerRtpCapabilities: router.rtpCapabilities
      };
    });
  });

export { joinVoiceRoute };
