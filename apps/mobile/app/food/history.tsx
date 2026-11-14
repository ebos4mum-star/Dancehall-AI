import { View } from 'react-native';
import { localDateKey, totals } from '@dancehall/shared';
import { DiaryItem } from '@/food/DiaryItem';
import { useFoodData } from '@/food/hooks';
import { kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
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
  const keys = [...days.keys()].sort().reverse().slice(0, 30);
  return (
    <Screen top={false}>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {loading && logs.length === 0 ? <SkeletonList label={t('common.loading')} /> : null}
      {!loading && keys.length === 0 ? <Notice>{t('hist.empty')}</Notice> : null}
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
