import {
  ActivityLogType,
  ChannelPermission,
  ChannelType,
  Permission,
  ServerEvents,
  StreamKind
} from '@sharkord/shared';
import { eq } from 'drizzle-orm';
import z from 'zod';
import { db } from '../../db';
import { channels } from '../../db/schema';
import { logger } from '../../logger';
import { enqueueActivityLog } from '../../queues/activity-log';
import { VoiceRuntime } from '../../runtimes/voice';
import { invariant } from '../../utils/invariant';
import { protectedProcedure } from '../../utils/trpc';

const moderateableKinds = [
  StreamKind.VIDEO,
  StreamKind.SCREEN,
  StreamKind.SCREEN_AUDIO
] as const;

const closeUserProducerRoute = protectedProcedure
  .input(
    z.object({
      userId: z.number(),
      kind: z.enum(moderateableKinds)
    })
  )
  .mutation(async ({ ctx, input }) => {
    await Promise.all([
      ctx.needsPermission(Permission.JOIN_VOICE_CHANNELS),
      ctx.needsPermission(Permission.MOVE_MEMBERS)
    ]);

    invariant(ctx.user.id !== input.userId, {
      code: 'BAD_REQUEST',
      message: 'Use closeProducer to stop your own media'
    });

    const runtime = VoiceRuntime.findRuntimeByUserId(input.userId);

    invariant(runtime, {
      code: 'BAD_REQUEST',
      message: 'Target user is not in a voice channel'
    });

    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.id, runtime.id))
      .get();

    invariant(channel, {
      code: 'NOT_FOUND',
      message: 'Voice channel not found'
    });
    invariant(channel.type === ChannelType.VOICE, {
      code: 'BAD_REQUEST',
      message: 'Channel is not a voice channel'
    });
    invariant(!channel.isDm, {
      code: 'BAD_REQUEST',
      message: 'Direct message voice channels cannot be moderated'
    });

    await ctx.needsChannelPermission(channel.id, ChannelPermission.JOIN);

    const kindsToClose =
      input.kind === StreamKind.SCREEN
        ? [StreamKind.SCREEN, StreamKind.SCREEN_AUDIO]
        : [input.kind];
    const closedKinds = kindsToClose.filter((kind) =>
      runtime.removeProducer(input.userId, kind)
    );

    invariant(closedKinds.length > 0, {
      code: 'BAD_REQUEST',
      message: 'Target media producer is not active'
    });

    if (closedKinds.includes(StreamKind.VIDEO)) {
      runtime.updateUserState(input.userId, { webcamEnabled: false });
    }
    if (
      closedKinds.includes(StreamKind.SCREEN) ||
      closedKinds.includes(StreamKind.SCREEN_AUDIO)
    ) {
      runtime.updateUserState(input.userId, { sharingScreen: false });
    }

    for (const kind of closedKinds) {
      ctx.pubsub.publishForChannel(
        channel.id,
        ServerEvents.VOICE_PRODUCER_CLOSED,
        {
          channelId: channel.id,
          remoteId: input.userId,
          kind
        }
      );
    }

    enqueueActivityLog({
      type: ActivityLogType.VOICE_USER_DISCONNECTED,
      userId: ctx.user.id,
      details: {
        channelId: channel.id,
        targetUserId: input.userId,
        disconnectedBy: ctx.user.id
      }
    });

    logger.info(
      '%s stopped %s media for user %d in voice channel %s',
      ctx.user.name,
      input.kind,
      input.userId,
      channel.name
    );

    return { closedKinds };
  });

export { closeUserProducerRoute };
