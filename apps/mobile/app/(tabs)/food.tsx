import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function FoodScreen() {
  return (
    <Screen title={t('food.title')}>
      <FadeIn>
        <EmptyState
          icon="restaurant-outline"
          title={t('food.emptyTitle')}
          body={t('food.emptyBody')}
        />
      </FadeIn>
    </Screen>
  );
}
