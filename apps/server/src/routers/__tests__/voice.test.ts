import { ChannelType, Permission } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
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

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeUndefined();
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUser(2)?.state
    ).toMatchObject({
      micMuted: false,
      soundMuted: true
    });

    await memberCaller.voice.updateState({ soundMuted: false });
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUserState(2).soundMuted
    ).toBe(false);
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

    expect(VoiceRuntime.findById(sourceChannelId)?.getUser(2)).toBeUndefined();
    expect(
      VoiceRuntime.findById(destinationChannelId)?.getUser(2)?.state
    ).toMatchObject({
      micMuted: false,
      soundMuted: true
    });
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
});
