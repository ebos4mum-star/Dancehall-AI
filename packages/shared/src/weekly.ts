import { sessionMinutes, weekStartOf } from './activity';
import type { WeekFacts } from './daily-plan';
import { localDateKey } from './food';
import { sortByTime, type WeightPoint } from './progress';

/** Facts for the weekly review, computed in the person's time zone. Weight is reduced to a direction. */
export function buildWeekFacts(args: {
  weekStart: string;
  timeZone: string | null;
  sessions: ReadonlyArray<{
    status: string;
    completedAt: string | null;
    durationS: number | null;
    minutes: number;
    style: string | null;
    lowImpact: boolean;
  }>;
  foodLogTimes: readonly string[];
  weights: readonly WeightPoint[];
  activeGoals: number;
}): WeekFacts {
  const inWeek = (iso: string) => weekStartOf(localDateKey(iso, args.timeZone)) === args.weekStart;
  const done = args.sessions.filter(
    (s) => s.status === 'completed' && s.completedAt && inWeek(s.completedAt),
  );
  const days = new Set(done.map((s) => localDateKey(s.completedAt!, args.timeZone)));
  const foodDays = new Set(
    args.foodLogTimes.filter(inWeek).map((t) => localDateKey(t, args.timeZone)),
  );
  const sorted = sortByTime(args.weights);
  const near = sorted.filter(
    (w) =>
      Date.parse(w.measuredAt) >= Date.parse(`${args.weekStart}T00:00:00Z`) - 7 * 86_400_000 &&
      Date.parse(w.measuredAt) < Date.parse(`${args.weekStart}T00:00:00Z`) + 8 * 86_400_000,
  );
  let weightTrend: WeekFacts['weightTrend'] = null;
  if (near.length >= 2) {
    const d = near[near.length - 1]!.weightKg - near[0]!.weightKg;
    weightTrend = Math.abs(d) < 0.3 ? 'steady' : d < 0 ? 'down' : 'up';
  }
  return {
    weekStart: args.weekStart,
    sessions: done.length,
    minutes: done.reduce((s, x) => s + sessionMinutes(x), 0),
    activeDays: days.size,
    foodLoggedDays: foodDays.size,
    styles: [...new Set(done.map((s) => s.style).filter((s): s is string => !!s))],
    lowImpactSessions: done.filter((s) => s.lowImpact).length,
    weightTrend,
    activeGoals: args.activeGoals,
  };
}
