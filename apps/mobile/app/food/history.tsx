import { withAccount } from '@/account/gate';
import { View } from 'react-native';
import { Disclosure, IconBadge, SectionTitle, type IconName } from '@/ui/kit';
import { FoodHero } from '@/food/kit';
import { brand } from '@/theme/tokens';
import { router } from 'expo-router';
import { localDateKey, totals } from '@dancehall/shared';
import { DiaryItem } from '@/food/DiaryItem';
import { useFoodData } from '@/food/hooks';
import { weeklyNutrition } from '@/food/summary';
import { NutritionWeekBars, kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';
import { useNumbersHidden } from '@/wellness/hooks';

const MEAL_ICON: Record<string, IconName> = {
  breakfast: 'sunny',
  lunch: 'restaurant',
  dinner: 'moon',
  snack: 'nutrition',
};

function History() {
  const hideNumbers = useNumbersHidden();
  const { logs, timeZone, error, loading } = useFoodData();
  const { spacing } = useTheme();
  const days = new Map<string, typeof logs>();
  for (const l of logs) {
    const k = localDateKey(l.loggedAt, timeZone);
    days.set(k, [...(days.get(k) ?? []), l]);
  }
  const week = weeklyNutrition(logs, timeZone, new Date());
  const keys = [...days.keys()].sort().reverse().slice(0, 30);
  const mealCount = keys.reduce((n, k) => n + days.get(k)!.length, 0);
  return (
    <Screen>
      <FoodHero
        title={t('ban.foodHistory.title')}
        line={t('food2.histLine')}
        pulse={keys.length > 0 ? 'welcome' : 'idle'}
        stats={
          keys.length > 0
            ? [
                { label: t('food2.histDays'), value: String(keys.length) },
                { label: t('food2.histMeals'), value: String(mealCount) },
              ]
            : []
        }
      />
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {loading && logs.length === 0 ? <SkeletonList label={t('common.loading')} /> : null}
      {!loading && keys.length === 0 ? (
        <EmptyState
          icon="restaurant-outline"
          title={t('hist.emptyTitle')}
          body={t('hist.empty')}
          actionLabel={t('hist.emptyCta')}
          onAction={() => router.push('/food/add')}
        />
      ) : null}
      {keys.length > 0 ? (
        <DepthCard>
          <SectionTitle icon="bar-chart" title={t('nutweek.title')} />
          <NutritionWeekBars week={week} />
        </DepthCard>
      ) : null}
      {keys.map((k, idx) => {
        const ls = days.get(k)!;
        const sum = totals(ls.flatMap((l) => l.items));
        return (
          <Disclosure
            key={k}
            title={formatDate(k)}
            summary={`${ls.length} ${ls.length === 1 ? 'meal' : 'meals'}${hideNumbers ? '' : ` · ${kcalText(sum)}`}`}
            initiallyOpen={idx === 0}
          >
            {ls.map((l) => (
              <View key={l.id} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <IconBadge
                    name={MEAL_ICON[l.mealType] ?? 'restaurant'}
                    size={28}
                    fill={brand.violet}
                  />
                  <AppText variant="label">{t(`food.meal.${l.mealType}` as StringKey)}</AppText>
                </View>
                {l.items.map((i) => (
                  <DiaryItem key={i.id} item={i} />
                ))}
              </View>
            ))}
          </Disclosure>
        );
      })}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(History, 'log_food');
