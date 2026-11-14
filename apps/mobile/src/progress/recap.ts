import { addDaysIso, localDateKey, sessionMinutes, weekStartOf } from '@dancehall/shared';
import { goalFraction } from './goalDisplay';

export interface RecapInput {
  now: Date;
  timeZone: string | null;
  sessions: ReadonlyArray<{
    status: string;
    completedAt: string | null;
    durationS: number | null;
    minutes: number;
  }>;
  foodLogTimes: readonly string[];
  habits: ReadonlyArray<{ id: string }>;
  checkins: ReadonlyArray<{ habitId: string; day: string }>;
  goals: ReadonlyArray<{ status: string; type: string; startKg: number; targetKg: number }>;
  weights: ReadonlyArray<{ weightKg: number; measuredAt: string }>;
}

export interface Recap {
  weekStart: string;
  /** Days of this week that have started (1-7). Fewer than 7 means a partial week. */
  daysSoFar: number;
  dance: { sessions: number; minutes: number; activeDays: number };
  /** Distinct days with a food log this week, or null when food has never been logged (missing, not zero). */
  foodDays: number | null;
  /** Habit ticks this week and how many were possible so far, or null when no habits are set. */
  habits: { done: number; possible: number } | null;
  /** Progress per active goal; null progress means no recorded weight yet. */
  goals: Array<{ type: string; fraction: number | null }>;
  weightEntries: number;
  insight: string;
}

/** A supportive weekly summary from recorded data only. Missing data is reported as missing, never as zero progress. No calorie burn is estimated. */
export function weeklyRecap(i: RecapInput): Recap {
  const today = localDateKey(i.now, i.timeZone);
  const weekStart = weekStartOf(today);
  const daysSoFar = Math.min(
    7,
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000,
    ) + 1,
  );
  const inWeek = (iso: string) => weekStartOf(localDateKey(iso, i.timeZone)) === weekStart;
  const done = i.sessions.filter(
    (s) => s.status === 'completed' && s.completedAt && inWeek(s.completedAt),
  );
  const activeDays = new Set(done.map((s) => localDateKey(s.completedAt!, i.timeZone))).size;
  const dance = {
    sessions: done.length,
    minutes: done.reduce((a, s) => a + sessionMinutes(s), 0),
    activeDays,
  };
  const foodDays =
    i.foodLogTimes.length === 0
      ? null
      : new Set(i.foodLogTimes.filter(inWeek).map((t) => localDateKey(t, i.timeZone))).size;
  const habitIds = new Set(i.habits.map((h) => h.id));
  const weekDays = new Set(Array.from({ length: daysSoFar }, (_, k) => addDaysIso(weekStart, k)));
  const habits =
    habitIds.size === 0
      ? null
      : {
          done: i.checkins.filter((c) => habitIds.has(c.habitId) && weekDays.has(c.day)).length,
          possible: habitIds.size * daysSoFar,
        };
  const latest = [...i.weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
    ?.weightKg;
  const goals = i.goals
    .filter((g) => g.status === 'active')
    .map((g) => ({
      type: g.type,
      fraction: goalFraction(g as Parameters<typeof goalFraction>[0], latest),
    }));
  const weightEntries = i.weights.filter((w) => inWeek(w.measuredAt)).length;

  const insight =
    dance.sessions > 0
      ? `You moved on ${dance.activeDays} ${dance.activeDays === 1 ? 'day' : 'days'} this week for ${dance.minutes} minutes in total. That counts.`
      : (foodDays ?? 0) > 0 || (habits?.done ?? 0) > 0
        ? 'You showed up for yourself this week through food logging or habits. A short dance session is there whenever you want one.'
        : 'This week is still open. One short session, one meal logged or one habit ticked is a good place to start.';
  return { weekStart, daysSoFar, dance, foodDays, habits, goals, weightEntries, insight };
}
