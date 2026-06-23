import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const repoRoot = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('DM pin and channel access members UI source contract', () => {
  test('right sidebar uses server-filtered members without exposing a channel-access checkbox', () => {
    const source = read('components/right-sidebar/index.tsx');
    expect(source).toContain('getAccessibleMembers.query');
    expect(source).toContain('includeAll: false');
    expect(source).not.toContain('channelAccessOnly');
    expect(source).not.toContain('setChannelAccessOnly');
    expect(source).not.toContain('type="checkbox"');
  });

  test('right sidebar groups visible members by highest role from join roles', () => {
    const source = read('components/right-sidebar/index.tsx');
    expect(source).toContain('useRoles');
    expect(source).toContain('groupUsersByRole');
    expect(source).toContain('highestSortableRole');
    expect(source).toContain('role.name');
  });

  test('message pin permission appears as separate role permission in generated permission UI', () => {
    const permissions = readRepo('packages/shared/src/statics/permissions.ts');
    expect(permissions).toContain('PIN_DIRECT_MESSAGES');
    expect(permissions).toContain('PIN_MESSAGES');
  });
});
