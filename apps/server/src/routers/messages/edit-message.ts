import {
  FileSaveType,
  Permission,
  getPlainTextFromHtml,
  isEmptyMessage
} from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../../config';
import { db } from '../../db';
import { publishMessage } from '../../db/publishers';
import { isDirectMessageChannel } from '../../db/queries/dms';
import { getSettings } from '../../db/queries/server';
import { messageFiles, messages } from '../../db/schema';
import { assertChannelAccess } from '../../helpers/assert-channel-access';
import { sanitizeMessageHtml } from '../../helpers/sanitize-html';
import { eventBus } from '../../plugins/event-bus';
import { enqueueProcessMetadata } from '../../queues/message-metadata';
import { fileManager } from '../../utils/file-manager';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, rateLimitedProcedure } from '../../utils/trpc';

const editMessageRoute = rateLimitedProcedure(protectedProcedure, {
  maxRequests: config.rateLimiters.sendAndEditMessage.maxRequests,
  windowMs: config.rateLimiters.sendAndEditMessage.windowMs,
  logLabel: 'editMessage'
})
  .input(
    z.object({
      messageId: z.number(),
      content: z.string(),
      files: z.array(z.string()).optional()
    })
  )
  .mutation(async ({ input, ctx }) => {
    const message = await db
      .select({
        userId: messages.userId,
        pluginId: messages.pluginId,
        channelId: messages.channelId,
        editable: messages.editable
      })
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .limit(1)
      .get();

    invariant(message, {
      code: 'NOT_FOUND',
      message: 'Message not found'
    });

    await assertChannelAccess(ctx, message.channelId);

    invariant(message.editable, {
      code: 'FORBIDDEN',
      message: 'This message is not editable'
    });

    invariant(
      message.userId === ctx.user.id ||
        (await ctx.hasPermission(Permission.MANAGE_MESSAGES)),
      {
        code: 'FORBIDDEN',
        message: 'You do not have permission to edit this message'
      }
    );

    invariant(!isEmptyMessage(input.content), {
      code: 'BAD_REQUEST',
      message: 'Message cannot be empty.'
    });

    const sanitizedContent = sanitizeMessageHtml(input.content);

    invariant(!isEmptyMessage(sanitizedContent), {
      code: 'BAD_REQUEST',
      message:
        'Your message only contained unsupported or removed content, so there was nothing to send.'
    });

    const limitedFiles = input.files
      ? input.files.slice(0, Math.max(0, (await getSettings()).storageMaxFilesPerMessage))
      : undefined;

    if (limitedFiles && limitedFiles.length > 0) {
      const [settings, isDmChannel] = await Promise.all([
        getSettings(),
        isDirectMessageChannel(message.channelId)
      ]);

      invariant(settings.storageUploadEnabled, {
        code: 'FORBIDDEN',
        message: 'File uploads are disabled on this server'
      });

      if (isDmChannel) {
        invariant(settings.storageFileSharingInDirectMessages, {
          code: 'FORBIDDEN',
          message: 'File sharing in direct messages is disabled on this server'
        });
      }
    }

    await db
      .update(messages)
      .set({
        content: sanitizedContent,
        updatedAt: Date.now(),
        editedAt: Date.now(),
        editedBy: ctx.user.id
      })
      .where(eq(messages.id, input.messageId));

    if (limitedFiles) {
      await db.delete(messageFiles).where(eq(messageFiles.messageId, input.messageId));

      for (const tempFileId of limitedFiles) {
        const newFile = await fileManager.saveFile(
          tempFileId,
          ctx.userId,
          FileSaveType.MESSAGE
        );

        await db.insert(messageFiles).values({
          messageId: input.messageId,
          fileId: newFile.id,
          createdAt: Date.now()
        });
      }
    }

    publishMessage(input.messageId, message.channelId, 'update');
    enqueueProcessMetadata(sanitizedContent, input.messageId);

    eventBus.emit('message:updated', {
      messageId: input.messageId,
      channelId: message.channelId,
      userId: message.userId,
      pluginId: message.pluginId,
      content: sanitizedContent,
      textContent: getPlainTextFromHtml(sanitizedContent)
    });
  });

export { editMessageRoute };
