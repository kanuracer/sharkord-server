import { describe, expect, test } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { db } from '../../db';
import { channels } from '../../db/schema';

describe('channels reorder', () => {
  test('moves a channel into another category and persists target order atomically', async () => {
    const { caller } = await initTest(1);

    await caller.channels.reorder({
      categoryId: 2,
      channelIds: [1, 2]
    });

    const movedChannels = await db
      .select({ id: channels.id, categoryId: channels.categoryId, position: channels.position })
      .from(channels)
      .where(eq(channels.categoryId, 2))
      .orderBy(asc(channels.position), asc(channels.id));

    expect(movedChannels).toEqual([
      { id: 1, categoryId: 2, position: 1 },
      { id: 2, categoryId: 2, position: 2 }
    ]);
  });
});
