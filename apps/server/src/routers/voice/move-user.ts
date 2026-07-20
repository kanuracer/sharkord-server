import { ChannelPermission, ChannelType, Permission, ServerEvents } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config';
import { db } from '../../db';
import {
  publishHiddenChannelToUser,
  unpublishHiddenChannelFromUser
} from '../../db/publishers';
import { userCan } from '../../db/queries/roles';
import { channels } from '../../db/schema';
import {
  expireVoiceMoveGrant,
  grantVoiceMove,
  withVoiceMoveLock
} from '../../helpers/voice-move-grants';
import { logger } from '../../logger';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

const moveUserRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.moveMembers.maxRequests,
  windowMs: config.rateLimiters.moveMembers.windowMs,
  logLabel: 'moveMembers'
})
  .input(
    z.object({
      userId: z.number(),
      destinationChannelId: z.number()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const isSelfMove = ctx.user.id === input.userId;

    if (isSelfMove) {
      await ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS);
    } else {
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

    await ctx.needsChannelPermission(
      destinationChannel.id,
      ChannelPermission.JOIN
    );

    const targetCanUseVoice = await userCan(
      input.userId,
      Permission.JOIN_VOICE_CHANNELS
    );

    invariant(targetCanUseVoice, {
      code: 'FORBIDDEN',
      message: 'Target user is not allowed to use voice channels'
    });

    await withVoiceMoveLock(input.userId, async () => {
      const grant = grantVoiceMove(input.userId, destinationChannel.id);
      if (
        grant.previousChannelId &&
        grant.previousChannelId !== destinationChannel.id
      ) {
        await unpublishHiddenChannelFromUser(input.userId, grant.previousChannelId);
      }
      await publishHiddenChannelToUser(input.userId, destinationChannel.id);
      const expiryTimer = setTimeout(() => {
        const expiredChannelId = expireVoiceMoveGrant(input.userId, grant.token);
        if (!expiredChannelId) return;

        void unpublishHiddenChannelFromUser(input.userId, expiredChannelId).catch(
          (error) => {
            logger.error(
              'Failed to revoke expired voice move channel %d for user %d: %s',
              expiredChannelId,
              input.userId,
              error
            );
          }
        );
      }, Math.max(0, grant.expiresAt - Date.now()));
      expiryTimer.unref();

      ctx.pubsub.publishFor(input.userId, ServerEvents.USER_VOICE_MOVED, {
        sourceChannelId: sourceChannel.id,
        destinationChannelId: destinationChannel.id
      });
    });

    logger.info(
      '%s directed user %d from voice channel %s to %s',
      ctx.user.name,
      input.userId,
      sourceChannel.name,
      destinationChannel.name
    );
  });

export { moveUserRoute };
