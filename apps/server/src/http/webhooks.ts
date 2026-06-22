import { ChannelType, getPlainTextFromHtml, isEmptyMessage, sha256 } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import http from 'http';
import { z } from 'zod';
import { db } from '../db';
import { publishMessage } from '../db/publishers';
import { channels, incomingWebhooks, messages } from '../db/schema';
import { enqueueProcessMetadata } from '../queues/message-metadata';
import { sanitizeMessageHtml } from '../helpers/sanitize-html';
import { eventBus } from '../plugins/event-bus';
import { getRequestPathname } from './helpers';

const WEBHOOK_PLUGIN_ID = 'incoming-webhook';
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

const webhookPayloadSchema = z.object({
  content: z.string().min(1).max(4000)
});

const readJsonBody = async (req: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_WEBHOOK_BODY_BYTES) throw new Error('Payload too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const incomingWebhookRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const pathname = getRequestPathname(req) || '';
  const token = decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '');
  if (!token) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Webhook not found' }));
    return;
  }

  let parsed: z.infer<typeof webhookPayloadSchema>;
  try {
    parsed = webhookPayloadSchema.parse(await readJsonBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid webhook payload' }));
    return;
  }

  const tokenHash = await sha256(token);
  const webhook = await db
    .select()
    .from(incomingWebhooks)
    .where(eq(incomingWebhooks.tokenHash, tokenHash))
    .limit(1)
    .get();

  if (!webhook) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Webhook not found' }));
    return;
  }

  const channel = await db
    .select({ id: channels.id, type: channels.type, isDm: channels.isDm })
    .from(channels)
    .where(eq(channels.id, webhook.channelId))
    .limit(1)
    .get();

  if (!channel || channel.type !== ChannelType.TEXT || channel.isDm) {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Webhook channel is not available' }));
    return;
  }

  const content = sanitizeMessageHtml(parsed.content);
  if (isEmptyMessage(content)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Message cannot be empty' }));
    return;
  }

  const message = await db
    .insert(messages)
    .values({
      channelId: webhook.channelId,
      userId: null,
      pluginId: WEBHOOK_PLUGIN_ID,
      content,
      editable: false,
      createdAt: Date.now()
    })
    .returning({ id: messages.id })
    .get();

  await db
    .update(incomingWebhooks)
    .set({ lastUsedAt: Date.now() })
    .where(eq(incomingWebhooks.id, webhook.id));

  publishMessage(message.id, webhook.channelId, 'create');
  enqueueProcessMetadata(content, message.id);
  eventBus.emit('message:created', {
    messageId: message.id,
    channelId: webhook.channelId,
    userId: null,
    pluginId: WEBHOOK_PLUGIN_ID,
    content,
    textContent: getPlainTextFromHtml(content)
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ messageId: message.id }));
};

export { incomingWebhookRouteHandler };
