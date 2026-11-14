import { sessionMinutes, weekStartOf } from './activity';
import type { WeekFacts } from './daily-plan';
import { localDateKey } from './food';
import { entriesOf, type WellnessEntry } from './wellness';
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
  /** Optional recorded wellness logs; any dates are accepted and filtered to the week. */
  wellness?: readonly WellnessEntry[];
  /** When true (eating concern, pregnancy/postpartum, or numbers off) no wellness numbers are included. Walks and strength still count as active days. */
  hideWellnessNumbers?: boolean;
}): WeekFacts {
  const inWeek = (iso: string) => weekStartOf(localDateKey(iso, args.timeZone)) === args.weekStart;
  const done = args.sessions.filter(
    (s) => s.status === 'completed' && s.completedAt && inWeek(s.completedAt),
  );
  const days = new Set(done.map((s) => localDateKey(s.completedAt!, args.timeZone)));
  const wk = (args.wellness ?? []).filter((e) => weekStartOf(e.day) === args.weekStart);
  const walks = entriesOf(wk, 'walk');
  const strength = entriesOf(wk, 'strength');
  const sleep = new Map(entriesOf(wk, 'sleep').map((e) => [e.day, e.amount]));
  // Walks and strength sessions are movement too, so they join dance in the active-day count (once per day).
  for (const e of [...walks, ...strength]) days.add(e.day);
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
    ...(wk.length > 0 && !args.hideWellnessNumbers
      ? {
          wellness: {
            walkDays: new Set(walks.map((e) => e.day)).size,
            walkMinutes: walks.reduce((a, e) => a + e.amount, 0),
            strengthSessions: strength.length,
            sleepNights: sleep.size,
            sleepAvgHours:
              sleep.size >= 3
                ? Math.round(([...sleep.values()].reduce((a, b) => a + b, 0) / sleep.size) * 10) /
                  10
                : null,
            hungerCheckins: entriesOf(wk, 'hunger').length,
            waterLoggedDays: new Set(entriesOf(wk, 'hydration').map((e) => e.day)).size,
          },
        }
      : {}),
  };
}
