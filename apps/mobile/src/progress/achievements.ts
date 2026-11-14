import { localDateKey } from '@dancehall/shared';
import type { FoodLog, WorkoutSession } from '../data/types';

/**
 * Gentle tracking (docs/FITNESS_SAFETY.md): achievements are cumulative and are never lost, there are no streaks to
 * protect, and a rest day costs nothing. Everything is derived from data the app already stores, so it works the same
 * in mock and Supabase mode. None of it involves body weight.
 */
export type AchievementId =
  | 'first_session'
  | 'sessions_5'
  | 'sessions_10'
  | 'sessions_25'
  | 'minutes_60'
  | 'minutes_300'
  | 'three_active_days'
  | 'gentle_session'
  | 'welcome_back'
  | 'first_meal'
  | 'meals_7_days';

export interface Achievement {
  id: AchievementId;
  /** Local calendar date (YYYY-MM-DD) on which it was first earned. */
  earnedOn: string;
}

export interface ActivityInput {
  sessions: WorkoutSession[];
  foodLogs: FoodLog[];
  timeZone: string | null;
}

const DAY_MS = 86_400_000;
const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

interface Done {
  day: string;
  minutes: number;
  lowImpact: boolean;
}

function completed(sessions: WorkoutSession[], tz: string | null): Done[] {
  return sessions
    .filter((s) => s.status === 'completed' && s.completedAt)
    .map((s) => ({
      day: localDateKey(s.completedAt!, tz),
      at: s.completedAt!,
      minutes: s.durationS != null ? Math.round(s.durationS / 60) : s.minutes,
      lowImpact: s.lowImpact,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function computeAchievements(input: ActivityInput): Achievement[] {
  const done = completed(input.sessions, input.timeZone);
  const out: Achievement[] = [];
  const add = (id: AchievementId, earnedOn: string | undefined) => {
    if (earnedOn) out.push({ id, earnedOn });
  };

  add('first_session', done[0]?.day);
  add('sessions_5', done[4]?.day);
  add('sessions_10', done[9]?.day);
  add('sessions_25', done[24]?.day);

  let total = 0;
  let m60: string | undefined;
  let m300: string | undefined;
  for (const d of done) {
    total += d.minutes;
    if (total >= 60 && !m60) m60 = d.day;
    if (total >= 300 && !m300) m300 = d.day;
  }
  add('minutes_60', m60);
  add('minutes_300', m300);

  add('gentle_session', done.find((d) => d.lowImpact)?.day);

  // Three different active days inside any seven-day window.
  const days = [...new Set(done.map((d) => d.day))].sort();
  for (let i = 2; i < days.length; i++) {
    if (dayNumber(days[i]!) - dayNumber(days[i - 2]!) <= 6) {
      add('three_active_days', days[i]);
      break;
    }
  }

  // Returning after a week or more away is celebrated, never counted against anyone.
  for (let i = 1; i < days.length; i++) {
    if (dayNumber(days[i]!) - dayNumber(days[i - 1]!) >= 7) {
      add('welcome_back', days[i]);
      break;
    }
  }

  const mealDays = [
    ...new Set(input.foodLogs.map((l) => localDateKey(l.loggedAt, input.timeZone))),
  ].sort();
  add('first_meal', mealDays[0]);
  add('meals_7_days', mealDays[6]);

  return out.sort((a, b) => b.earnedOn.localeCompare(a.earnedOn) || a.id.localeCompare(b.id));
}

export interface HabitDay {
  date: string;
  moved: boolean;
  logged: boolean;
}
export interface WeeklyHabits {
  days: HabitDay[]; // oldest first, ending today
  movedDays: number;
  loggedDays: number;
}

/** The last seven days, ending today. Counts only; no streak, no "missed" state. */
export function weeklyHabits(input: ActivityInput, now: Date): WeeklyHabits {
  const today = localDateKey(now, input.timeZone);
  const moved = new Set(completed(input.sessions, input.timeZone).map((d) => d.day));
  const logged = new Set(input.foodLogs.map((l) => localDateKey(l.loggedAt, input.timeZone)));
  const days: HabitDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    days.push({ date, moved: moved.has(date), logged: logged.has(date) });
  }
  return {
    days,
    movedDays: days.filter((d) => d.moved).length,
    loggedDays: days.filter((d) => d.logged).length,
  };
}

/** Ids earned but not yet celebrated. First run (nothing stored) celebrates nothing, so existing history does not flood the screen. */
export function newlyEarned(earned: Achievement[], seen: string[] | null): AchievementId[] {
  if (seen === null) return [];
  return earned.filter((a) => !seen.includes(a.id)).map((a) => a.id);
}
