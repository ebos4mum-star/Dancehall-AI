import { View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { weekStartOf, localDateKey } from '@dancehall/shared';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { weeklyRecap } from './recap';

/** Weekly Rhythm Recap: this week from recorded data only. Missing is shown as "not yet", never as zero progress. */
export function RecapCard() {
  const { profile } = useApp();
  const tz = profile?.timeZone ?? null;
  const { data, error } = useLoad(async (s) => {
    const weekStart = weekStartOf(localDateKey(new Date(), tz));
    return {
      sessions: await s.listSessions(),
      logs: await s.listFoodLogs(),
      habits: await s.listHabits(),
      checkins: await s.listHabitCheckins(weekStart),
      goals: await s.listGoals(),
      weights: await s.listWeights(),
    };
  });
  if (error) return <Notice tone="warning">{error}</Notice>;
  if (!data) return null;
  const r = weeklyRecap({
    now: new Date(),
    timeZone: tz,
    sessions: data.sessions,
    foodLogTimes: data.logs.map((l) => l.loggedAt),
    habits: data.habits,
    checkins: data.checkins,
    goals: data.goals,
    weights: data.weights,
  });
  const line = (k: string, v: string, key: string = k) => (
    <AppText key={key} accessibilityLabel={`${k}: ${v}`}>{`${k}: ${v}`}</AppText>
  );
  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('recap.title')}
      </AppText>
      <AppText variant="caption" muted>
        {r.daysSoFar < 7 ? t('recap.partial', { n: r.daysSoFar }) : t('recap.full')}
      </AppText>
      <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
        <AppText>{r.insight}</AppText>
      </View>
      <View style={{ gap: spacing.xs }}>
        {line(
          t('recap.dance'),
          r.dance.sessions === 0
            ? t('recap.danceNone')
            : t('recap.danceSome', {
                s: r.dance.sessions,
                m: r.dance.minutes,
                d: r.dance.activeDays,
              }),
        )}
        {line(
          t('recap.food'),
          r.foodDays === null
            ? t('recap.foodNotStarted')
            : r.foodDays === 0
              ? t('recap.foodNone')
              : t('recap.foodSome', { n: r.foodDays }),
        )}
        {line(
          t('recap.habits'),
          r.habits === null
            ? t('recap.habitsNone')
            : t('recap.habitsSome', { done: r.habits.done, possible: r.habits.possible }),
        )}
        {r.goals.map((g, idx) =>
          line(
            t('recap.goal'),
            g.fraction === null
              ? t('recap.goalNeedsWeight')
              : t('recap.goalPct', { pct: Math.round(g.fraction * 100) }),
            `goal-${idx}`,
          ),
        )}
      </View>
      <AppText variant="caption" muted>
        {t('recap.note')}
      </AppText>
    </Card>
  );
}
