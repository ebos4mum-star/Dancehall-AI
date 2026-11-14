import { sessionMinutes, weekStartOf } from './activity';
import { localDateKey } from './food';
import { entriesOf, hydrationOn, type WellnessEntry } from './wellness';

/**
 * Pulse celebrations: which goal achievements, across daily, weekly, monthly and yearly periods, deserve a celebration. Pure and computed ONLY from
 * what the person recorded and the goals they set (their own water goal and weekly movement-minutes goal); nothing is estimated.
 *
 * Deliberately NOT celebrated: weight, calories, measurements or any food number. Weight celebrations need owner approval and the same safety
 * rules as weight goals (see docs/PULSE_CELEBRATIONS.md). A missed period is never mentioned.
 *
 * The thresholds below are PROVISIONAL defaults pending owner approval of the goal model; they are all in this one object.
 */
export const CELEBRATION_RULES = {
  /** A "moved today" celebration needs at least this many minutes of dance, walking and strength combined. */
  dailyMovementMinutes: 10,
  /** Monthly: the weekly movement goal met in at least this many weeks that start in the month. */
  monthlyWeeksRequired: 3,
  /** Yearly: the weekly movement goal met in at least this many weeks that start in the year (about half the year). */
  yearlyWeeksRequired: 26,
} as const;

export const CELEBRATION_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type CelebrationPeriod = (typeof CELEBRATION_PERIODS)[number];
export type CelebrationKind =
  'water' | 'habits' | 'movement' | 'movement_minutes' | 'movement_weeks';

export interface Celebration {
  /** Stable identity of one achievement, e.g. `daily:water:2026-06-15`. A celebration is shown at most once per id. */
  id: string;
  period: CelebrationPeriod;
  kind: CelebrationKind;
  /** Day, week start, month (YYYY-MM) or year (YYYY) it belongs to. */
  periodKey: string;
}
const make = (
  period: CelebrationPeriod,
  kind: CelebrationKind,
  periodKey: string,
): Celebration => ({
  id: `${period}:${kind}:${periodKey}`,
  period,
  kind,
  periodKey,
});

export interface CelebrationInput {
  /** Today in the person's time zone (YYYY-MM-DD). */
  today: string;
  timeZone: string | null;
  /** The person's own water goal, or the general guide when they have not set one. */
  waterGoalMl: number;
  /** The person's own weekly movement goal in minutes. Null means they have not set one, so no weekly, monthly or yearly movement celebrations. */
  weeklyMinutesGoal: number | null;
  /** Wellness entries covering at least the start of this year. */
  entries: readonly WellnessEntry[];
  sessions: ReadonlyArray<{
    status: string;
    completedAt: string | null;
    minutes: number;
    durationS: number | null;
  }>;
  habits: {
    activeIds: readonly string[];
    checkins: ReadonlyArray<{ habitId: string; day: string }>;
  };
}

/** Minutes of recorded movement per local day: completed dance sessions, plus logged walks and strength sessions. */
export function movementMinutesByDay(
  sessions: CelebrationInput['sessions'],
  entries: readonly WellnessEntry[],
  timeZone: string | null,
): Map<string, number> {
  const by = new Map<string, number>();
  const add = (day: string, m: number) => by.set(day, (by.get(day) ?? 0) + m);
  for (const s of sessions)
    if (s.status === 'completed' && s.completedAt)
      add(localDateKey(s.completedAt, timeZone), sessionMinutes(s));
  for (const e of [...entriesOf(entries, 'walk'), ...entriesOf(entries, 'strength')])
    add(e.day, e.amount);
  return by;
}

/** Every celebration currently earned for today's day, week, month and year. Idempotent: the same data always gives the same ids. */
export function achievedCelebrations(i: CelebrationInput): Celebration[] {
  const out: Celebration[] = [];
  const minutes = movementMinutesByDay(i.sessions, i.entries, i.timeZone);

  // Daily
  if (i.waterGoalMl > 0 && hydrationOn(i.entries, i.today, i.waterGoalMl).ml >= i.waterGoalMl)
    out.push(make('daily', 'water', i.today));
  if (
    i.habits.activeIds.length > 0 &&
    i.habits.activeIds.every((h) =>
      i.habits.checkins.some((c) => c.habitId === h && c.day === i.today),
    )
  )
    out.push(make('daily', 'habits', i.today));
  if ((minutes.get(i.today) ?? 0) >= CELEBRATION_RULES.dailyMovementMinutes)
    out.push(make('daily', 'movement', i.today));

  // Weekly, monthly and yearly all hang off the person's OWN weekly movement goal.
  const goal = i.weeklyMinutesGoal;
  if (goal && goal > 0) {
    const perWeek = new Map<string, number>();
    for (const [day, m] of minutes)
      perWeek.set(weekStartOf(day), (perWeek.get(weekStartOf(day)) ?? 0) + m);
    const metWeeks = [...perWeek].filter(([, m]) => m >= goal).map(([w]) => w);
    const thisWeek = weekStartOf(i.today);
    if (metWeeks.includes(thisWeek)) out.push(make('weekly', 'movement_minutes', thisWeek));
    const month = i.today.slice(0, 7);
    const year = i.today.slice(0, 4);
    if (
      metWeeks.filter((w) => w.startsWith(month)).length >= CELEBRATION_RULES.monthlyWeeksRequired
    )
      out.push(make('monthly', 'movement_weeks', month));
    if (metWeeks.filter((w) => w.startsWith(year)).length >= CELEBRATION_RULES.yearlyWeeksRequired)
      out.push(make('yearly', 'movement_weeks', year));
  }
  return out;
}

const ORDER: Record<CelebrationPeriod, number> = { yearly: 0, monthly: 1, weekly: 2, daily: 3 };

/** The achievements not yet celebrated, biggest period first. `seen === null` means the ledger is new: nothing is celebrated retroactively. */
export function dueCelebrations(
  achieved: readonly Celebration[],
  seen: ReadonlySet<string> | null,
): Celebration[] {
  if (seen === null) return [];
  return achieved.filter((c) => !seen.has(c.id)).sort((a, b) => ORDER[a.period] - ORDER[b.period]);
}

/** Keeps the ledger small: the most recent ids only. */
export const MAX_SEEN = 300;
export function remember(seen: ReadonlySet<string> | null, add: readonly Celebration[]): string[] {
  return [...(seen ?? []), ...add.map((c) => c.id)].slice(-MAX_SEEN);
}
