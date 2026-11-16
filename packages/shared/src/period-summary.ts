import { localDateKey, totals, type FoodItemValues } from './food';
import { sessionMinutes } from './activity';
import { countedSessions, workoutEnergy, type EnergySession } from './activity-energy';

/**
 * Weekly and monthly summaries from recorded data only. Missing days are reported as missing, never as zero or as failure, and no streak resets. Pure.
 */
export type Period = 'week' | 'month';
export interface PeriodInput {
  period: Period;
  now: Date;
  timeZone: string | null;
  foodLogs: ReadonlyArray<{ loggedAt: string; items: readonly FoodItemValues[] }>;
  sessions: readonly EnergySession[];
  weights: ReadonlyArray<{ weightKg: number; measuredAt: string }>;
  weightKg: number | null;
}
export interface PeriodSummary {
  period: Period;
  /** First and last day (YYYY-MM-DD) covered; for the current week or month the last day is today. */
  from: string;
  to: string;
  days: number;
  food: {
    daysLogged: number;
    /** Averages over days that have at least one entry. Null when nothing was logged. */
    avgKcal: number | null;
    avgProteinG: number | null;
  };
  movement: {
    sessions: number;
    minutes: number;
    activeDays: number;
    estKcal: number | null;
    estKcalLow: number | null;
    estKcalHigh: number | null;
  };
  weight: {
    entries: number;
    firstKg: number | null;
    lastKg: number | null;
    changeKg: number | null;
  };
  /** Plain supportive lines. Never scolding, no calorie talk when nothing was logged. */
  highlights: string[];
}

const DAY = 86_400_000;
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function periodSummary(i: PeriodInput): PeriodSummary {
  const to = localDateKey(i.now, i.timeZone);
  const from = i.period === 'week' ? addDays(to, -6) : `${to.slice(0, 8)}01`;
  const days =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  const inRange = (iso: string) => {
    const k = localDateKey(iso, i.timeZone);
    return k >= from && k <= to;
  };

  const byDay = new Map<string, FoodItemValues[]>();
  for (const l of i.foodLogs) {
    if (!inRange(l.loggedAt) || l.items.length === 0) continue;
    const k = localDateKey(l.loggedAt, i.timeZone);
    byDay.set(k, [...(byDay.get(k) ?? []), ...l.items]);
  }
  const dayTotals = [...byDay.values()].map((items) => totals(items));
  const avg = (f: (t: ReturnType<typeof totals>) => number) =>
    dayTotals.length ? dayTotals.reduce((a, t) => a + f(t), 0) / dayTotals.length : null;
  const avgKcal = avg((t) => t.kcal);
  const avgProtein = avg((t) => t.proteinG);

  const done = countedSessions(i.sessions).filter((s) => inRange(s.completedAt!));
  const activeDays = new Set(done.map((s) => localDateKey(s.completedAt!, i.timeZone))).size;
  let kcal = 0;
  let low = 0;
  let high = 0;
  let known = 0;
  for (const s of done) {
    const e = workoutEnergy({
      weightKg: i.weightKg,
      minutes: sessionMinutes(s),
      style: s.style,
      lowImpact: s.lowImpact,
    });
    if (e) {
      kcal += e.kcal;
      low += e.low;
      high += e.high;
      known += 1;
    }
  }

  const ws = [...i.weights]
    .filter((w) => inRange(w.measuredAt))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const firstKg = ws[0]?.weightKg ?? null;
  const lastKg = ws.at(-1)?.weightKg ?? null;
  const changeKg =
    ws.length >= 2 && firstKg !== null && lastKg !== null ? r1(lastKg - firstKg) : null;

  const highlights: string[] = [];
  if (done.length > 0)
    highlights.push(`You moved on ${activeDays} ${activeDays === 1 ? 'day' : 'days'}.`);
  if (byDay.size > 0) highlights.push(`You logged food on ${byDay.size} of ${days} days.`);
  if (ws.length >= 2)
    highlights.push(
      'Your weight entries are in. Day-to-day changes are normal; look at the trend, not one reading.',
    );
  if (highlights.length === 0)
    highlights.push(
      'Nothing recorded in this period yet. Whenever you are ready, one small entry is a fine start.',
    );

  return {
    period: i.period,
    from,
    to,
    days,
    food: {
      daysLogged: byDay.size,
      avgKcal: avgKcal === null ? null : Math.round(avgKcal),
      avgProteinG: avgProtein === null ? null : r1(avgProtein),
    },
    movement: {
      sessions: done.length,
      minutes: done.reduce((a, s) => a + sessionMinutes(s), 0),
      activeDays,
      estKcal: known ? kcal : null,
      estKcalLow: known ? low : null,
      estKcalHigh: known ? high : null,
    },
    weight: { entries: ws.length, firstKg, lastKg, changeKg },
    highlights,
  };
}
