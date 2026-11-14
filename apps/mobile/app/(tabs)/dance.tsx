import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function DanceScreen() {
  return (
    <Screen title={t('dance.title')}>
      <FadeIn>
        <EmptyState
          icon="musical-notes-outline"
          title={t('dance.emptyTitle')}
          body={t('dance.emptyBody')}
        />
      </FadeIn>
    </Screen>
  );
}
