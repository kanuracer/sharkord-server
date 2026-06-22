import { Permission } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { initTest } from '../../__tests__/helpers';

describe('kanuracer thread inbox and role mention fanout', () => {
  test('thread inbox aggregates unread thread replies for accessible channels', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: member } = await initTest(2);

    const parentMessageId = await member.messages.send({
      channelId: 1,
      content: '<p>release thread</p>',
      files: []
    });

    await owner.messages.get({ channelId: 1, cursor: null, limit: 50 });

    const replyId = await member.messages.send({
      channelId: 1,
      parentMessageId,
      content: '<p>thread reply after read</p>',
      files: []
    });

    const inbox = await owner.messages.getThreadInbox();
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      channelId: 1,
      parentMessageId,
      unreadReplyCount: 1,
      replyCount: 1
    });
    expect(inbox.items[0]!.latestReply.id).toBe(replyId);
    expect(inbox.totalUnreadReplies).toBe(1);
  });

  test('mentionable role mentions expose targeted role/user ids while non-mentionable roles are ignored', async () => {
    const { caller } = await initTest(1);
    const mentionableRoleId = await caller.roles.add();
    await caller.roles.update({
      roleId: mentionableRoleId,
      name: 'Deploy Squad',
      color: '#00ff88',
      permissions: [Permission.SEND_MESSAGES],
      mentionable: true,
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });
    await caller.users.addRole({ userId: 2, roleId: mentionableRoleId });

    const hiddenRoleId = await caller.roles.add();
    await caller.roles.update({
      roleId: hiddenRoleId,
      name: 'Hidden Squad',
      color: '#ff0088',
      permissions: [Permission.SEND_MESSAGES],
      mentionable: false,
      storageQuotaOverrideEnabled: false,
      storageSpaceQuota: 0
    });
    await caller.users.addRole({ userId: 2, roleId: hiddenRoleId });

    const messageId = await caller.messages.send({
      channelId: 1,
      content: '<p>@&Deploy Squad and @&Hidden Squad</p>',
      files: []
    });

    const result = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const message = result.messages.find(
      (item) => item.id === messageId
    ) as (typeof result.messages)[number] & {
      mentionedRoleIds?: number[];
      mentionedUserIds?: number[];
    };

    expect(message.mentionedRoleIds).toContain(mentionableRoleId);
    expect(message.mentionedRoleIds).not.toContain(hiddenRoleId);
    expect(message.mentionedUserIds).toContain(2);
    expect(message.mentionedUserIds).not.toContain(1);
  });
});
