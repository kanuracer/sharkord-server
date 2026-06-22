import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import {
  channelReadStates,
  channels,
  directMessages,
  messages,
  settings
} from '../../db/schema';

describe('dms router', () => {
  test('should create a direct message channel and allow messaging', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({
      channelId,
      content: 'hello dm',
      files: []
    });

    const page = await caller2.messages.get({
      channelId,
      cursor: null,
      limit: 50
    });

    expect(page.messages.length).toBe(1);
    expect(page.messages[0]!.content).toBe('hello dm');
  });

  test('should reuse existing direct message channel for same pair', async () => {
    const { caller } = await initTest(1);

    const first = await caller.dms.open({ userId: 2 });
    const second = await caller.dms.open({ userId: 2 });

    expect(second.channelId).toBe(first.channelId);
  });

  test('should list direct message conversations', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await caller1.messages.send({
      channelId,
      content: 'list dm',
      files: []
    });

    const list1 = await caller1.dms.get();
    const list2 = await caller2.dms.get();

    expect(
      list1.some((dm) => dm.channelId === channelId && dm.userId === 2)
    ).toBe(true);
    expect(
      list2.some((dm) => dm.channelId === channelId && dm.userId === 1)
    ).toBe(true);
  });

  test('should reject creating direct message with self', async () => {
    const { caller } = await initTest(1);

    await expect(caller.dms.open({ userId: 1 })).rejects.toThrow(
      'Cannot create a direct message with yourself'
    );
  });

  test('should reject open and list when direct messages are disabled', async () => {
    const { caller } = await initTest(1);

    await tdb
      .update(settings)
      .set({
        directMessagesEnabled: false
      })
      .execute();

    await expect(caller.dms.open({ userId: 2 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );

    await expect(caller.dms.get()).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });

  test('should delete a direct message conversation for participants', async () => {
    const { caller: callerA } = await initTest(3);
    const { caller: callerB } = await initTest(4);

    await callerB.channels.markAsRead({ channelId: 3 });

    await callerA.dms.delete({ channelId: 3 });

    const listA = await callerA.dms.get();
    const listB = await callerB.dms.get();

    expect(listA.some((dm) => dm.channelId === 3)).toBe(false);
    expect(listB.some((dm) => dm.channelId === 3)).toBe(false);
    expect(
      await tdb.select().from(channels).where(eq(channels.id, 3)).get()
    ).toBeUndefined();
    expect(
      await tdb
        .select()
        .from(directMessages)
        .where(eq(directMessages.channelId, 3))
        .get()
    ).toBeUndefined();
    expect(
      await tdb.select().from(messages).where(eq(messages.channelId, 3))
    ).toHaveLength(0);
    expect(
      await tdb
        .select()
        .from(channelReadStates)
        .where(eq(channelReadStates.channelId, 3))
    ).toHaveLength(0);
  });

  test('should reject deleting a DM when user is not a participant', async () => {
    const { caller } = await initTest(1);

    await expect(caller.dms.delete({ channelId: 3 })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );
    expect(
      await tdb
        .select()
        .from(directMessages)
        .where(eq(directMessages.channelId, 3))
        .get()
    ).toBeDefined();
  });

  test('should reject deleting a non-DM channel through dms.delete', async () => {
    const { caller } = await initTest(1);

    await expect(caller.dms.delete({ channelId: 1 })).rejects.toThrow(
      'Direct message not found'
    );
    expect(
      await tdb.select().from(channels).where(eq(channels.id, 1)).get()
    ).toBeDefined();
  });

  test('should reject deleting direct message when direct messages are disabled', async () => {
    const { caller } = await initTest(3);

    await tdb
      .update(settings)
      .set({
        directMessagesEnabled: false
      })
      .execute();

    await expect(caller.dms.delete({ channelId: 3 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
    expect(
      await tdb
        .select()
        .from(directMessages)
        .where(eq(directMessages.channelId, 3))
        .get()
    ).toBeDefined();
  });

  test('should expose desktop capabilities for Sharkord Desktop compatibility', async () => {
    const { caller } = await initTest(1);

    await expect(caller.desktop.capabilities()).resolves.toEqual({
      flavor: 'kanuracer',
      capabilities: {
        directMessageDelete: true,
        ownerToken: true,
        serverSelfUpdate: true,
        voiceUserMove: true,
        mfaAppPasswords: true
      }
    });
  });

});
