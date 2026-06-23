import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('voice media moderation and channel links source contracts', () => {
  test('server advertises explicit fork-only capabilities', () => {
    const capabilities = read('routers/desktop/capabilities.ts');
    expect(capabilities).toContain('voiceUserMediaModeration: true');
    expect(capabilities).toContain('channelLinks: true');
  });

  test('voice router exposes closeUserProducer and emits producer closed events', () => {
    const router = read('routers/voice/index.ts');
    const route = read('routers/voice/close-user-producer.ts');
    expect(router).toContain('closeUserProducer');
    expect(route).toContain('Permission.MOVE_MEMBERS');
    expect(route).toContain('VOICE_PRODUCER_CLOSED');
    expect(route).toContain('closeUserProducerRoute');
  });

  test('channels router exposes permission checked channel link resolver', () => {
    const router = read('routers/channels/index.ts');
    const route = read('routers/channels/resolve-link.ts');
    expect(router).toContain('resolveLink');
    expect(route).toContain('needsChannelPermission');
    expect(route).toContain('ChannelPermission.VIEW_CHANNEL');
    expect(route).toContain('ChannelPermission.JOIN');
  });
});
