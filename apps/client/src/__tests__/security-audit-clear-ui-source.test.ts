import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('security audit and clear events UI source contract', () => {
  test('webclient wires clear security events and audit log routes', () => {
    const hooks = read('features/server/admin/hooks.ts');
    const security = read('components/server-screens/server-settings/security/index.tsx');

    expect(hooks).toContain('trpc.security.clearSecurityEvents.mutate');
    expect(hooks).toContain('trpc.security.getAuditLog.query');
    expect(hooks).toContain('requestConfirmation');
    expect(security).toContain('Clear events');
    expect(security).toContain('Security audit log');
    expect(security).toContain('auditLog.map');
  });
});
