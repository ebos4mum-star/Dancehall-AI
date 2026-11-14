import { localDateKey } from './food';

export interface SessionLike {
  status: 'planned' | 'completed' | 'skipped';
  completedAt: string | null;
  durationS: number | null;
  minutes: number;
}
export interface WeekBucket {
  /** Monday of the week (YYYY-MM-DD) */
  weekStart: string;
  sessions: number;
  minutes: number;
}
export interface ActivitySummary {
  thisWeek: WeekBucket & { activeDays: number };
  weeks: WeekBucket[];
  totalSessions: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Monday of the week containing a YYYY-MM-DD date. */
export function weekStartOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
/** Minutes counted for a completed session: the time actually exercised if known, otherwise the workout's length. */
export const sessionMinutes = (s: Pick<SessionLike, 'durationS' | 'minutes'>): number =>
  s.durationS && s.durationS > 0 ? Math.max(1, Math.round(s.durationS / 60)) : s.minutes;

/**
 * Weekly activity totals in the person's time zone. Deliberately gentle: no streaks that reset, no penalties for missed days.
 */
export function activitySummary(
  sessions: readonly SessionLike[],
  opts: { timeZone: string | null; now: Date; weeks?: number },
): ActivitySummary {
  const weeksN = opts.weeks ?? 4;
  const today = localDateKey(opts.now, opts.timeZone);
  const thisStart = weekStartOf(today);
  const buckets: WeekBucket[] = Array.from({ length: weeksN }, (_, i) => ({
    weekStart: addDays(thisStart, -7 * (weeksN - 1 - i)),
    sessions: 0,
    minutes: 0,
  }));
  const activeDays = new Set<string>();
  let total = 0;
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedAt) continue;
    total += 1;
    const key = localDateKey(s.completedAt, opts.timeZone);
    const b = buckets.find((x) => x.weekStart === weekStartOf(key));
    if (b) {
      b.sessions += 1;
      b.minutes += sessionMinutes(s);
    }
    if (weekStartOf(key) === thisStart) activeDays.add(key);
  }
  const cur = buckets[buckets.length - 1]!;
  return {
    thisWeek: { ...cur, activeDays: activeDays.size },
    weeks: buckets,
    totalSessions: total,
  };
}
