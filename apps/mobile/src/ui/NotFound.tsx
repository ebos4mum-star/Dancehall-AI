import { router } from 'expo-router';
import { t } from '@/i18n';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';

/** A missing record or an unknown address: say so plainly and always offer a way out (a cold deep link has no back button). */
export function NotFound({ message = t('common.pageNotFound') }: { message?: string }) {
  return (
    <Screen top={false}>
      <Notice>{message}</Notice>
      <Button label={t('common.goHome')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
