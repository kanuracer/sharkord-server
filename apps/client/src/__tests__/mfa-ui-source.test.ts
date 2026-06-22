import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../../../..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('MFA client UI source guards', () => {
  test('login asks for TOTP in a dialog after password instead of an inline optional field', () => {
    const connect = read('apps/client/src/screens/connect/index.tsx');

    expect(connect).not.toContain("t('2FA-Code optional')");
    expect(connect).not.toContain('placeholder="123456"');
    expect(connect).toContain('CONNECT_TOTP_DIALOG');
    expect(connect).toContain('DialogContent');
    expect(connect).toContain('totpDialogOpen');
    expect(connect).toContain('data.errors?.totpCode');
  });

  test('password settings expose TOTP setup and disable controls', () => {
    const password = read(
      'apps/client/src/components/server-screens/user-settings/password/index.tsx'
    );
    const settingsLocale = JSON.parse(
      read('apps/client/src/i18n/locales/en/settings.json')
    ) as Record<string, string>;

    expect(password).toContain('users.mfa.status.query');
    expect(password).toContain('users.mfa.start.mutate');
    expect(password).toContain('users.mfa.enable.mutate');
    expect(password).toContain('users.mfa.disable.mutate');
    expect(password).toContain('MFA_SETUP_CARD');
    expect(password).toContain('MFA_SETUP_QR_CODE');
    expect(password).toContain('QRCode.toString');
    expect(password).toContain('data:image/svg+xml');
    expect(password).toContain('alt={t(\'mfaQrCodeAlt\')}');
    expect(settingsLocale.mfaTitle).toBe('Two-factor authentication');
    expect(settingsLocale.mfaSetupButton).toBe('Set up 2FA');
    expect(settingsLocale.mfaQrCodeAlt).toBe('QR code for authenticator app setup');
  });
});
