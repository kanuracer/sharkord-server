import { afterEach, describe, expect, test } from 'bun:test';
import { desc, eq, sql } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { testsBaseUrl } from '../../__tests__/setup';
import { db } from '../../db';
import { files, messageFiles, messages } from '../../db/schema';

describe('kanuracer fork webhooks and retention', () => {
  afterEach(async () => {
    await db.delete(messageFiles);
    await db.delete(messages).where(sql`${messages.id} > 2`);
    await db.delete(files);
  });

  test('incoming webhooks can be managed by admins and post messages through the public token endpoint', async () => {
    const { caller } = await initTest(1);

    const created = await caller.webhooks.create({
      name: 'Builds',
      channelId: 1
    });

    expect(created.token.length).toBeGreaterThanOrEqual(32);
    expect(created.webhook.name).toBe('Builds');
    expect(created.webhook.channelId).toBe(1);
    expect('tokenHash' in created.webhook).toBe(false);

    const listed = await caller.webhooks.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.name).toBe('Builds');
    expect('tokenHash' in listed[0]!).toBe(false);

    const response = await fetch(`${testsBaseUrl}/webhooks/${created.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '<p>deploy done</p>' })
    });

    expect(response.status).toBe(200);

    const latest = await db
      .select()
      .from(messages)
      .where(eq(messages.channelId, 1))
      .orderBy(desc(messages.id))
      .limit(1)
      .get();

    expect(latest?.content).toBe('<p>deploy done</p>');
    expect(latest?.userId).toBeNull();
    expect(latest?.pluginId).toBe('incoming-webhook');
    expect(latest?.editable).toBe(false);
  });

  test('retention settings preview and cleanup old messages while preserving pinned messages', async () => {
    const { caller } = await initTest(1);
    const now = Date.now();
    const old = now - 45 * 24 * 60 * 60 * 1000;

    await caller.others.updateSettings({
      retentionCleanupEnabled: true,
      messageRetentionDays: 30,
      mediaRetentionDays: 0
    });

    await db.insert(messages).values([
      { channelId: 1, userId: 1, content: '<p>old</p>', createdAt: old },
      { channelId: 1, userId: 1, content: '<p>pinned old</p>', createdAt: old, pinned: true },
      { channelId: 1, userId: 1, content: '<p>new</p>', createdAt: now }
    ]);

    const preview = await caller.retention.preview();
    expect(preview.enabled).toBe(true);
    expect(preview.messageRetentionDays).toBe(30);
    expect(preview.messagesToDelete).toBe(1);

    const result = await caller.retention.run({ dryRun: false });
    expect(result.messagesDeleted).toBe(1);

    const remaining = await db.select().from(messages).where(eq(messages.channelId, 1));
    expect(remaining.some((message) => message.content === '<p>old</p>')).toBe(false);
    expect(remaining.some((message) => message.content === '<p>pinned old</p>')).toBe(true);
    expect(remaining.some((message) => message.content === '<p>new</p>')).toBe(true);
  });
});
