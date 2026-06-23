import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dir, '..');
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

describe('custom status + notification sound fork gates', () => {
  test('server exposes custom status capabilities and data fields', () => {
    expect(read('routers/desktop/capabilities.ts')).toContain('customUserStatus');
    expect(read('routers/desktop/capabilities.ts')).toContain('notificationSoundControls');
    expect(read('db/schema.ts')).toContain('statusMessage');
    expect(read('db/schema.ts')).toContain('statusOverride');
    expect(read('routers/users/update-user.ts')).toContain('statusMessage');
    expect(read('routers/users/update-user.ts')).toContain('statusOverride');
    expect(read('routers/others/join.ts')).toContain('visibleUserStatus');
  });

  test('webclient surfaces custom status and notification sound toggle', () => {
    expect(read('../../client/src/components/server-screens/user-settings/profile/index.tsx')).toContain('statusMessage');
    expect(read('../../client/src/components/server-screens/user-settings/profile/index.tsx')).toContain('statusOverride');
    expect(read('../../client/src/components/server-screens/user-settings/notifications/index.tsx')).toContain('notificationSounds');
    expect(read('../../client/src/features/app/slice.ts')).toContain('notificationSounds');
  });
});
