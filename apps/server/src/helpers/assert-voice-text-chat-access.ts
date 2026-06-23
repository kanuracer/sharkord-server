import { ChannelType } from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { channels } from '../db/schema';
import { VoiceRuntime } from '../runtimes/voice';
import { invariant } from '../utils/invariant';
import type { Context } from '../utils/trpc';

const assertVoiceTextChatAccess = async (ctx: Context, channelId: number) => {
  const channel = await db
    .select({ id: channels.id, type: channels.type, isDm: channels.isDm })
    .from(channels)
    .where(eq(channels.id, channelId))
    .get();

  if (!channel || channel.isDm || channel.type !== ChannelType.VOICE) return;

  const runtime = VoiceRuntime.findRuntimeByUserId(ctx.user.id);

  invariant(!runtime || runtime.id === channelId, {
    code: 'FORBIDDEN',
    message: 'Join this voice channel to use its text chat.'
  });
};

export { assertVoiceTextChatAccess };
