import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function CoachScreen() {
  return (
    <Screen title={t('coach.title')}>
      <FadeIn>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title={t('coach.emptyTitle')}
          body={t('coach.emptyBody')}
        />
      </FadeIn>
    </Screen>
  );
}
