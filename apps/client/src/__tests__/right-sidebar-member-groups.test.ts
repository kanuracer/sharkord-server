import { UserStatus } from '@sharkord/shared';
import { describe, expect, test } from 'bun:test';
import { groupUsersByStatusAndRole } from '../components/right-sidebar/member-groups';

const role = (overrides: Record<string, unknown>) =>
  ({
    id: 0,
    name: 'Role',
    color: '#fff',
    permissions: [],
    isDefault: false,
    weight: 100,
    storageSpaceQuota: 0,
    ...overrides
  }) as never;

const user = (overrides: Record<string, unknown>) =>
  ({
    id: 0,
    name: 'User',
    identity: 'user',
    roleIds: [],
    banned: false,
    status: UserStatus.OFFLINE,
    ...overrides
  }) as never;

describe('right-sidebar member grouping', () => {
  test('matches desktop ordering: online first, role weight next, default role fallback last', () => {
    const roles = [
      role({ id: 1, name: 'Owner', weight: 0 }),
      role({ id: 2, name: 'Guest', weight: 50 }),
      role({ id: 3, name: 'Member', weight: 100, isDefault: true })
    ];
    const users = [
      user({
        id: 1,
        name: 'kanuracer',
        roleIds: [1],
        status: UserStatus.ONLINE
      }),
      user({ id: 2, name: 'Hermes', roleIds: [1], status: UserStatus.OFFLINE }),
      user({ id: 3, name: 'Flo', roleIds: [], status: UserStatus.OFFLINE }),
      user({
        id: 4,
        name: 'GuestUser',
        roleIds: [2, 3],
        status: UserStatus.OFFLINE
      })
    ];

    const groups = groupUsersByStatusAndRole(
      users,
      roles,
      'Members',
      'Online',
      'Offline'
    );

    expect(groups.map((group) => `${group.title}:${group.usersCount}`)).toEqual(
      ['Online:1', 'Offline:3']
    );
    expect(
      groups[0].roleGroups.map(
        (group) => `${group.title}:${group.users.length}`
      )
    ).toEqual(['Owner:1']);
    expect(
      groups[1].roleGroups.map(
        (group) => `${group.title}:${group.users.length}`
      )
    ).toEqual(['Owner:1', 'Guest:1', 'Member:1']);
    expect(groups[1].roleGroups[2].users[0].name).toBe('Flo');
  });
});
