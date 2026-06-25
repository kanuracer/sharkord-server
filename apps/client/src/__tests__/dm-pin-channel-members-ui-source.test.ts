import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const repoRoot = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('DM pin and channel access members UI source contract', () => {
  test('right sidebar uses server-filtered member ids without stale user snapshots', () => {
    const source = read('components/right-sidebar/index.tsx');
    expect(source).toContain('getAccessibleMembers.query');
    expect(source).toContain('includeAll: false');
    expect(source).toContain('channelUserIds');
    expect(source).toContain('new Set(rows.map((user) => user.id))');
    expect(source).toContain(
      'users.filter((user) => channelUserIds.has(user.id))'
    );
    expect(source).not.toContain('channelUsers');
    expect(source).not.toContain('setChannelUsers');
    expect(source).not.toContain('channelAccessOnly');
    expect(source).not.toContain('setChannelAccessOnly');
    expect(source).not.toContain('type="checkbox"');
  });

  test('right sidebar groups online users before offline users and then by role', () => {
    const source = read('components/right-sidebar/index.tsx');
    const groups = read('components/right-sidebar/member-groups.ts');
    expect(source).toContain('useRoles');
    expect(source).toContain('groupUsersByStatusAndRole');
    expect(groups).toContain('UserStatus');
    expect(groups).toContain('onlineTitle');
    expect(groups).toContain('offlineTitle');
    expect(groups).toContain('highestSortableRole');
    expect(groups).toContain('defaultRole');
    expect(groups).toContain('!role.isDefault');
    expect(groups).toContain('role.name');
  });

  test('message pin permission appears as separate role permission in generated permission UI', () => {
    const permissions = readRepo('packages/shared/src/statics/permissions.ts');
    expect(permissions).toContain('PIN_DIRECT_MESSAGES');
    expect(permissions).toContain('PIN_MESSAGES');
  });
});
