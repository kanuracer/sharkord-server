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
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type TMfaSetup = {
  secret: string;
  otpauthUrl: string;
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
  const [mfaLoading, setMfaLoading] = useState(true);

  const refreshMfaStatus = useCallback(async () => {
    const trpc = getTRPCClient();
    const status = await trpc.users.mfa.status.query();
    setMfaEnabled(status.enabled);
  }, []);

  useEffect(() => {
    refreshMfaStatus()
      .catch(() => toast.error(t('mfaStatusError')))
      .finally(() => setMfaLoading(false));
  }, [refreshMfaStatus, t]);

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
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, t]);

  const enableMfa = useCallback(async () => {
    const trpc = getTRPCClient();
    setMfaLoading(true);

    try {
      await trpc.users.mfa.enable.mutate({ code: mfaForm.values.setupCode });
      setMfaSetup(null);
      setMfaEnabled(true);
      mfaForm.setValues({ setupCode: '', disablePassword: '', disableCode: '' });
      toast.success(t('mfaEnabled'));
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, t]);

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
      mfaForm.setValues({ setupCode: '', disablePassword: '', disableCode: '' });
      toast.success(t('mfaDisabled'));
    } catch (error) {
      mfaForm.setTrpcErrors(error);
    } finally {
      setMfaLoading(false);
    }
  }, [mfaForm, t]);

  const copyTotpUrl = useCallback(async () => {
    if (!mfaSetup?.otpauthUrl) return;

    try {
      await navigator.clipboard.writeText(mfaSetup.otpauthUrl);
      toast.success(t('mfaSetupUriCopied'));
    } catch {
      toast.error(t('mfaSetupUriCopyFailed'));
    }
  }, [mfaSetup?.otpauthUrl, t]);

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
              {mfaEnabled ? t('mfaStatusEnabledDesc') : t('mfaStatusDisabledDesc')}
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

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copyTotpUrl}>
                  {t('mfaCopySetupUri')}
                </Button>
                <Button variant="outline" onClick={startMfaSetup} disabled={mfaLoading}>
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

              <Button onClick={enableMfa} disabled={mfaLoading || !mfaForm.values.setupCode}>
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
    </div>
  );
});

export { Password };
