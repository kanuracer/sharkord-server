import { Permission } from '@sharkord/shared';
import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { removeFile } from '../../db/mutations/files';
import { db } from '../../db';
import { getSettings } from '../../db/queries/server';
import {
  emojis,
  files,
  messageFiles,
  messages,
  settings,
  users
} from '../../db/schema';
import { protectedProcedure, t } from '../../utils/trpc';

const DAY_MS = 24 * 60 * 60 * 1000;

type RetentionPreview = {
  enabled: boolean;
  messageRetentionDays: number;
  mediaRetentionDays: number;
  messagesToDelete: number;
  filesToDelete: number;
};

async function getExpiredMessageIds(now = Date.now()): Promise<number[]> {
  const serverSettings = await getSettings();
  if (!serverSettings.retentionCleanupEnabled || serverSettings.messageRetentionDays <= 0) return [];
  const cutoff = now - serverSettings.messageRetentionDays * DAY_MS;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        lt(messages.createdAt, cutoff),
        or(eq(messages.pinned, false), isNull(messages.pinned))
      )
    )
    .all();
  return rows.map((row) => row.id);
}

async function getExpiredOrphanFileIds(now = Date.now()): Promise<number[]> {
  const serverSettings = await getSettings();
  if (!serverSettings.retentionCleanupEnabled || serverSettings.mediaRetentionDays <= 0) return [];
  const cutoff = now - serverSettings.mediaRetentionDays * DAY_MS;
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        lt(files.createdAt, cutoff),
        notInArray(files.id, db.select({ id: messageFiles.fileId }).from(messageFiles)),
        notInArray(files.id, db.select({ id: users.avatarId }).from(users).where(isNotNull(users.avatarId))),
        notInArray(files.id, db.select({ id: users.bannerId }).from(users).where(isNotNull(users.bannerId))),
        notInArray(files.id, db.select({ id: settings.logoId }).from(settings).where(isNotNull(settings.logoId))),
        notInArray(files.id, db.select({ id: emojis.fileId }).from(emojis))
      )
    )
    .all();
  return rows.map((row) => row.id);
}

async function buildPreview(): Promise<RetentionPreview> {
  const serverSettings = await getSettings();
  const [messageIds, fileIds] = await Promise.all([
    getExpiredMessageIds(),
    getExpiredOrphanFileIds()
  ]);
  return {
    enabled: serverSettings.retentionCleanupEnabled,
    messageRetentionDays: serverSettings.messageRetentionDays,
    mediaRetentionDays: serverSettings.mediaRetentionDays,
    messagesToDelete: messageIds.length,
    filesToDelete: fileIds.length
  };
}

const retentionPreviewRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SETTINGS);
  return buildPreview();
});

const retentionRunRoute = protectedProcedure
  .input(z.object({ dryRun: z.boolean().default(true) }).default({ dryRun: true }))
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SETTINGS);
    const [messageIds, fileIds] = await Promise.all([
      getExpiredMessageIds(),
      getExpiredOrphanFileIds()
    ]);

    if (!input.dryRun) {
      if (messageIds.length > 0) {
        await db.delete(messages).where(inArray(messages.id, messageIds));
      }
      for (const fileId of fileIds) {
        await removeFile(fileId);
      }
    }

    return {
      dryRun: input.dryRun,
      messagesDeleted: input.dryRun ? 0 : messageIds.length,
      filesDeleted: input.dryRun ? 0 : fileIds.length,
      messagesToDelete: messageIds.length,
      filesToDelete: fileIds.length
    };
  });

const retentionRouter = t.router({
  preview: retentionPreviewRoute,
  run: retentionRunRoute
});

export { retentionRouter };
