import { ChannelType, Permission, ServerEvents, StreamKind } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { db } from '../../db';
import {
  channels,
  directMessages,
  rolePermissions,
  roles,
  userRoles
} from '../../db/schema';
import { VoiceRuntime } from '../../runtimes/voice';
import { pubsub } from '../../utils/pubsub';

const clearVoiceUser = (userId: number) => {
  VoiceRuntime.findRuntimeByUserId(userId)?.removeUser(userId);
};

describe('voice router', () => {
  test('should rate limit excessive voice join attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 20; i++) {
      await expect(
        caller.voice.join({
          channelId: 999999,
          state: {
            micMuted: false,
            soundMuted: false
          }
        })
      ).rejects.toThrow('Insufficient channel permissions');
    }

    await expect(
      caller.voice.join({
        channelId: 999999,
        state: {
          micMuted: false,
          soundMuted: false
        }
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should move the current user between voice channels', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Move Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Move Dest',
      categoryId: 2
    });

    const { caller } = await initTest(2);
    await caller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    await caller.voice.moveUser({ userId: 2, destinationChannelId });

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeDefined();
    expect(VoiceRuntime.findById(destinationChannelId)?.getUser(2)).toBeUndefined();

    await caller.voice.leave();
    await caller.voice.join({
      channelId: destinationChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeUndefined();
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUser(2)?.state
    ).toMatchObject({
      micMuted: true,
      soundMuted: false
    });

    await caller.voice.updateState({ micMuted: false });
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUserState(2).micMuted
    ).toBe(false);
  });

  test('should allow owners to move another user between voice channels', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Owner Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Owner Dest',
      categoryId: 2
    });

    const { caller: memberCaller } = await initTest(2);
    await memberCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: false, soundMuted: true }
    });

    await ownerCaller.voice.moveUser({ userId: 2, destinationChannelId });

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeDefined();
    expect(VoiceRuntime.findById(destinationChannelId)?.getUser(2)).toBeUndefined();

    await memberCaller.voice.leave();
    await memberCaller.voice.join({
      channelId: destinationChannelId,
      state: { micMuted: false, soundMuted: true }
    });

    await memberCaller.voice.updateState({ soundMuted: false });
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUserState(2).soundMuted
    ).toBe(false);
  });

  test('should grant and privately notify a moved user before that user reconnects', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Moderated Move Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Hidden Move Dest',
      categoryId: 2
    });
    await db
      .update(channels)
      .set({ private: true })
      .where(eq(channels.id, destinationChannelId));

    const { caller: targetCaller } = await initTest(2);
    await targetCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    const movedEvents: Array<{ destinationChannelId: number }> = [];
    const targetChannels: number[] = [];
    const targetChannelDeletes: number[] = [];
    const otherChannels: number[] = [];
    const movedSubscription = pubsub
      .subscribeFor(2, ServerEvents.USER_VOICE_MOVED)
      .subscribe({ next: (event) => movedEvents.push(event) });
    const targetChannelSubscription = pubsub
      .subscribeFor(2, ServerEvents.CHANNEL_CREATE)
      .subscribe({ next: (channel) => targetChannels.push(channel.id) });
    const targetChannelDeleteSubscription = pubsub
      .subscribeFor(2, ServerEvents.CHANNEL_DELETE)
      .subscribe({ next: (channelId) => targetChannelDeletes.push(channelId) });
    const otherChannelSubscription = pubsub
      .subscribeFor(3, ServerEvents.CHANNEL_CREATE)
      .subscribe({ next: (channel) => otherChannels.push(channel.id) });

    await ownerCaller.voice.moveUser({ userId: 2, destinationChannelId });

    expect(movedEvents).toEqual([{ destinationChannelId }]);
    expect(targetChannels).toEqual([destinationChannelId]);
    expect(otherChannels).toEqual([]);
    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeDefined();
    expect(VoiceRuntime.findById(destinationChannelId)?.getUser(2)).toBeUndefined();

    await targetCaller.voice.leave();
    await targetCaller.voice.join({
      channelId: destinationChannelId,
      state: { micMuted: true, soundMuted: false }
    });

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeUndefined();
    expect(VoiceRuntime.findById(destinationChannelId)?.getUser(2)?.state).toMatchObject({
      micMuted: true,
      soundMuted: false
    });

    await targetCaller.voice.leave();
    expect(targetChannelDeletes).toEqual([destinationChannelId]);
    await expect(
      targetCaller.voice.join({
        channelId: destinationChannelId,
        state: { micMuted: true, soundMuted: false }
      })
    ).rejects.toThrow('Insufficient channel permissions');

    movedSubscription.unsubscribe();
    targetChannelSubscription.unsubscribe();
    targetChannelDeleteSubscription.unsubscribe();
    otherChannelSubscription.unsubscribe();
  });

  test('should reject a moderator move when the target lacks JOIN_VOICE_CHANNELS', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'No Voice Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'No Voice Destination',
      categoryId: 2
    });
    const { caller: targetCaller } = await initTest(2);
    await targetCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: false, soundMuted: false }
    });

    const defaultRole = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isDefault, true))
      .get();
    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, defaultRole!.id),
          eq(rolePermissions.permission, Permission.JOIN_VOICE_CHANNELS)
        )
      );

    await expect(
      ownerCaller.voice.moveUser({ userId: 2, destinationChannelId })
    ).rejects.toThrow('Target user is not allowed to use voice channels');
  });

  test('should allow owners to disconnect another user from voice', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const channelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Disconnect Target',
      categoryId: 2
    });

    const { caller: memberCaller } = await initTest(4);
    clearVoiceUser(4);
    await memberCaller.voice.join({
      channelId,
      state: { micMuted: false, soundMuted: true }
    });

    await ownerCaller.voice.disconnectUser({ userId: 4 });

    expect(VoiceRuntime.findById(channelId)?.getUser(4)).toBeUndefined();
  });

  test('should allow users with MOVE_MEMBERS to move another user', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Permission Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Permission Dest',
      categoryId: 2
    });

    const { caller: targetCaller } = await initTest(2);
    await targetCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: false, soundMuted: true }
    });

    const [moveRole] = await db
      .insert(roles)
      .values({
        name: 'Voice Mover',
        color: '#5865f2',
        isPersistent: false,
        isDefault: false,
        storageQuotaOverrideEnabled: false,
        storageSpaceQuota: 0,
        createdAt: Date.now()
      })
      .returning();

    await db.insert(rolePermissions).values({
      roleId: moveRole!.id,
      permission: Permission.MOVE_MEMBERS,
      createdAt: Date.now()
    });
    await db.insert(userRoles).values({
      userId: 3,
      roleId: moveRole!.id,
      createdAt: Date.now()
    });

    const { caller: moverCaller } = await initTest(3);
    await moverCaller.voice.moveUser({ userId: 2, destinationChannelId });

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeDefined();
    expect(VoiceRuntime.findById(destinationChannelId)?.getUser(2)).toBeUndefined();
  });

  test('should allow users with MOVE_MEMBERS to disconnect another user', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const channelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Permission Disconnect',
      categoryId: 2
    });

    const { caller: targetCaller } = await initTest(4);
    clearVoiceUser(4);
    await targetCaller.voice.join({
      channelId,
      state: { micMuted: false, soundMuted: true }
    });

    const [moveRole] = await db
      .insert(roles)
      .values({
        name: 'Voice Disconnector',
        color: '#5865f2',
        isPersistent: false,
        isDefault: false,
        storageQuotaOverrideEnabled: false,
        storageSpaceQuota: 0,
        createdAt: Date.now()
      })
      .returning();

    await db.insert(rolePermissions).values({
      roleId: moveRole!.id,
      permission: Permission.MOVE_MEMBERS,
      createdAt: Date.now()
    });
    await db.insert(userRoles).values({
      userId: 3,
      roleId: moveRole!.id,
      createdAt: Date.now()
    });

    const { caller: moverCaller } = await initTest(3);
    await moverCaller.voice.disconnectUser({ userId: 4 });

    expect(VoiceRuntime.findById(channelId)?.getUser(4)).toBeUndefined();
  });

  test('should forbid regular users from moving another user', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Forbidden Source',
      categoryId: 2
    });
    const destinationChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Forbidden Dest',
      categoryId: 2
    });

    const { caller: targetCaller } = await initTest(2);
    await targetCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: false, soundMuted: false }
    });

    const { caller: nonAdminCaller } = await initTest(3);
    await expect(
      nonAdminCaller.voice.moveUser({ userId: 2, destinationChannelId })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should forbid regular users from disconnecting another user', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const channelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Forbidden Disconnect',
      categoryId: 2
    });

    const { caller: targetCaller } = await initTest(4);
    clearVoiceUser(4);
    await targetCaller.voice.join({
      channelId,
      state: { micMuted: false, soundMuted: false }
    });

    const { caller: nonAdminCaller } = await initTest(3);
    await expect(
      nonAdminCaller.voice.disconnectUser({ userId: 4 })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should reject voice move to non-voice channels and advertise capability', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const sourceChannelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Invalid Dest Source',
      categoryId: 2
    });

    await ownerCaller.voice.join({
      channelId: sourceChannelId,
      state: { micMuted: false, soundMuted: false }
    });

    await expect(
      ownerCaller.voice.moveUser({ userId: 1, destinationChannelId: 1 })
    ).rejects.toThrow('Both source and destination must be voice channels');

    const capabilities = await ownerCaller.desktop.capabilities();
    expect(capabilities.capabilities.voiceUserMove).toBe(true);
    expect(capabilities.capabilities.voiceUserDisconnect).toBe(true);
  });

  test('should remove screen audio on user cleanup and exclude it from its own producer list', async () => {
    const { caller } = await initTest(1);
    const channelId = await caller.channels.add({
      type: ChannelType.VOICE,
      name: 'Screen Audio Cleanup',
      categoryId: 2
    });

    await caller.voice.join({
      channelId,
      state: { micMuted: false, soundMuted: false }
    });

    const runtime = VoiceRuntime.findById(channelId)!;
    const screenAudioProducer = {
      closed: false,
      kind: 'audio',
      type: 'simple',
      rtpParameters: { encodings: [] },
      close() {
        this.closed = true;
        this.observer.emitClose();
      },
      observer: {
        handlers: [] as Array<() => void>,
        on(event: string, handler: () => void) {
          if (event === 'close') this.handlers.push(handler);
        },
        emitClose() {
          for (const handler of this.handlers) handler();
        }
      }
    } as any;

    runtime.addProducer(1, StreamKind.SCREEN_AUDIO, screenAudioProducer);

    expect((await caller.voice.getProducers()).remoteScreenAudioIds).not.toContain(
      1
    );

    runtime.removeUser(1);

    expect(screenAudioProducer.closed).toBe(true);
    expect(runtime.getProducer(StreamKind.SCREEN_AUDIO, 1)).toBeUndefined();
  });
});

describe('dms router', () => {
  test('should delete a direct message conversation for participants', async () => {
    const { caller } = await initTest(3);

    await caller.dms.delete({ channelId: 3 });

    expect(
      await db.select().from(channels).where(eq(channels.id, 3)).get()
    ).toBeUndefined();
    expect(
      await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.channelId, 3))
        .get()
    ).toBeUndefined();
  });

  test('should forbid direct message deletion for non-participants', async () => {
    const { caller } = await initTest(2);

    await expect(caller.dms.delete({ channelId: 3 })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );
  });

  test('should allow users with MOVE_MEMBERS to stop another user camera and screen producers', async () => {
    const { caller: ownerCaller } = await initTest(1);
    const channelId = await ownerCaller.channels.add({
      type: ChannelType.VOICE,
      name: 'Media Moderation Target',
      categoryId: 2
    });

    const { caller: targetCaller } = await initTest(4);
    clearVoiceUser(4);
    await targetCaller.voice.join({
      channelId,
      state: { micMuted: false, soundMuted: false }
    });

    const runtime = VoiceRuntime.findById(channelId)!;
    const closedKinds: string[] = [];
    const fakeProducer = (kind: string) =>
      ({
        closed: false,
        kind: kind === 'screen_audio' ? 'audio' : kind,
        type: 'simple',
        rtpParameters: { encodings: [] },
        close() {
          this.closed = true;
          closedKinds.push(kind);
          this.observer.emitClose();
        },
        observer: {
          handlers: [] as Array<() => void>,
          on(event: string, handler: () => void) {
            if (event === 'close') this.handlers.push(handler);
          },
          emitClose() {
            for (const handler of this.handlers) handler();
          }
        }
      }) as any;

    runtime.addProducer(4, StreamKind.VIDEO, fakeProducer('video'));
    runtime.addProducer(4, StreamKind.SCREEN, fakeProducer('screen'));
    runtime.updateUserState(4, { webcamEnabled: true, sharingScreen: true });

    await ownerCaller.voice.closeUserProducer({
      userId: 4,
      kind: StreamKind.VIDEO
    });
    await ownerCaller.voice.closeUserProducer({
      userId: 4,
      kind: StreamKind.SCREEN
    });

    expect(closedKinds).toEqual(['video', 'screen']);
    expect(runtime.getProducer(StreamKind.VIDEO, 4)).toBeUndefined();
    expect(runtime.getProducer(StreamKind.SCREEN, 4)).toBeUndefined();
    expect(runtime.getUserState(4)).toMatchObject({
      webcamEnabled: false,
      sharingScreen: false
    });
  });
});
