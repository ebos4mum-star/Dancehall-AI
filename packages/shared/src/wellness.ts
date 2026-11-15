import { waterGuideMl } from './nutrition-plan';
import { CUISINE_IDS, type CuisineId } from './cuisines';
import { localDateKey } from './food';
import type { DailyPlanInput } from './daily-plan';
import type { CoachContext } from './coach-context';

/**
 * Wellness domain: preferences, optional logs (hydration, sleep, walking, strength, measurements, hunger, recovery), and the pure
 * summaries built on them. Everything is OPTIONAL and gentle: no streaks, no penalties, nothing here claims device-measured data.
 * One source of truth for the app and for the database checks (supabase/migrations/20261209000100_wellness.sql mirrors these ranges).
 */
/**
 * Goal intents. `strength` (build strength, weight-neutral) was added after the first three: stored values are unchanged, and an older app version that does not
 * know `strength` reads it as the default (`fitness`) rather than failing. `strength` never creates a calorie deficit or a weight target.
 */
export const GOAL_INTENTS = ['lose', 'maintain', 'fitness', 'strength'] as const;
export type GoalIntent = (typeof GOAL_INTENTS)[number];
/** The primary goals the Goals screen offers: all four. */
export const SELECTABLE_GOAL_INTENTS = GOAL_INTENTS;

/**
 * Which goals can sit alongside a primary goal. Losing and maintaining weight pull in opposite directions, so they are never combined; every other pairing is fine.
 * A secondary goal adds its pathways to the plan. It never changes the weight-loss safety rules, which follow the primary goal only.
 */
export const GOAL_COMPATIBILITY: Record<GoalIntent, readonly GoalIntent[]> = {
  lose: ['fitness', 'strength'],
  maintain: ['fitness', 'strength'],
  fitness: ['lose', 'maintain', 'strength'],
  strength: ['lose', 'maintain', 'fitness'],
};
/** The secondary goals a person may choose next to this primary goal. */
export const compatibleSecondaryGoals = (primary: GoalIntent): readonly GoalIntent[] =>
  GOAL_COMPATIBILITY[primary];
/** Keeps only goals that are compatible with the primary goal and with each other, in a fixed order, without repeats. Never throws. */
export function sanitizeSecondaryGoals(
  primary: GoalIntent,
  raw: readonly GoalIntent[],
): GoalIntent[] {
  const out: GoalIntent[] = [];
  for (const g of GOAL_INTENTS) {
    if (!raw.includes(g) || g === primary || !GOAL_COMPATIBILITY[primary].includes(g)) continue;
    if (out.some((o) => !GOAL_COMPATIBILITY[o].includes(g))) continue;
    out.push(g);
  }
  return out;
}

/** The eight coordinated pathways the engine can combine (see pathways.ts). Pathways are rules and tags, not screens or products. */
export const PATHWAY_IDS = [
  'dance_aerobic',
  'balanced_nutrition',
  'strength_training',
  'everyday_movement',
  'cultural_eating',
  'mindful_eating',
  'healthy_habits',
  'weight_maintenance',
] as const;
export type PathwayId = (typeof PATHWAY_IDS)[number];
/** Preferred dance styles. A preference may name a style the catalogue does not have yet (for example dancehall); the engine says so plainly. */
export const STYLE_PREFS = [
  'dancehall',
  'reggae',
  'afrobeats',
  'amapiano',
  'hip_hop',
  'latin',
  'bollywood',
  'soca',
] as const;
export type StylePref = (typeof STYLE_PREFS)[number];
/** Cuisines the person cooks and eats. One taxonomy (cuisines.ts) with the priority cuisines first; ids match the food region tags. */
export const CUISINE_PREFS = CUISINE_IDS;
export type CuisinePref = CuisineId;
export const MOBILITY_PREFS = ['low_impact', 'seated', 'balance_support'] as const;
export type MobilityPref = (typeof MOBILITY_PREFS)[number];
export const EXPERIENCE_LEVELS = ['new', 'some', 'regular'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const SCHEDULE_PREFS = ['morning', 'afternoon', 'evening', 'varies'] as const;
export type SchedulePref = (typeof SCHEDULE_PREFS)[number];
export const ACTIVITY_PREFS = ['dance', 'walking', 'strength'] as const;
export type ActivityPref = (typeof ACTIVITY_PREFS)[number];
export const EQUIPMENT_PREFS = ['none', 'dumbbells', 'bands'] as const;
export type EquipmentPref = (typeof EQUIPMENT_PREFS)[number];
export const DIET_PREFS = [
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'gluten_free',
  'dairy_free',
] as const;
export type DietPref = (typeof DIET_PREFS)[number];
export const CELEBRATION_LEVELS = ['off', 'gentle', 'full'] as const;
/** off = never celebrate; gentle = a calm Pulse message, no haptics; full = Pulse celebration with a brief haptic. */
export type CelebrationLevel = (typeof CELEBRATION_LEVELS)[number];
export const TRACKING_STYLES = ['detailed', 'light', 'none'] as const;
export type TrackingStyle = (typeof TRACKING_STYLES)[number];

export interface WellnessPrefs {
  goalIntent: GoalIntent;
  /** Minutes per week the person would like to move. Optional. */
  exerciseMinutesPerWeek: number | null;
  activities: ActivityPref[];
  equipment: EquipmentPref[];
  diet: DietPref[];
  /** detailed = log meals and amounts; light = log meals only; none = no calorie or weight numbers at all. */
  tracking: TrackingStyle;
  /** Daily water goal in ml, if the person set one. */
  waterGoalMl: number | null;
  /** Optional free text about a wind-down routine (kept private, never analysed). */
  bedtimeRoutine: string | null;
  /** Daily movement goal in minutes (dance, walking and strength together), if the person set one. */
  dailyMovementMinutes: number | null;
  /** How many weeks in a month the person wants to reach their weekly movement goal. Needs the weekly goal. */
  monthlyGoalWeeks: number | null;
  /** How many weeks in a year the person wants to reach their weekly movement goal. Needs the weekly goal. */
  yearlyGoalWeeks: number | null;
  /** How Pulse celebrates goals the person reached. */
  celebrations: CelebrationLevel;
  /** Safety flags the person chose to share. Used only to avoid unsuitable targets. */
  pregnantOrPostpartum: boolean;
  eatingConcern: boolean;
  /** Pathways the person chose. Empty means none chosen: the engine then only SUGGESTS, and nothing is activated for them. */
  pathways: PathwayId[];
  danceStyles: StylePref[];
  cuisines: CuisinePref[];
  mobility: MobilityPref[];
  /** Null means not told. The engine then starts gently and says so; it never guesses. */
  experience: ExperienceLevel | null;
  schedule: SchedulePref | null;
  /** Goals worked on alongside the primary one. Only compatible goals are kept (see GOAL_COMPATIBILITY). */
  secondaryGoals: GoalIntent[];
  /**
   * Whether the person tracks their weight. Null means "never chosen": existing people keep what they had (weight tracking for the lose and maintain goals, or while
   * an active weight goal exists) and everyone else is not asked for weight. See `weightTrackingOn`.
   */
  weightTracking: boolean | null;
}
export const DEFAULT_PREFS: WellnessPrefs = {
  goalIntent: 'fitness',
  exerciseMinutesPerWeek: null,
  activities: ['dance'],
  equipment: ['none'],
  diet: [],
  tracking: 'light',
  waterGoalMl: null,
  bedtimeRoutine: null,
  dailyMovementMinutes: null,
  monthlyGoalWeeks: null,
  yearlyGoalWeeks: null,
  celebrations: 'full',
  pregnantOrPostpartum: false,
  eatingConcern: false,
  pathways: [],
  danceStyles: [],
  cuisines: [],
  mobility: [],
  experience: null,
  schedule: null,
  secondaryGoals: [],
  weightTracking: null,
};
const pick = <T extends string>(v: unknown, all: readonly T[]): T[] =>
  Array.isArray(v) ? all.filter((x) => v.includes(x)) : [];
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** Tolerant parse of stored preferences: unknown or out-of-range values fall back to defaults, never throw. */
export function parsePrefs(raw: unknown): WellnessPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const intent = GOAL_INTENTS.find((g) => g === r.goalIntent) ?? DEFAULT_PREFS.goalIntent;
  const tracking = TRACKING_STYLES.find((g) => g === r.tracking) ?? DEFAULT_PREFS.tracking;
  const acts = pick(r.activities, ACTIVITY_PREFS);
  const equip = pick(r.equipment, EQUIPMENT_PREFS);
  const routine =
    typeof r.bedtimeRoutine === 'string' && r.bedtimeRoutine.trim() !== ''
      ? r.bedtimeRoutine.trim().slice(0, 80)
      : null;
  return {
    goalIntent: intent,
    exerciseMinutesPerWeek: num(r.exerciseMinutesPerWeek, 0, 1000),
    activities: acts.length > 0 ? acts : DEFAULT_PREFS.activities,
    equipment: equip.length > 0 ? equip : DEFAULT_PREFS.equipment,
    diet: pick(r.diet, DIET_PREFS),
    tracking,
    waterGoalMl: num(r.waterGoalMl, 500, 6000),
    bedtimeRoutine: routine,
    dailyMovementMinutes: num(r.dailyMovementMinutes, 1, 600),
    monthlyGoalWeeks: num(r.monthlyGoalWeeks, 1, 5),
    yearlyGoalWeeks: num(r.yearlyGoalWeeks, 1, 53),
    celebrations:
      CELEBRATION_LEVELS.find((g) => g === r.celebrations) ?? DEFAULT_PREFS.celebrations,
    pregnantOrPostpartum: r.pregnantOrPostpartum === true,
    eatingConcern: r.eatingConcern === true,
    pathways: pick(r.pathways, PATHWAY_IDS),
    danceStyles: pick(r.danceStyles, STYLE_PREFS),
    cuisines: pick(r.cuisines, CUISINE_PREFS),
    mobility: pick(r.mobility, MOBILITY_PREFS),
    experience: EXPERIENCE_LEVELS.find((g) => g === r.experience) ?? null,
    schedule: SCHEDULE_PREFS.find((g) => g === r.schedule) ?? null,
    secondaryGoals: sanitizeSecondaryGoals(intent, pick(r.secondaryGoals, GOAL_INTENTS)),
    weightTracking: typeof r.weightTracking === 'boolean' ? r.weightTracking : null,
  };
}

/**
 * Is weight tracking on for this person? Explicit choice wins. With no choice, behaviour is what it always was: on for the lose and maintain goals, and while an active
 * weight goal exists; off for fitness and strength. Weight surfaces use `showWeight`, which also honours hidden numbers.
 */
export const weightTrackingOn = (
  p: Pick<WellnessPrefs, 'weightTracking' | 'goalIntent'>,
  hasActiveWeightGoal = false,
): boolean =>
  p.weightTracking ??
  (p.goalIntent === 'lose' || p.goalIntent === 'maintain' || hasActiveWeightGoal);

/** The single rule every screen uses before showing or asking for weight: the person tracks weight AND their numbers are not hidden. */
export const showWeight = (
  p: Pick<
    WellnessPrefs,
    'weightTracking' | 'goalIntent' | 'eatingConcern' | 'pregnantOrPostpartum' | 'tracking'
  >,
  hasActiveWeightGoal = false,
): boolean => !numbersHidden(p) && weightTrackingOn(p, hasActiveWeightGoal);

/** The one rule for hiding calorie, nutrient and weight numbers: an eating concern, pregnancy or postpartum, or tracking turned off. */
export const numbersHidden = (
  p: Pick<WellnessPrefs, 'eatingConcern' | 'pregnantOrPostpartum' | 'tracking'>,
): boolean => p.eatingConcern || p.pregnantOrPostpartum || p.tracking === 'none';

export const WELLNESS_KINDS = [
  'hydration',
  'sleep',
  'walk',
  'strength',
  'measurement',
  'hunger',
  'recovery',
] as const;
export type WellnessKind = (typeof WELLNESS_KINDS)[number];

export const SLEEP_QUALITY = ['rested', 'ok', 'tired'] as const;
export const MEASURE_SITES = ['waist', 'hips', 'chest', 'thigh', 'arm'] as const;
export const HUNGER_LEVELS = ['hungry', 'comfortable', 'full'] as const;
export const RECOVERY_LEVELS = ['fresh', 'ok', 'sore', 'worn'] as const;
export const STRENGTH_KINDS = ['bodyweight', 'dumbbells', 'bands'] as const;

export interface WellnessEntryInput {
  kind: WellnessKind;
  /** YYYY-MM-DD in the person's time zone. */
  day: string;
  /** ml (hydration) · hours (sleep) · minutes (walk, strength) · cm (measurement) · 0 for check-ins. */
  amount: number;
  /** Walk distance in km, optional. */
  amount2?: number | null;
  /** Quality / site / level / strength style, depending on kind. */
  label?: string | null;
  /** Idempotency key so a double tap or retry never records the same thing twice. */
  clientKey?: string | null;
}
export interface WellnessEntry {
  id: string;
  kind: WellnessKind;
  day: string;
  amount: number;
  amount2: number | null;
  label: string | null;
  createdAt: string;
}

const LABELS: Record<WellnessKind, readonly string[] | null> = {
  hydration: null,
  sleep: SLEEP_QUALITY,
  walk: null,
  strength: STRENGTH_KINDS,
  measurement: MEASURE_SITES,
  hunger: HUNGER_LEVELS,
  recovery: RECOVERY_LEVELS,
};
const RANGE: Record<WellnessKind, [number, number]> = {
  hydration: [1, 5000],
  sleep: [0.5, 16],
  walk: [1, 600],
  strength: [1, 300],
  measurement: [10, 300],
  hunger: [0, 0],
  recovery: [0, 0],
};

/** The rules every entry must satisfy. Returns a plain-language problem, or null when the entry is fine. */
export function entryProblem(e: WellnessEntryInput, today: string): string | null {
  if (!(WELLNESS_KINDS as readonly string[]).includes(e.kind)) return 'Unknown entry type.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day)) return 'Choose a valid date.';
  if (e.day > addDay(today, 1)) return 'That date is in the future.';
  const [lo, hi] = RANGE[e.kind];
  if (!Number.isFinite(e.amount) || e.amount < lo || e.amount > hi)
    return 'That amount is outside the usual range.';
  const set = LABELS[e.kind];
  if (set) {
    if (!e.label || !set.includes(e.label)) {
      // Sleep quality and strength style are optional; measurement site, hunger and recovery levels are the entry itself.
      if (e.kind === 'measurement' || e.kind === 'hunger' || e.kind === 'recovery' || e.label)
        return 'Choose one of the listed options.';
    }
  } else if (e.label) return 'This entry has no label.';
  if (e.amount2 != null) {
    if (e.kind !== 'walk') return 'Distance only applies to walks.';
    if (!Number.isFinite(e.amount2) || e.amount2 < 0 || e.amount2 > 100)
      return 'Distance is outside the usual range.';
  }
  return null;
}
function addDay(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const entriesOf = (list: readonly WellnessEntry[], kind: WellnessKind): WellnessEntry[] =>
  list.filter((e) => e.kind === kind);

/** Water for one day against the goal. The goal is a general default the person can change; it is never a requirement. */
export function hydrationOn(
  list: readonly WellnessEntry[],
  day: string,
  goalMl: number,
): { ml: number; goalMl: number; fraction: number; glasses: number } {
  const ml = entriesOf(list, 'hydration')
    .filter((e) => e.day === day)
    .reduce((s, e) => s + e.amount, 0);
  return {
    ml,
    goalMl,
    fraction: goalMl > 0 ? Math.min(1, ml / goalMl) : 0,
    glasses: Math.round(ml / 250),
  };
}

export interface SleepSummary {
  nights: number;
  averageHours: number | null;
  lastNight: { hours: number; quality: string | null } | null;
}
/** Sleep over the 7 days ending `day`. Reports what was logged, never a score; fewer than 3 nights gives no average. */
export function sleepSummary(list: readonly WellnessEntry[], day: string): SleepSummary {
  const from = addDay(day, -6);
  const nights = new Map<string, WellnessEntry>();
  for (const e of entriesOf(list, 'sleep')) if (e.day >= from && e.day <= day) nights.set(e.day, e);
  const rows = [...nights.values()].sort((a, b) => a.day.localeCompare(b.day));
  const last = rows[rows.length - 1];
  return {
    nights: rows.length,
    averageHours:
      rows.length >= 3
        ? Math.round((rows.reduce((s, e) => s + e.amount, 0) / rows.length) * 10) / 10
        : null,
    lastNight: last ? { hours: last.amount, quality: last.label } : null,
  };
}

export interface MovementTotals {
  walkMinutes: number;
  walkKm: number;
  strengthMinutes: number;
  walks: number;
  strengthSessions: number;
}
/** Walking and strength logged in [from, to] inclusive. Distance counts only where the person entered one. */
export function movementTotals(
  list: readonly WellnessEntry[],
  from: string,
  to: string,
): MovementTotals {
  const inR = (e: WellnessEntry) => e.day >= from && e.day <= to;
  const w = entriesOf(list, 'walk').filter(inR);
  const s = entriesOf(list, 'strength').filter(inR);
  return {
    walkMinutes: w.reduce((a, e) => a + e.amount, 0),
    walkKm: Math.round(w.reduce((a, e) => a + (e.amount2 ?? 0), 0) * 10) / 10,
    strengthMinutes: s.reduce((a, e) => a + e.amount, 0),
    walks: w.length,
    strengthSessions: s.length,
  };
}

/** Distinct days with any movement from dance sessions, walks or strength: the shared activity model. */
export function activeDaysAll(
  sessions: ReadonlyArray<{ status: string; completedAt: string | null }>,
  list: readonly WellnessEntry[],
  from: string,
  to: string,
  timeZone: string | null,
): string[] {
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedAt) continue;
    const k = localDateKey(s.completedAt, timeZone);
    if (k >= from && k <= to) days.add(k);
  }
  for (const e of list)
    if ((e.kind === 'walk' || e.kind === 'strength') && e.day >= from && e.day <= to)
      days.add(e.day);
  return [...days].sort();
}

/** Change between the first and latest entry for a body measurement site, in cm. Needs two entries; never a judgement. */
export function measurementChange(
  list: readonly WellnessEntry[],
  site: string,
): { latestCm: number; changeCm: number | null; count: number } | null {
  const rows = entriesOf(list, 'measurement')
    .filter((e) => e.label === site)
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  const last = rows[rows.length - 1];
  if (!last) return null;
  return {
    latestCm: last.amount,
    changeCm: rows.length >= 2 ? Math.round((last.amount - rows[0]!.amount) * 10) / 10 : null,
    count: rows.length,
  };
}

/** The wellness context for the Daily Fit Plan, from the person's preferences and logs. Pure; used by every store adapter. */
export function wellnessPlanContext(args: {
  prefs: WellnessPrefs;
  entries: readonly WellnessEntry[];
  day: string;
  weightKg: number | null;
}): NonNullable<DailyPlanInput['wellness']> {
  const goal = args.prefs.waterGoalMl ?? waterGuideMl(args.weightKg);
  const sleep = entriesOf(args.entries, 'sleep').find(
    (e) => e.day === args.day || e.day === addDay(args.day, -1),
  );
  return {
    intent: args.prefs.goalIntent,
    tracking: args.prefs.tracking,
    activities: args.prefs.activities,
    hydrationMl: hydrationOn(args.entries, args.day, goal).ml,
    waterGoalMl: goal,
    walkedToday: entriesOf(args.entries, 'walk').some((e) => e.day === args.day),
    sleepHours: sleep ? sleep.amount : null,
    walkMinutesToday: entriesOf(args.entries, 'walk')
      .filter((e) => e.day === args.day)
      .reduce((a, e) => a + e.amount, 0),
    strengthToday: entriesOf(args.entries, 'strength').some((e) => e.day === args.day),
    strengthSessionsWeek: movementTotals(args.entries, addDay(args.day, -6), args.day)
      .strengthSessions,
    recovery:
      (entriesOf(args.entries, 'recovery').find((e) => e.day === args.day)?.label as
        'fresh' | 'ok' | 'sore' | 'worn' | undefined) ?? null,
    hungerCheckinsToday: entriesOf(args.entries, 'hunger').filter((e) => e.day === args.day).length,
    eatingConcern: args.prefs.eatingConcern,
  };
}

/**
 * Validates a stored wellness row (from any backend) into an entry, or null when it is malformed or out of range. Used on the server, where
 * rows are not trusted to be well formed, so one bad row never breaks a context or leaks into it.
 */
export function wellnessEntryFromRow(row: unknown, today: string): WellnessEntry | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const amount = Number(r.amount);
  const amount2 = r.amount2 == null ? null : Number(r.amount2);
  const entry: WellnessEntry = {
    id: String(r.id ?? ''),
    kind: r.kind as WellnessKind,
    day: String(r.day ?? ''),
    amount,
    amount2,
    label: typeof r.label === 'string' ? r.label : null,
    createdAt: String(r.created_at ?? r.createdAt ?? ''),
  };
  return entryProblem(entry, today) === null ? entry : null;
}

/**
 * The wellness section of the coach context, from the person's own preferences and the last 7 days of logs. The SAME function builds it for the
 * on-device coach and the server coach, so privacy behaviour cannot drift. It carries only aggregates and levels: no free text, no ids, no
 * measurements, no exact weights. `numbersHidden` is true whenever the person said numbers are hard, is pregnant or postpartum, or turned tracking off.
 * Returns undefined when there is nothing to say (no logs and no saved preferences).
 */
export function coachWellnessContext(args: {
  prefs: WellnessPrefs | null;
  entries: readonly WellnessEntry[];
  today: string;
}): CoachContext['wellness'] | undefined {
  const from = addDay(args.today, -6);
  const entries = args.entries.filter((e) => e.day >= from && e.day <= args.today);
  if (entries.length === 0 && !args.prefs) return undefined;
  const prefs = args.prefs ?? DEFAULT_PREFS;
  const hidden = numbersHidden(prefs);
  const sleep = entriesOf(entries, 'sleep');
  const level = entriesOf(entries, 'recovery').find((e) => e.day === args.today)?.label;
  return {
    walkMinutesWeek: entriesOf(entries, 'walk').reduce((a, e) => a + e.amount, 0),
    strengthSessionsWeek: entriesOf(entries, 'strength').length,
    sleepNightsWeek: sleep.length,
    sleepAvgHours:
      sleep.length >= 3
        ? Math.round((sleep.reduce((a, e) => a + e.amount, 0) / sleep.length) * 10) / 10
        : null,
    recoveryToday:
      level === 'fresh' || level === 'ok' || level === 'sore' || level === 'worn' ? level : null,
    hungerCheckinsWeek: hidden ? 0 : entriesOf(entries, 'hunger').length,
    intent: prefs.goalIntent,
    numbersHidden: hidden,
  };
}

/** The context to use when a person's wellness data could not be read: share nothing numeric rather than risk showing numbers they asked not to see. */
export const WELLNESS_FAIL_CLOSED: NonNullable<CoachContext['wellness']> = {
  walkMinutesWeek: 0,
  strengthSessionsWeek: 0,
  sleepNightsWeek: 0,
  sleepAvgHours: null,
  recoveryToday: null,
  hungerCheckinsWeek: 0,
  intent: null,
  numbersHidden: true,
};
