import { requestConfirmation } from '@/features/dialogs/actions';
import { closeServerScreens } from '@/features/server-screens/actions';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import { TestId } from '@sharkord/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Input
} from '@sharkord/ui';
import * as QRCode from 'qrcode';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type TMfaSetup = {
  secret: string;
  otpauthUrl: string;
};

type TAppPasswordSummary = {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

const Password = memo(() => {
  const { t } = useTranslation('settings');
  const passwordForm = useForm({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const mfaForm = useForm({
    setupCode: '',
    disablePassword: '',
    disableCode: ''
  });
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<TMfaSetup | null>(null);
  const [mfaQrCodeUrl, setMfaQrCodeUrl] = useState('');
  const [mfaLoading, setMfaLoading] = useState(true);
  const [appPasswords, setAppPasswords] = useState<TAppPasswordSummary[]>([]);
  const [appPasswordsLoading, setAppPasswordsLoading] = useState(true);

  const refreshMfaStatus = useCallback(async () => {
    const trpc = getTRPCClient();
    const status = await trpc.users.mfa.status.query();
    setMfaEnabled(status.enabled);
  }, []);

  const refreshAppPasswords = useCallback(async () => {
    const trpc = getTRPCClient();
    const rows = await trpc.users.mfa.appPasswords.query();
    setAppPasswords(rows);
  }, []);

  useEffect(() => {
    refreshMfaStatus()
      .catch(() => toast.error(t('mfaStatusError')))
      .finally(() => setMfaLoading(false));
    refreshAppPasswords()
      .catch(() => toast.error(t('appPasswordsLoadError')))
      .finally(() => setAppPasswordsLoading(false));
  }, [refreshAppPasswords, refreshMfaStatus, t]);

  useEffect(() => {
    let active = true;

    if (!mfaSetup?.otpauthUrl) {
      setMfaQrCodeUrl('');
      return () => {
        active = false;
      };
    }

    QRCode.toString(mfaSetup.otpauthUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 192,
      color: { dark: '#111827', light: '#ffffff' }
    })
      .then((svg) => {
        if (active)
          setMfaQrCodeUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        if (active) setMfaQrCodeUrl('');
      });

    return () => {
      active = false;
    };
  }, [mfaSetup?.otpauthUrl]);

  const updatePassword = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.users.updatePassword.mutate(passwordForm.values);
      toast.success(t('passwordUpdated'));
    } catch (error) {
      passwordForm.setTrpcErrors(error);
    }
  }, [passwordForm, t]);

  const startMfaSetup = useCallback(async () => {
    const trpc = getTRPCClient();
    setMfaLoading(true);

    try {
      const setup = await trpc.users.mfa.start.mutate();
      setMfaSetup(setup);
      setMfaEnabled(false);
      toast.success(t('mfaSetupStarted'));
      await refreshAppPasswords();
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, refreshAppPasswords, t]);

  const enableMfa = useCallback(async () => {
    const trpc = getTRPCClient();
    setMfaLoading(true);

    try {
      await trpc.users.mfa.enable.mutate({ code: mfaForm.values.setupCode });
      setMfaSetup(null);
      setMfaEnabled(true);
      mfaForm.setValues({
        setupCode: '',
        disablePassword: '',
        disableCode: ''
      });
      toast.success(t('mfaEnabled'));
      await refreshAppPasswords();
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, refreshAppPasswords, t]);

  const disableMfa = useCallback(async () => {
    const trpc = getTRPCClient();
    setMfaLoading(true);

    try {
      await trpc.users.mfa.disable.mutate({
        password: mfaForm.values.disablePassword,
        code: mfaForm.values.disableCode || undefined
      });
      setMfaSetup(null);
      setMfaEnabled(false);
      mfaForm.setValues({
        setupCode: '',
        disablePassword: '',
        disableCode: ''
      });
      toast.success(t('mfaDisabled'));
      await refreshAppPasswords();
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, refreshAppPasswords, t]);

  const copyTotpUrl = useCallback(async () => {
    if (!mfaSetup?.otpauthUrl) return;

    try {
      await navigator.clipboard.writeText(mfaSetup.otpauthUrl);
      toast.success(t('mfaSetupUriCopied'));
    } catch {
      toast.error(t('mfaSetupUriCopyFailed'));
    }
  }, [mfaSetup?.otpauthUrl, t]);

  const formatAppPasswordTime = useCallback(
    (value: number | null) => {
      if (!value) return t('appPasswordNever');
      return new Date(value).toLocaleString();
    },
    [t]
  );

  const revokeAppPassword = useCallback(
    async (entry: TAppPasswordSummary) => {
      if (entry.revokedAt) return;
      const confirmed = await requestConfirmation({
        title: t('appPasswordRevokeConfirmTitle'),
        message: t('appPasswordRevokeConfirmDesc'),
        confirmLabel: t('appPasswordRevoke'),
        variant: 'danger'
      });
      if (!confirmed) return;

      const trpc = getTRPCClient();
      try {
        await trpc.users.mfa.revokeAppPassword.mutate({ id: entry.id });
        toast.success(t('appPasswordRevoked'));
        await refreshAppPasswords();
      } catch (error) {
        toast.error(t('appPasswordRevokeError'));
        mfaForm.setTrpcErrors(error);
      }
    },
    [mfaForm, refreshAppPasswords, t]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('passwordTitle')}</CardTitle>
          <CardDescription>{t('passwordDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Group label={t('currentPasswordLabel')}>
            <Input {...passwordForm.r('currentPassword', 'password')} />
          </Group>

          <Group label={t('newPasswordLabel')}>
            <Input {...passwordForm.r('newPassword', 'password')} />
          </Group>

          <Group label={t('confirmNewPasswordLabel')}>
            <Input {...passwordForm.r('confirmNewPassword', 'password')} />
          </Group>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeServerScreens}>
              {t('cancel')}
            </Button>
            <Button onClick={updatePassword}>{t('saveChanges')}</Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid={TestId.MFA_SETUP_CARD}>
        <CardHeader>
          <CardTitle>{t('mfaTitle')}</CardTitle>
          <CardDescription>{t('mfaDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant={mfaEnabled ? 'info' : 'default'}>
            <AlertTitle>
              {mfaEnabled ? t('mfaStatusEnabled') : t('mfaStatusDisabled')}
            </AlertTitle>
            <AlertDescription>
              {mfaEnabled
                ? t('mfaStatusEnabledDesc')
                : t('mfaStatusDisabledDesc')}
            </AlertDescription>
          </Alert>

          {!mfaEnabled && !mfaSetup && (
            <Button onClick={startMfaSetup} disabled={mfaLoading}>
              {t('mfaSetupButton')}
            </Button>
          )}

          {mfaSetup && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('mfaSetupTitle')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('mfaSetupDesc')}
                </p>
                <a
                  className="text-sm underline break-all"
                  href={mfaSetup.otpauthUrl}
                >
                  {t('mfaSetupOpenAuthenticator')}
                </a>
              </div>

              <Group label={t('mfaSecretLabel')}>
                <Input value={mfaSetup.secret} readOnly />
              </Group>

              {mfaQrCodeUrl && (
                <div className="inline-flex rounded-lg border bg-white p-3">
                  <img
                    data-testid={TestId.MFA_SETUP_QR_CODE}
                    src={mfaQrCodeUrl}
                    alt={t('mfaQrCodeAlt')}
                    width={192}
                    height={192}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copyTotpUrl}>
                  {t('mfaCopySetupUri')}
                </Button>
                <Button
                  variant="outline"
                  onClick={startMfaSetup}
                  disabled={mfaLoading}
                >
                  {t('mfaRegenerateSetup')}
                </Button>
              </div>

              <Group label={t('mfaVerificationCodeLabel')}>
                <Input
                  {...mfaForm.r('setupCode')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onEnter={enableMfa}
                />
              </Group>

              <Button
                onClick={enableMfa}
                disabled={mfaLoading || !mfaForm.values.setupCode}
              >
                {t('mfaEnableButton')}
              </Button>
            </div>
          )}

          {mfaEnabled && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">{t('mfaDisableTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('mfaDisableDesc')}
              </p>
              <Group label={t('currentPasswordLabel')}>
                <Input {...mfaForm.r('disablePassword', 'password')} />
              </Group>
              <Group label={t('mfaVerificationCodeLabel')}>
                <Input
                  {...mfaForm.r('disableCode')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onEnter={disableMfa}
                />
              </Group>
              <Button
                variant="destructive"
                onClick={disableMfa}
                disabled={
                  mfaLoading ||
                  !mfaForm.values.disablePassword ||
                  !mfaForm.values.disableCode
                }
              >
                {t('mfaDisableButton')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="APP_PASSWORDS_CARD">
        <CardHeader>
          <CardTitle>{t('appPasswordsTitle')}</CardTitle>
          <CardDescription>{t('appPasswordsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={refreshAppPasswords}
              disabled={appPasswordsLoading}
            >
              {appPasswordsLoading
                ? t('appPasswordsLoading')
                : t('appPasswordsRefresh')}
            </Button>
          </div>
          <div className="appPasswordRows space-y-2">
            {appPasswords.length ? (
              appPasswords.map((entry) => (
                <div
                  className="appPasswordRow flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  key={entry.id}
                >
                  <div className="min-w-0 space-y-1">
                    <strong className="block truncate text-sm">
                      {entry.name}
                    </strong>
                    <small className="block break-words text-muted-foreground">
                      {t('appPasswordCreated')}:{' '}
                      {formatAppPasswordTime(entry.createdAt)} ·{' '}
                      {t('appPasswordLastUsed')}:{' '}
                      {formatAppPasswordTime(entry.lastUsedAt)}
                      {entry.revokedAt
                        ? ` · ${t('appPasswordRevokedAt')}: ${formatAppPasswordTime(entry.revokedAt)}`
                        : ''}
                    </small>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    aria-label={`${t('appPasswordRevoke')}: ${entry.name}`}
                    onClick={() => revokeAppPassword(entry)}
                    disabled={!!entry.revokedAt}
                  >
                    {entry.revokedAt
                      ? t('appPasswordRevoked')
                      : t('appPasswordRevoke')}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('appPasswordNone')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export { Password };
