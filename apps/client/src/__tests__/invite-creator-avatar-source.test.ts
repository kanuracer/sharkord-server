import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../../../..');

describe('invite creator avatar', () => {
  test('renders invite creator avatar instead of a fixed owner id', () => {
    const source = readFileSync(
      join(
        repoRoot,
        'apps/client/src/components/server-screens/server-settings/invites/table-invite.tsx'
      ),
      'utf8'
    );

    expect(source).toContain('<UserAvatar userId={invite.creator.id} showUserPopover />');
    expect(source).not.toContain('<UserAvatar userId={1} showUserPopover />');
  });
});
