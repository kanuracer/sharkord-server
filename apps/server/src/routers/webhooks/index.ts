import { ChannelType, Permission, sha256 } from '@sharkord/shared';
import { randomUUIDv7 } from 'bun';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { channels, incomingWebhooks } from '../../db/schema';
import { invariant } from '../../utils/invariant';
import { protectedProcedure, t } from '../../utils/trpc';

const publicWebhookFields = {
  id: incomingWebhooks.id,
  name: incomingWebhooks.name,
  channelId: incomingWebhooks.channelId,
  createdBy: incomingWebhooks.createdBy,
  createdAt: incomingWebhooks.createdAt,
  updatedAt: incomingWebhooks.updatedAt,
  lastUsedAt: incomingWebhooks.lastUsedAt
};

const createToken = () => `${randomUUIDv7()}${randomUUIDv7()}`.replace(/-/g, '');

const listWebhooksRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_SETTINGS);
  return db.select(publicWebhookFields).from(incomingWebhooks).all();
});

const createWebhookRoute = protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(64),
      channelId: z.number().int().positive()
    })
  )
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SETTINGS);

    const channel = await db
      .select({ id: channels.id, type: channels.type, isDm: channels.isDm })
      .from(channels)
      .where(eq(channels.id, input.channelId))
      .limit(1)
      .get();

    invariant(channel && channel.type === ChannelType.TEXT && !channel.isDm, {
      code: 'BAD_REQUEST',
      message: 'Incoming webhooks require a regular text channel.'
    });

    const token = createToken();
    const tokenHash = await sha256(token);
    const webhook = await db
      .insert(incomingWebhooks)
      .values({
        name: input.name.trim(),
        channelId: input.channelId,
        tokenHash,
        createdBy: ctx.userId,
        createdAt: Date.now()
      })
      .returning(publicWebhookFields)
      .get();

    return { webhook, token };
  });

const deleteWebhookRoute = protectedProcedure
  .input(z.object({ webhookId: z.number().int().positive() }))
  .mutation(async ({ input, ctx }) => {
    await ctx.needsPermission(Permission.MANAGE_SETTINGS);
    await db.delete(incomingWebhooks).where(eq(incomingWebhooks.id, input.webhookId));
  });

const webhooksRouter = t.router({
  list: listWebhooksRoute,
  create: createWebhookRoute,
  delete: deleteWebhookRoute
});

export { webhooksRouter };
