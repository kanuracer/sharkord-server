import { ActivityLogType } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { activityLog } from '../../db/schema';

describe('user delete audit log', () => {
  test('logs deleter as actor and deleted user as target details', async () => {
    const { caller } = await initTest(1);

    await caller.users.delete({ userId: 2, wipe: false });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const row = await tdb
      .select()
      .from(activityLog)
      .where(eq(activityLog.type, ActivityLogType.USER_DELETED))
      .get();

    expect(row?.userId).toBe(1);
    expect(row?.details).toMatchObject({
      deletedBy: 1,
      targetUserId: 2,
      targetIdentity: 'testuser',
      wipe: false
    });
  });
});
