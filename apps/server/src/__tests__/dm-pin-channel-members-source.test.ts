import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(import.meta.dir, '..');
const repoRoot = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(srcRoot, path), 'utf8');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('DM pin and channel members fork-only source contracts', () => {
  test('server advertises explicit Desktop fork-only capabilities', () => {
    const capabilities = read('routers/desktop/capabilities.ts');
    expect(capabilities).toContain('directMessagePinning: true');
    expect(capabilities).toContain('channelAccessMembers: true');
  });

  test('message pinning distinguishes direct messages from public channel pins', () => {
    const permissions = readRepo('packages/shared/src/statics/permissions.ts');
    const route = read('routers/messages/toggle-message-pin.ts');
    expect(permissions).toContain('PIN_DIRECT_MESSAGES');
    expect(route).toContain('isDirectMessageChannel');
    expect(route).toContain('Permission.PIN_DIRECT_MESSAGES');
    expect(route).toContain('Permission.PIN_MESSAGES');
  });

  test('channels router exposes a permission-aware accessible members route', () => {
    const router = read('routers/channels/index.ts');
    const route = read('routers/channels/get-accessible-members.ts');
    expect(router).toContain('getAccessibleMembers');
    expect(route).toContain('channelUserCan');
    expect(route).toContain('ChannelPermission.VIEW_CHANNEL');
    expect(route).toContain('clearFields');
  });
});
