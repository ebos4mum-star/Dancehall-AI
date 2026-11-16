import { localDateKey } from './food';
import { sessionMinutes } from './activity';
import { estimateBmrKcal, type ActivityLevel, type Sex } from './safety';

/**
 * Conservative workout-energy estimates.
 *
 * These are ROUGH ESTIMATES from published MET ranges (we use the low end), the person's weight and the time actually exercised. They can be off by a wide margin,
 * so they always carry a range and are never used to change a calorie target automatically.
 *
 * Double counting is the real risk: a daily calorie guide built from an activity level (see safety.ts) ALREADY assumes a typical amount of movement. Adding every
 * workout's calories on top would count the same movement twice. So the only energy ever offered as "extra fuel" is what a day's workouts exceed that already-assumed
 * baseline, and only half of that, capped, and only as information. Nothing here is shown as calories "earned" or "to eat back".
 */
export const WORKOUT_ENERGY_NOTE =
  'A rough estimate of the energy used, from your weight and time exercised. Your daily guide already includes a typical amount of movement, so this is not added to it.';

/** Net MET (above resting) by style, at the low end of published ranges. Unknown styles use the general figure. */
const NET_MET: Record<string, number> = {
  dancehall: 4.0,
  afrobeats: 4.0,
  amapiano: 3.8,
  soca: 4.5,
  reggae: 3.0,
  hiphop: 4.5,
  chair: 1.8,
  seated: 1.8,
  strength: 2.5,
  walking: 2.5,
};
const DEFAULT_NET_MET = 3.0;
const CONSERVATIVE = 0.9;

export interface WorkoutEnergy {
  kcal: number;
  low: number;
  high: number;
}
const round5 = (n: number) => Math.round(n / 5) * 5;

/** Net energy of one workout. Null when weight or time is missing (never a guess). Low-impact sessions use a lower figure. */
export function workoutEnergy(a: {
  weightKg: number | null | undefined;
  minutes: number;
  style?: string | null;
  lowImpact?: boolean;
}): WorkoutEnergy | null {
  if (!a.weightKg || !(a.weightKg > 20) || !(a.weightKg < 400) || !(a.minutes > 0)) return null;
  const minutes = Math.min(a.minutes, 240);
  const met = NET_MET[(a.style ?? '').toLowerCase()] ?? DEFAULT_NET_MET;
  const kcal = met * (a.lowImpact ? 0.8 : 1) * a.weightKg * (minutes / 60) * CONSERVATIVE;
  return { kcal: round5(kcal), low: round5(kcal * 0.7), high: round5(kcal * 1.15) };
}

export interface EnergySession {
  id: string;
  workoutId?: string | null;
  title: string;
  style: string | null;
  status: 'planned' | 'completed' | 'skipped';
  completedAt: string | null;
  durationS: number | null;
  minutes: number;
  lowImpact: boolean;
}

/**
 * The completed sessions that should count, once each: only completed ones, one per id, and a repeat of the same workout recorded within ten minutes of another
 * (for example logged by hand and then again from the plan) is treated as the same session.
 */
export function countedSessions<T extends EnergySession>(sessions: readonly T[]): T[] {
  const done = sessions
    .filter((s) => s.status === 'completed' && s.completedAt)
    .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!) || a.id.localeCompare(b.id));
  const out: T[] = [];
  const ids = new Set<string>();
  for (const s of done) {
    if (ids.has(s.id)) continue;
    const t = Date.parse(s.completedAt!);
    const dup = out.some(
      (o) =>
        (o.workoutId ?? o.title.toLowerCase()) === (s.workoutId ?? s.title.toLowerCase()) &&
        Math.abs(Date.parse(o.completedAt!) - t) < 10 * 60_000,
    );
    if (dup) continue;
    ids.add(s.id);
    out.push(s);
  }
  return out;
}

/** What the activity level in the daily guide already assumes, per day (kcal above sedentary). */
const LEVEL_EXTRA: Record<ActivityLevel, number> = {
  low: 0,
  light: 0.175,
  moderate: 0.35,
  high: 0.525,
};
export function assumedMovementKcal(a: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activity: ActivityLevel;
}): number {
  return Math.round(estimateBmrKcal(a) * LEVEL_EXTRA[a.activity]);
}

export interface DayEnergy {
  day: string;
  sessions: number;
  workoutKcal: number | null;
  /** What the guide already assumes for movement on a typical day. */
  assumedKcal: number | null;
  /** Information only: half of what the day's workouts exceed the assumed movement by, at most 300 kcal. Zero on most days. */
  extraFuelKcal: number;
}
export const EXTRA_FUEL_CAP = 300;

/** One day's workout energy against what the daily guide already assumes. Missing weight gives nulls and zero extra fuel (never a guess). */
export function dayEnergy(a: {
  day: string;
  sessions: readonly EnergySession[];
  weightKg: number | null;
  assumedKcal: number | null;
  timeZone: string | null;
}): DayEnergy {
  const today = countedSessions(a.sessions).filter(
    (s) => localDateKey(s.completedAt!, a.timeZone) === a.day,
  );
  let total = 0;
  let any = false;
  for (const s of today) {
    const e = workoutEnergy({
      weightKg: a.weightKg,
      minutes: sessionMinutes(s),
      style: s.style,
      lowImpact: s.lowImpact,
    });
    if (e) {
      total += e.kcal;
      any = true;
    }
  }
  const assumed = a.assumedKcal;
  const extra = any && assumed !== null ? Math.max(0, total - assumed) * 0.5 : 0;
  return {
    day: a.day,
    sessions: today.length,
    workoutKcal: any ? total : null,
    assumedKcal: assumed,
    extraFuelKcal: Math.min(EXTRA_FUEL_CAP, round5(extra)),
  };
}
