import { useMemo } from 'react';
import { View } from 'react-native';
import { dailyProgress, entriesOf, hydrationOn, sessionMinutes } from '@dancehall/shared';
import { useDanceData } from '@/dance/hooks';
import { useFoodData } from '@/food/hooks';
import { useNumbersHidden, useWellness } from '@/wellness/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { ProgressBar } from '@/ui/ProgressBar';
import { useTheme } from '@/theme/useTheme';

/**
 * "Your day": dance workouts, other movement, food logging, water and habits in one calm picture, tied to the person's goal. It only describes; no score, no streak.
 * Food is left out entirely when the person's numbers are hidden or they have an eating concern.
 */
export function DayCard({ habitsDone, habitsTotal }: { habitsDone: number; habitsTotal: number }) {
  const dance = useDanceData();
  const food = useFoodData();
  const w = useWellness();
  const hidden = useNumbersHidden();
  const { colors, spacing } = useTheme();
  const p = useMemo(() => {
    const walk = entriesOf(w.entries, 'walk').filter((e) => e.day === w.todayKey);
    const strength = entriesOf(w.entries, 'strength').filter((e) => e.day === w.todayKey);
    const logged = [...walk, ...strength].reduce((n, e) => n + e.amount, 0);
    const water = hydrationOn(w.entries, w.todayKey, w.waterGoalMl);
    const hydrationUsed = w.prefs.waterGoalMl !== null || water.ml > 0;
    return dailyProgress({
      goal: w.targets.intent,
      movementMinutes: dance.doneToday.reduce((n, s) => n + sessionMinutes(s), 0) + logged,
      plannedSessions: dance.todayPlanned.length,
      movementGoalMinutes: w.prefs.dailyMovementMinutes,
      mealsLogged: food.todayLogs.length,
      hideFood: hidden || w.prefs.eatingConcern,
      waterMl: water.ml,
      waterGoalMl: hydrationUsed ? water.goalMl : null,
      habitsDone,
      habitsTotal,
    });
  }, [
    dance.doneToday,
    dance.todayPlanned,
    food.todayLogs,
    w.entries,
    w.todayKey,
    w.waterGoalMl,
    w.prefs,
    w.targets.intent,
    hidden,
    habitsDone,
    habitsTotal,
  ]);
  return (
    <Card>
      <SectionTitle icon="sunny" title={t('day.title')} />
      <AppText accessibilityLiveRegion="polite">{p.summary}</AppText>
      <View style={{ gap: spacing.sm }}>
        {p.items.map((it) => (
          <View key={it.id} style={{ gap: spacing.xs }}>
            <AppText variant="caption" style={{ color: it.done ? colors.text : colors.textMuted }}>
              {`${it.done ? '✓ ' : '○ '}${it.text}`}
            </AppText>
            {it.fraction !== null ? <ProgressBar fraction={it.fraction} label={it.text} /> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}
