import { localDateKey, totals } from '@dancehall/shared';
import type { FoodLog } from '../data/types';

export interface NutritionDay {
  date: string;
  kcal: number;
  meals: number;
}
export interface NutritionWeek {
  days: NutritionDay[]; // seven days, oldest first, ending today
  daysLogged: number;
  /** Average over days that have at least one meal. Days with nothing logged are not counted as zero. */
  avgKcal: number | null;
}

const DAY_MS = 86_400_000;
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** A neutral look at the last seven days. No target, no over/under: it only reports what was logged. */
export function weeklyNutrition(
  logs: FoodLog[],
  timeZone: string | null,
  now: Date,
): NutritionWeek {
  const today = localDateKey(now, timeZone);
  const byDay = new Map<string, FoodLog[]>();
  for (const l of logs) {
    const k = localDateKey(l.loggedAt, timeZone);
    byDay.set(k, [...(byDay.get(k) ?? []), l]);
  }
  const days: NutritionDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const ls = byDay.get(date) ?? [];
    days.push({
      date,
      kcal: Math.round(totals(ls.flatMap((l) => l.items)).kcal),
      meals: ls.length,
    });
  }
  const logged = days.filter((d) => d.meals > 0);
  return {
    days,
    daysLogged: logged.length,
    avgKcal: logged.length
      ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length)
      : null,
  };
}
