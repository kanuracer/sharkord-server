import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('security IP rules admin UI source contract', () => {
  test('webclient exposes Security tab backed by security router routes', () => {
    const settings = read('components/server-screens/server-settings/index.tsx');
    const security = read('components/server-screens/server-settings/security/index.tsx');
    const hooks = read('features/server/admin/hooks.ts');

    expect(settings).toContain("import { Security } from './security'");
    expect(settings).toContain('value="security"');
    expect(settings).toContain("t('securityTab')");
    expect(settings).toContain('<Security />');

    expect(hooks).toContain('useAdminSecurity');
    expect(hooks).toContain('trpc.security.getIpRules.query');
    expect(hooks).toContain('trpc.security.addIpAllowlist.mutate');
    expect(hooks).toContain('trpc.security.addIpBlock.mutate');
    expect(hooks).toContain('trpc.security.unblockIp.mutate');
    expect(hooks).toContain('trpc.security.removeIpRule.mutate');

    expect(security).toContain('Trusted / allowlisted IPs');
    expect(security).toContain('Blocked IPs');
    expect(security).toContain('172.16.0.%');
    expect(security).toContain('onUnblockIp');
    expect(security).toContain('onRemoveRule');
  });
});
