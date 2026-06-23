import { closeServerScreens } from '@/features/server-screens/actions';
import { useOwnPublicUser } from '@/features/server/users/hooks';
import { useForm } from '@/hooks/use-form';
import { getTRPCClient } from '@/lib/trpc';
import { UserStatus } from '@sharkord/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Color,
  Group,
  Input,
  Textarea
} from '@sharkord/ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AvatarManager } from './avatar-manager';
import { BannerManager } from './banner-manager';

const Profile = memo(() => {
  const { t } = useTranslation('settings');
  const ownPublicUser = useOwnPublicUser();
  const { setTrpcErrors, r, rr, values } = useForm({
    name: ownPublicUser?.name ?? '',
    bannerColor: ownPublicUser?.bannerColor ?? '#FFFFFF',
    bio: ownPublicUser?.bio ?? '',
    statusOverride: ownPublicUser?.statusOverride ?? '',
    statusMessage: ownPublicUser?.statusMessage ?? ''
  });

  const onUpdateUser = useCallback(async () => {
    const trpc = getTRPCClient();

    try {
      await trpc.users.update.mutate({
        ...values,
        statusOverride: values.statusOverride ? (values.statusOverride as UserStatus) : null,
        statusMessage: values.statusMessage?.trim() || null
      });
      toast.success(t('profileUpdated'));
    } catch (error) {
      setTrpcErrors(error);
    }
  }, [values, setTrpcErrors, t]);

  if (!ownPublicUser) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profileTitle')}</CardTitle>
        <CardDescription>{t('profileDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AvatarManager user={ownPublicUser} />

        <Group label={t('usernameLabel')}>
          <Input placeholder={t('usernamePlaceholder')} {...r('name')} />
        </Group>

        <Group label={t('bioLabel')}>
          <Textarea placeholder={t('bioPlaceholder')} {...r('bio')} />
        </Group>

        <Group label={t('statusLabel', 'Online status')}>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" {...r('statusOverride')}>
            <option value="">{t('statusAuto', 'Auto')}</option>
            <option value={UserStatus.ONLINE}>{t('statusOnline', 'Online')}</option>
            <option value={UserStatus.IDLE}>{t('statusIdle', 'Idle')}</option>
            <option value={UserStatus.OFFLINE}>{t('statusInvisible', 'Invisible')}</option>
          </select>
        </Group>

        <Group label={t('statusMessageLabel', 'Status message')}>
          <Input placeholder={t('statusMessagePlaceholder', 'What are you up to?')} maxLength={80} {...r('statusMessage')} />
        </Group>

        <Group label={t('bannerColorLabel')}>
          <Color {...rr('bannerColor')} defaultValue="#FFFFFF" />
        </Group>

        <BannerManager user={ownPublicUser} />

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={closeServerScreens}>
            {t('cancel')}
          </Button>
          <Button onClick={onUpdateUser}>{t('saveChanges')}</Button>
        </div>
      </CardContent>
    </Card>
  );
});

export { Profile };
