import type {
  TFile,
  TJoinedMessage,
  TJoinedMessageReaction,
  TMessage,
  TMessageReaction,
  TMessageReplyPreview
} from '@sharkord/shared';
import { and, count, desc, eq, inArray, notExists } from 'drizzle-orm';
import { db } from '..';
import { attachFileToken, signFile } from '../../helpers/files-crypto';
import {
  directMessages,
  files,
  messageFiles,
  messageReactions,
  messages,
  roles,
  userRoles
} from '../schema';
import { getSettings } from './server';

const decodeBasicEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

const textFromMessageHtml = (html = '') =>
  decodeBasicEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const extractRoleIdsFromAttributes = (html: string) => {
  const ids = new Set<number>();
  for (const match of html.matchAll(
    /data-role-id\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))/gi
  )) {
    const id = Number(match[1] ?? match[2] ?? match[3]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
};

const getRoleMentionTargetsByMessage = async (rows: TMessage[]) => {
  if (rows.length === 0)
    return new Map<number, { roleIds: number[]; userIds: number[] }>();

  const mentionableRoles = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(eq(roles.mentionable, true));

  if (mentionableRoles.length === 0)
    return new Map<number, { roleIds: number[]; userIds: number[] }>();

  const roleIdsByMessage = new Map<number, number[]>();
  const allRoleIds = new Set<number>();

  for (const message of rows) {
    const html = String(message.content ?? '');
    const body = textFromMessageHtml(html).toLowerCase();
    const attrRoleIds = extractRoleIdsFromAttributes(html);
    const matchedRoleIds = mentionableRoles
      .filter(
        (role) =>
          attrRoleIds.has(role.id) ||
          body.includes(`@&${role.name.toLowerCase()}`)
      )
      .map((role) => role.id);

    if (matchedRoleIds.length > 0) {
      roleIdsByMessage.set(message.id, matchedRoleIds);
      matchedRoleIds.forEach((roleId) => allRoleIds.add(roleId));
    }
  }

  if (allRoleIds.size === 0)
    return new Map<number, { roleIds: number[]; userIds: number[] }>();

  const membershipRows = await db
    .select({ roleId: userRoles.roleId, userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.roleId, [...allRoleIds]));

  const userIdsByRole = membershipRows.reduce<Map<number, number[]>>(
    (acc, row) => {
      const next = acc.get(row.roleId) ?? [];
      next.push(row.userId);
      acc.set(row.roleId, next);
      return acc;
    },
    new Map()
  );

  const result = new Map<number, { roleIds: number[]; userIds: number[] }>();
  for (const message of rows) {
    const roleIds = roleIdsByMessage.get(message.id) ?? [];
    if (roleIds.length === 0) continue;
    const userIds = [
      ...new Set(roleIds.flatMap((roleId) => userIdsByRole.get(roleId) ?? []))
    ].filter((userId) => userId !== message.userId);
    result.set(message.id, { roleIds, userIds });
  }

  return result;
};

const getReplyPreviewByMessageId = async (rows: TMessage[]) => {
  const replyToMessageIds = [
    ...new Set(
      rows
        .map((message) => message.replyToMessageId)
        .filter((messageId): messageId is number => messageId !== null)
    )
  ];

  if (replyToMessageIds.length === 0) {
    return {};
  }

  const replyRows = await db
    .select({
      id: messages.id,
      content: messages.content,
      userId: messages.userId,
      pluginId: messages.pluginId
    })
    .from(messages)
    .where(inArray(messages.id, replyToMessageIds));

  return replyRows.reduce<Record<number, TMessageReplyPreview>>((acc, row) => {
    acc[row.id] = row;

    return acc;
  }, {});
};

const getMessageByFileId = async (
  fileId: number
): Promise<TMessage | undefined> => {
  const row = await db
    .select({ message: messages })
    .from(messageFiles)
    .innerJoin(messages, eq(messages.id, messageFiles.messageId))
    .where(eq(messageFiles.fileId, fileId))
    .get();

  return row?.message;
};

const joinMessagesWithRelations = async (
  rows: TMessage[]
): Promise<TJoinedMessage[]> => {
  if (rows.length === 0) return [];

  const messageIds = rows.map((m) => m.id);

  const { storageSignedUrlsEnabled, storageSignedUrlsTtlSeconds } =
    await getSettings();

  const [fileRows, reactionRows, replyToMap] = await Promise.all([
    db
      .select({
        messageId: messageFiles.messageId,
        file: files
      })
      .from(messageFiles)
      .innerJoin(files, eq(messageFiles.fileId, files.id))
      .where(inArray(messageFiles.messageId, messageIds)),
    db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
        fileId: messageReactions.fileId,
        file: files
      })
      .from(messageReactions)
      .leftJoin(files, eq(messageReactions.fileId, files.id))
      .where(inArray(messageReactions.messageId, messageIds)),
    getReplyPreviewByMessageId(rows)
  ]);

  const filesByMessage = fileRows.reduce<Record<number, TFile[]>>(
    (acc, row) => {
      if (!acc[row.messageId]) {
        acc[row.messageId] = [];
      }

      const rowCopy = attachFileToken(
        row.file,
        storageSignedUrlsEnabled,
        storageSignedUrlsTtlSeconds
      );

      acc[row.messageId]!.push(rowCopy);

      return acc;
    },
    {}
  );

  const reactionsByMessage = reactionRows.reduce<
    Record<number, TJoinedMessageReaction[]>
  >((acc, r) => {
    const reaction: TJoinedMessageReaction = {
      messageId: r.messageId,
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt,
      fileId: r.fileId,
      file: signFile(
        r.file,
        storageSignedUrlsEnabled,
        storageSignedUrlsTtlSeconds
      )
    };

    if (!acc[r.messageId]) {
      acc[r.messageId] = [];
    }

    acc[r.messageId]!.push(reaction);

    return acc;
  }, {});

  const mentionTargetsByMessage = await getRoleMentionTargetsByMessage(rows);

  return rows.map((msg) => {
    const mentionTargets = mentionTargetsByMessage.get(msg.id);

    return {
      ...msg,
      files: filesByMessage[msg.id] ?? [],
      reactions: reactionsByMessage[msg.id] ?? [],
      replyTo:
        msg.replyToMessageId !== null
          ? (replyToMap[msg.replyToMessageId] ?? null)
          : null,
      mentionedRoleIds: mentionTargets?.roleIds ?? [],
      mentionedUserIds: mentionTargets?.userIds ?? []
    };
  });
};

const getMessage = async (
  messageId: number
): Promise<TJoinedMessage | undefined> => {
  const message = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
    .get();

  if (!message) return undefined;

  const [joined] = await joinMessagesWithRelations([message]);

  if (!joined) return undefined;

  let replyCount = 0;

  if (!message.parentMessageId) {
    const replyCountRow = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.parentMessageId, messageId))
      .get();

    replyCount = replyCountRow?.count ?? 0;
  }

  return { ...joined, replyCount };
};

const getNonDirectMessagesFromUserId = async (
  userId: number
): Promise<TMessage[]> =>
  db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        notExists(
          db
            .select()
            .from(directMessages)
            .where(eq(directMessages.channelId, messages.channelId))
        )
      )
    )
    .orderBy(desc(messages.createdAt));

const getReaction = async (
  messageId: number,
  emoji: string,
  userId: number
): Promise<TMessageReaction | undefined> =>
  db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.emoji, emoji),
        eq(messageReactions.userId, userId)
      )
    )
    .get();

export {
  attachFileToken,
  getMessage,
  getMessageByFileId,
  getNonDirectMessagesFromUserId,
  getReaction,
  joinMessagesWithRelations
};
