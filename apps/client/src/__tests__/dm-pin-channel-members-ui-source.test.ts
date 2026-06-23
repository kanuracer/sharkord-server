import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const repoRoot = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('DM pin and channel access members UI source contract', () => {
  test('right sidebar defaults to channel-access member filtering with all-member fallback', () => {
    const source = read('components/right-sidebar/index.tsx');
    expect(source).toContain('channelAccessOnly');
    expect(source).toContain('getAccessibleMembers.query');
    expect(source).toContain('includeAll: false');
    expect(source).toContain('setChannelAccessOnly');
  });

  test('message pin permission appears as separate role permission in generated permission UI', () => {
    const permissions = readRepo('packages/shared/src/statics/permissions.ts');
    expect(permissions).toContain('PIN_DIRECT_MESSAGES');
    expect(permissions).toContain('PIN_MESSAGES');
  });
});
