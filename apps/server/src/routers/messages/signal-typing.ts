import { ChannelPermission, Permission, ServerEvents } from '@sharkord/shared';
import { z } from 'zod';
import { config } from '../../config';
import { getAffectedOnlineUserIdsForChannel } from '../../db/queries/channels';
import { assertDmChannel } from '../../db/queries/dms';
import { assertVoiceTextChatAccess } from '../../helpers/assert-voice-text-chat-access';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

const signalTypingRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.signalTyping.maxRequests,
  windowMs: config.rateLimiters.signalTyping.windowMs,
  logLabel: 'signalTyping'
})
  .input(
    z.object({
      channelId: z.number(),
      parentMessageId: z.number().optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const affectedUserIds = await getAffectedOnlineUserIdsForChannel(input.channelId, {
      permission: ChannelPermission.VIEW_CHANNEL
    });

    await Promise.all([
      ctx.needsPermission(Permission.SEND_MESSAGES),
      ctx.needsChannelPermission(
        input.channelId,
        ChannelPermission.SEND_MESSAGES
      ),
      assertDmChannel(input.channelId, ctx.userId),
      assertVoiceTextChatAccess(ctx, input.channelId)
    ]);

    ctx.pubsub.publishFor(affectedUserIds, ServerEvents.MESSAGE_TYPING, {
      channelId: input.channelId,
      userId: ctx.userId,
      parentMessageId: input.parentMessageId
    });
  });

export { signalTypingRoute };
