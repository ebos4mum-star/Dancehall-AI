import { View } from 'react-native';
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

export default function History() {
  const { logs, timeZone, error, loading } = useFoodData();
  const { spacing } = useTheme();
  const days = new Map<string, typeof logs>();
  for (const l of logs) {
    const k = localDateKey(l.loggedAt, timeZone);
    days.set(k, [...(days.get(k) ?? []), l]);
  }
  const week = weeklyNutrition(logs, timeZone, new Date());
  const keys = [...days.keys()].sort().reverse().slice(0, 30);
  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.foodHistory.title'),
        line: t('ban.foodHistory.line'),
        pulse: 'idle',
      }}
    >
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
          <AppText variant="heading" accessibilityRole="header">
            {t('nutweek.title')}
          </AppText>
          <NutritionWeekBars week={week} />
        </DepthCard>
      ) : null}
      {keys.map((k) => {
        const ls = days.get(k)!;
        const sum = totals(ls.flatMap((l) => l.items));
        return (
          <DepthCard key={k}>
            <AppText variant="heading" accessibilityRole="header">
              {formatDate(k)}
            </AppText>
            <AppText variant="caption" muted>
              {kcalText(sum)}
            </AppText>
            <View style={{ gap: spacing.md }}>
              {ls.map((l) => (
                <View key={l.id} style={{ gap: spacing.sm }}>
                  <AppText variant="label" muted>
                    {t(`food.meal.${l.mealType}` as StringKey)}
                  </AppText>
                  {l.items.map((i) => (
                    <DiaryItem key={i.id} item={i} />
                  ))}
                </View>
              ))}
            </View>
          </DepthCard>
        );
      })}
    </Screen>
  );
}
