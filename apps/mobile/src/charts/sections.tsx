import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { localDateKey } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { useProgression } from '@/gamification/progressionStore';
import { useTheme } from '@/theme/useTheme';
import { Button } from '@/ui/Button';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { useNumbersHidden } from '@/wellness/hooks';
import {
  calendarCells,
  compareWeeks,
  dailyMinutes,
  monthlySessions,
  nutritionDays,
  nutritionSeries,
  weeklyMinutes,
  type NutritionMetric,
} from './data';
import { BarChart, CalendarGrid, ChartCard, LineChart } from './ui';

function useChartData() {
  const { profile } = useApp();
  const tz = profile?.timeZone ?? null;
  const today = localDateKey(new Date(), tz);
  const { data } = useLoad(async (s) => ({
    sessions: await s.listSessions(),
    logs: await s.listFoodLogs(),
  }));
  return { data, tz, today };
}

/** Active minutes for each of the last 7 days (Home and Workouts). */
export function WeekActivityChart() {
  const { data, tz, today } = useChartData();
  const [sel, setSel] = useState<number | null>(null);
  const points = useMemo(
    () => (data ? dailyMinutes(data.sessions, today, tz, 7) : []),
    [data, today, tz],
  );
  if (!data || points.every((p) => !p.value)) return null;
  return (
    <ChartCard
      icon="bar-chart"
      title="Your week in movement"
      summary="Active minutes, last 7 days"
      points={points}
      unit="min"
      zeroMeansNone
      selected={sel === null ? null : (points[sel] ?? null)}
    >
      <BarChart points={points} unit="min" selected={sel} onSelect={setSel} />
    </ChartCard>
  );
}

/** Weekly minutes or monthly sessions, switchable (Progress). */
export function MovementTrends() {
  const { data, tz, today } = useChartData();
  const { spacing } = useTheme();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [sel, setSel] = useState<number | null>(null);
  const points = useMemo(
    () =>
      data
        ? mode === 'week'
          ? weeklyMinutes(data.sessions, today, tz, 8)
          : monthlySessions(data.sessions, today, tz, 6)
        : [],
    [data, mode, today, tz],
  );
  if (!data || points.every((p) => !p.value)) return null;
  const unit = mode === 'week' ? 'min' : 'sessions';
  return (
    <ChartCard
      icon="trending-up"
      title="Movement over time"
      summary={
        mode === 'week'
          ? 'Active minutes per week, last 8 weeks'
          : 'Sessions per month, last 6 months'
      }
      points={points}
      unit={unit}
      zeroMeansNone
      selected={sel === null ? null : (points[sel] ?? null)}
      control={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['week', 'month'] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? 'primary' : 'secondary'}
              label={m === 'week' ? 'Weeks' : 'Months'}
              onPress={() => {
                setMode(m);
                setSel(null);
              }}
            />
          ))}
        </View>
      }
    >
      <BarChart points={points} unit={unit} selected={sel} onSelect={setSel} />
    </ChartCard>
  );
}

/** Logged calories or protein over 14 days, with gaps for days not logged. Hidden when the person hides numbers. Neutral: no targets, no good or bad. */
export function NutritionTrends() {
  const hidden = useNumbersHidden();
  const { data, tz, today } = useChartData();
  const { spacing } = useTheme();
  const [metric, setMetric] = useState<NutritionMetric>('kcal');
  const [sel, setSel] = useState<number | null>(null);
  const days = useMemo(
    () => (data ? nutritionDays(data.logs, today, tz, 14) : []),
    [data, today, tz],
  );
  if (hidden || !data || days.every((d) => d.kcal === null)) return null;
  const points = nutritionSeries(days, metric);
  const cmp = compareWeeks(days, metric);
  const unit = metric === 'kcal' ? 'kcal' : 'g protein';
  const line = cmp.comparable
    ? `Average on logged days: ${cmp.thisWeek.avg} ${unit} this week (${cmp.thisWeek.loggedDays} days logged), ${cmp.lastWeek.avg} last week (${cmp.lastWeek.loggedDays} days logged).`
    : `Not enough logged days to compare weeks yet (this week ${cmp.thisWeek.loggedDays}, last week ${cmp.lastWeek.loggedDays}).`;
  return (
    <ChartCard
      icon="restaurant"
      title="What you logged"
      summary={`${metric === 'kcal' ? 'Calories' : 'Protein'} logged, last 14 days`}
      points={points}
      unit={unit}
      selected={sel === null ? null : (points[sel] ?? null)}
      footnote={`${line} Days without a log are gaps, not zero. Fibre is not tracked.`}
      control={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['kcal', 'proteinG'] as const).map((m) => (
            <Button
              key={m}
              variant={metric === m ? 'primary' : 'secondary'}
              label={m === 'kcal' ? 'Calories' : 'Protein'}
              onPress={() => {
                setMetric(m);
                setSel(null);
              }}
            />
          ))}
        </View>
      }
    >
      <LineChart points={points} unit={unit} selected={sel} onSelect={setSel} />
    </ChartCard>
  );
}

/** Which recent days had an eligible movement session; planned rest days are calm, never failures. Display only: streak counts come from the confirmed state. */
export function ActivityCalendar() {
  const { data, tz, today } = useChartData();
  const prog = useProgression();
  const [sel, setSel] = useState<number | null>(null);
  const rest = prog.prefs.restWeekdays;
  const cells = useMemo(() => {
    const active = new Set(
      (data?.sessions ?? [])
        .filter((s) => s.status === 'completed' && s.completedAt)
        .map((s) => localDateKey(s.completedAt!, tz)),
    );
    return calendarCells(active, rest, today, 5);
  }, [data, rest, today, tz]);
  if (!data || !cells.some((c) => c.state === 'active')) return null;
  const n = cells.filter((c) => c.state === 'active').length;
  const picked = sel === null ? null : cells[sel];
  return (
    <Card>
      <SectionTitle icon="calendar" title="Your active days" />
      <CalendarGrid cells={cells} selected={sel} onSelect={setSel} />
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {picked
          ? `${picked.full}: ${picked.state === 'active' ? 'active' : picked.state === 'rest' ? 'planned rest day' : picked.state === 'today' ? 'today, still open' : 'no activity recorded'}`
          : `${n} active ${n === 1 ? 'day' : 'days'} in the last 5 weeks. Moons are your planned rest days.`}
      </AppText>
    </Card>
  );
}
