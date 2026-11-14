import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function TodayScreen() {
  return (
    <Screen title={t('today.title')}>
      <FadeIn>
        <EmptyState
          icon="sunny-outline"
          title={t('today.emptyTitle')}
          body={t('today.emptyBody')}
        />
      </FadeIn>
    </Screen>
  );
}
