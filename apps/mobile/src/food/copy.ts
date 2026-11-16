import { localDateKey, type FoodItemValues, type MealType } from '@dancehall/shared';
import type { FoodLog, NewFoodLog } from '@/data/types';

/** An instant (ISO) that falls on local calendar day `dayKey` in `timeZone`, near `hour` o'clock. Never throws; falls back to noon UTC. */
export function instantOnLocalDay(dayKey: string, timeZone: string | null, hour = 12): string {
  const base = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(base)) return new Date().toISOString();
  // Zone offsets are within -12h..+14h: try the nearest shifts first.
  const shifts = Array.from({ length: 29 }, (_, i) => i - 14).sort(
    (a, b) => Math.abs(a) - Math.abs(b),
  );
  for (const shift of shifts) {
    const d = new Date(base + (hour + shift) * 3_600_000);
    if (localDateKey(d, timeZone) === dayKey) return d.toISOString();
  }
  return new Date(base + 12 * 3_600_000).toISOString();
}

const MEAL_HOUR: Record<MealType, number> = { breakfast: 8, lunch: 12, dinner: 18, snack: 15 };

const clean = (i: FoodItemValues): FoodItemValues => ({
  name: i.name,
  foodId: i.foodId,
  grams: i.grams,
  kcal: i.kcal,
  proteinG: i.proteinG,
  carbsG: i.carbsG,
  fatG: i.fatG,
  kcalLow: i.kcalLow,
  kcalHigh: i.kcalHigh,
  source: i.source,
  confidence: i.confidence,
  userEdited: i.userEdited,
});

/** One meal repeated: the same foods and portions, as a new entry. Values keep their original estimate labels; nothing is silently upgraded to "exact". */
export function repeatLog(
  log: FoodLog,
  opts: { mealType?: MealType; loggedAt?: string } = {},
): NewFoodLog {
  return {
    mealType: opts.mealType ?? log.mealType,
    loggedAt: opts.loggedAt ?? new Date().toISOString(),
    source: 'manual',
    items: log.items.map(clean),
  };
}

/** Every meal on `fromKey`, repeated onto `toKey`. Today keeps "now" for each meal; other days use a typical hour for the meal. */
export function copyDay(
  logs: readonly FoodLog[],
  fromKey: string,
  toKey: string,
  timeZone: string | null,
  now: Date = new Date(),
): NewFoodLog[] {
  if (fromKey === toKey) return [];
  const todayKey = localDateKey(now, timeZone);
  return logs
    .filter((l) => localDateKey(l.loggedAt, timeZone) === fromKey && l.items.length > 0)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .map((l) =>
      repeatLog(l, {
        loggedAt:
          toKey === todayKey
            ? new Date(now.getTime()).toISOString()
            : instantOnLocalDay(toKey, timeZone, MEAL_HOUR[l.mealType]),
      }),
    );
}

/** The most recent earlier day that has at least one meal of this type, for "same as last time". */
export function lastSimilarMeal(
  logs: readonly FoodLog[],
  mealType: MealType,
  beforeKey: string,
  timeZone: string | null,
): FoodLog | null {
  const hits = logs
    .filter(
      (l) =>
        l.mealType === mealType &&
        l.items.length > 0 &&
        localDateKey(l.loggedAt, timeZone) < beforeKey,
    )
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return hits[0] ?? null;
}
