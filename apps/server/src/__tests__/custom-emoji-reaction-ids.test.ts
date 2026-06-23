import type { TTempFile } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { messageReactions } from '../db/schema';
import { initTest, uploadFile } from './helpers';

const uploadEmojiFile = async (mockedToken: string, name: string) => {
  const file = new File([`${name} emoji`], `${name}.png`, {
    type: 'image/png'
  });
  const response = await uploadFile(file, mockedToken);
  return (await response.json()) as TTempFile;
};

const getTextChannel = (
  initialData: Awaited<ReturnType<typeof initTest>>['initialData']
) =>
  initialData.channels.find(
    (channel) => channel.type.toLowerCase() === 'text'
  )!;

describe('custom emoji reaction ids', () => {
  test('keeps native unicode reactions separate from custom emoji names', async () => {
    const { caller, mockedToken, initialData } = await initTest();
    const channel = getTextChannel(initialData);
    const temp = await uploadEmojiFile(mockedToken, 'party');

    await caller.emojis.add([{ fileId: temp.id, name: 'party' }]);
    await caller.messages.send({
      channelId: channel.id,
      content: 'collision check'
    });
    const page = await caller.messages.get({ channelId: channel.id, limit: 1 });
    const message = page.messages[0]!;

    await caller.messages.toggleReaction({
      messageId: message.id,
      emoji: '🎉'
    });

    const [reaction] = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, message.id),
          eq(messageReactions.userId, 1),
          eq(messageReactions.emoji, '🎉')
        )
      );

    expect(reaction?.fileId).toBeNull();
  });

  test('stores canonical custom emoji reaction ids with the matching file id', async () => {
    const { caller, mockedToken, initialData } = await initTest();
    const channel = getTextChannel(initialData);
    const temp = await uploadEmojiFile(mockedToken, 'party');

    await caller.emojis.add([{ fileId: temp.id, name: 'party' }]);
    const [customEmoji] = (await caller.emojis.getAll()).filter(
      (emoji) => emoji.name === 'party'
    );
    await caller.messages.send({
      channelId: channel.id,
      content: 'custom reaction check'
    });
    const page = await caller.messages.get({ channelId: channel.id, limit: 1 });
    const message = page.messages[0]!;
    const reactionKey = `custom:${customEmoji!.id}:party`;

    await caller.messages.toggleReaction({
      messageId: message.id,
      emoji: reactionKey
    });

    const [reaction] = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, message.id),
          eq(messageReactions.userId, 1),
          eq(messageReactions.emoji, reactionKey)
        )
      );

    expect(reaction?.fileId).toBe(customEmoji!.fileId);
  });
});
