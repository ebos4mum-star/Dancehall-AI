import { View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { weekStartOf, localDateKey } from '@dancehall/shared';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { InfoTile, SectionTitle } from '@/ui/kit';
import { PulseStage } from '@/pulse/PulseStage';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { weeklyRecap } from './recap';

/** Weekly Rhythm Recap: this week from recorded data only. Missing is shown as "not yet", never as zero progress. */
export function RecapCard() {
  const { profile } = useApp();
  const { colors } = useTheme();
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
  const goalLine = r.goals.map((g, idx) => ({
    key: `goal-${idx}`,
    value:
      g.fraction === null
        ? t('recap.goalNeedsWeight')
        : t('recap.goalPct', { pct: Math.round(g.fraction * 100) }),
  }));
  return (
    <Card>
      <SectionTitle icon="sparkles" title={t('recap.title')} />
      <AppText variant="caption" muted>
        {r.daysSoFar < 7 ? t('recap.partial', { n: r.daysSoFar }) : t('recap.full')}
      </AppText>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'center',
          backgroundColor: colors.successBg,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <View style={{ width: 56, height: 52, overflow: 'hidden' }}>
          <PulseStage state="idle" size={56} />
        </View>
        <AppText style={{ flex: 1 }}>{r.insight}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <InfoTile icon="musical-notes" label={t('recap.tileDance')} value={`${r.dance.sessions}`} />
        <InfoTile
          icon="restaurant"
          label={t('recap.tileFood')}
          value={r.foodDays === null ? '–' : `${r.foodDays} d`}
        />
        <InfoTile
          icon="leaf"
          label={t('recap.tileHabits')}
          value={r.habits === null ? '–' : `${r.habits.done}`}
        />
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" muted>
          {`${t('recap.dance')}: ${r.dance.sessions === 0 ? t('recap.danceNone') : t('recap.danceSome', { s: r.dance.sessions, m: r.dance.minutes, d: r.dance.activeDays })}`}
        </AppText>
        <AppText variant="caption" muted>
          {`${t('recap.food')}: ${r.foodDays === null ? t('recap.foodNotStarted') : r.foodDays === 0 ? t('recap.foodNone') : t('recap.foodSome', { n: r.foodDays })}`}
        </AppText>
        <AppText variant="caption" muted>
          {`${t('recap.habits')}: ${r.habits === null ? t('recap.habitsNone') : t('recap.habitsSome', { done: r.habits.done, possible: r.habits.possible })}`}
        </AppText>
        {goalLine.map((g) => (
          <AppText key={g.key} variant="caption" muted>{`${t('recap.goal')}: ${g.value}`}</AppText>
        ))}
      </View>
      <AppText variant="caption" muted>
        {t('recap.note')}
      </AppText>
    </Card>
  );
}
