import { type TMessage } from '@sharkord/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { getChannelsForUser } from '../../db/queries/channels';
import { joinMessagesWithRelations } from '../../db/queries/messages';
import { channelReadStates, messages } from '../../db/schema';
import { protectedProcedure } from '../../utils/trpc';

const getThreadInboxRoute = protectedProcedure
  .input(
    z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()
  )
  .query(async ({ ctx, input }) => {
    const limit = input?.limit ?? 50;
    const accessibleChannels = await getChannelsForUser(ctx.userId);
    const channelIds = accessibleChannels.map((channel) => channel.id);

    if (channelIds.length === 0) {
      return { items: [], totalUnreadReplies: 0 };
    }

    const readStates = await db
      .select({
        channelId: channelReadStates.channelId,
        lastReadMessageId: channelReadStates.lastReadMessageId
      })
      .from(channelReadStates)
      .where(eq(channelReadStates.userId, ctx.userId));
    const lastReadByChannel = new Map(
      readStates.map((state) => [state.channelId, state.lastReadMessageId ?? 0])
    );

    const rootRows = await db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.channelId, channelIds),
          isNull(messages.parentMessageId)
        )
      );
    const rootIds = rootRows.map((message) => message.id);

    if (rootIds.length === 0) {
      return { items: [], totalUnreadReplies: 0 };
    }

    const replyRows = await db
      .select()
      .from(messages)
      .where(inArray(messages.parentMessageId, rootIds))
      .orderBy(desc(messages.createdAt));

    const rootsById = new Map(rootRows.map((message) => [message.id, message]));
    const repliesByParent = new Map<number, TMessage[]>();

    for (const reply of replyRows) {
      if (!reply.parentMessageId) continue;
      const next = repliesByParent.get(reply.parentMessageId) ?? [];
      next.push(reply);
      repliesByParent.set(reply.parentMessageId, next);
    }

    const candidates = [...repliesByParent.entries()]
      .flatMap(([parentMessageId, replies]) => {
        const parent = rootsById.get(parentMessageId);
        if (!parent) return [];
        const lastReadMessageId = lastReadByChannel.get(parent.channelId) ?? 0;
        const unreadReplyCount = replies.filter(
          (reply) => reply.userId !== ctx.userId && reply.id > lastReadMessageId
        ).length;
        if (unreadReplyCount === 0) return [];
        return [
          {
            channelId: parent.channelId,
            parentMessageId,
            parent,
            latestReply: replies[0]!,
            replyCount: replies.length,
            unreadReplyCount
          }
        ];
      })
      .sort((a, b) => b.latestReply.createdAt - a.latestReply.createdAt)
      .slice(0, limit);

    if (candidates.length === 0) {
      return { items: [], totalUnreadReplies: 0 };
    }

    const joinedParents = await joinMessagesWithRelations(
      candidates.map((item) => item.parent)
    );
    const joinedReplies = await joinMessagesWithRelations(
      candidates.map((item) => item.latestReply)
    );
    const parentsById = new Map(
      joinedParents.map((message) => [message.id, message])
    );
    const repliesById = new Map(
      joinedReplies.map((message) => [message.id, message])
    );

    return {
      totalUnreadReplies: candidates.reduce(
        (sum, item) => sum + item.unreadReplyCount,
        0
      ),
      items: candidates.map((item) => ({
        channelId: item.channelId,
        parentMessageId: item.parentMessageId,
        parentMessage: parentsById.get(item.parent.id) ?? item.parent,
        latestReply: repliesById.get(item.latestReply.id) ?? item.latestReply,
        replyCount: item.replyCount,
        unreadReplyCount: item.unreadReplyCount
      }))
    };
  });

export { getThreadInboxRoute };
