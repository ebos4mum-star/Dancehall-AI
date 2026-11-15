import { ageYearsOn } from './schemas';
import { nutritionTargets, type NutritionTargets, type TargetInput } from './nutrition-plan';
import type { ActivityLevel, Sex } from './safety';
import { numbersHidden, type GoalIntent, type WellnessPrefs } from './wellness';

/**
 * The ONE entry point for daily calorie needs. Goals, Food, Today, meal planning and the coach all read their numbers from here, so they cannot disagree and every
 * safety rule applies everywhere. It is a thin, pure wrapper over `nutritionTargets` (the canonical calculation): it only decides WHICH goal applies and which
 * safety facts to pass, then hides the numbers when the person's numbers are hidden.
 *
 * PROVISIONAL: the estimates, the loss limits and the Gain Weight surplus ceiling (10% of estimated maintenance) are engineering defaults. No registered dietitian or
 * clinician has reviewed them and they are not clinically validated.
 */
export type ReadinessKind = 'clear' | 'cautious' | 'unknown';
/** Maps a stored readiness screening outcome to the engine's state. No screening on record is `unknown`, which the engine treats cautiously. */
export const readinessState = (
  outcome: 'clear' | 'low_impact_and_check_with_professional' | null | undefined,
): ReadinessKind =>
  outcome === 'clear'
    ? 'clear'
    : outcome === 'low_impact_and_check_with_professional'
      ? 'cautious'
      : 'unknown';

/** The person's active weight goal (a stored goal row), if they have one. Only its type, target and planned pace matter here. */
export interface ActiveWeightGoal {
  type: 'lose' | 'maintain' | 'gain';
  targetKg: number | null;
  plannedWeeklyChangeKg: number | null;
}

export interface CalorieNeedsInput {
  prefs: Pick<WellnessPrefs, 'goalIntent' | 'tracking' | 'pregnantOrPostpartum' | 'eatingConcern'> &
    Partial<Pick<WellnessPrefs, 'goalChosen'>>;
  readiness: ReadinessKind;
  /** Facts the person gave. Any missing fact is reported in `missing`, never guessed. A single recorded weight is enough: repeated weigh-ins are not required. */
  body?: Pick<
    TargetInput,
    'weightKg' | 'heightCm' | 'ageYears' | 'sex' | 'activity' | 'targetKg'
  > | null;
  activeGoal?: ActiveWeightGoal | null;
}

/**
 * The goal the numbers follow. The person's chosen goal wins. The one exception keeps older accounts working: onboarding used to store a Gain Weight choice as the
 * default `fitness` intent next to a stored `gain` weight goal, and a stored `lose` goal could sit next to the default intent. When the chosen goal is still the default
 * `fitness`, the person never picked a goal themselves (`goalChosen` is false) and a stored weight goal exists, that weight goal decides the calorie estimate. Nothing is rewritten: the stored intent and goal are untouched.
 */
export function effectiveGoalIntent(
  chosen: GoalIntent,
  activeGoal: ActiveWeightGoal | null | undefined,
  goalChosen = false,
): GoalIntent {
  if (chosen === 'fitness' && activeGoal && !goalChosen)
    return activeGoal.type === 'maintain' ? 'maintain' : activeGoal.type;
  return chosen;
}

export function calorieNeeds(input: CalorieNeedsInput): NutritionTargets {
  const { prefs, readiness } = input;
  const intent = effectiveGoalIntent(prefs.goalIntent, input.activeGoal, prefs.goalChosen === true);
  // A stored goal only informs the estimate when it points the same way as the goal in use: a stored gain goal never sets a loss pace, and the reverse.
  const goalRows = input.activeGoal && input.activeGoal.type === intent ? input.activeGoal : null;
  const target: TargetInput = {
    intent,
    tracking: prefs.tracking,
    weightKg: input.body?.weightKg ?? null,
    heightCm: input.body?.heightCm ?? null,
    ageYears: input.body?.ageYears ?? null,
    sex: input.body?.sex ?? null,
    activity: input.body?.activity ?? null,
    targetKg: goalRows?.targetKg ?? input.body?.targetKg ?? null,
    plannedWeeklyChangeKg: goalRows?.plannedWeeklyChangeKg ?? null,
    pregnantOrPostpartum: prefs.pregnantOrPostpartum,
    eatingConcern: prefs.eatingConcern,
  };
  let out: NutritionTargets;
  if (readiness === 'unknown' && intent === 'lose') {
    // No answers is not a finding: do not say the person's answers suggest anything, and do not flag professional support. Just withhold the estimate.
    out = {
      ...nutritionTargets({ ...target, tracking: 'none' }),
      reasons: ['Finish the quick safety questions to see an estimate.'],
      seeProfessional: false,
    };
  } else {
    out = nutritionTargets({
      ...target,
      readinessCautious: readiness === 'cautious',
      readinessUnknown: readiness === 'unknown',
    });
  }
  return numbersHidden(prefs) ? { ...out, kcal: null, proteinG: null } : out;
}

/** A stored weight goal row, as far as the calorie engine cares. */
export interface StoredWeightGoal {
  type: 'lose' | 'maintain' | 'gain';
  status: string;
  endDate: string;
  targetKg: number;
  plannedWeeklyChangeKg: number;
}

/** The active weight goal that ends soonest (the one the person is working on now), or null. Stored goals are never changed or removed by this. */
export function pickActiveWeightGoal(goals: readonly StoredWeightGoal[]): ActiveWeightGoal | null {
  const g = [...goals]
    .filter((x) => x.status === 'active')
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  return g
    ? { type: g.type, targetKg: g.targetKg, plannedWeeklyChangeKg: g.plannedWeeklyChangeKg }
    : null;
}

/**
 * Every screen builds its calorie estimate from the same stored records through this one function (Goals, Food, Today, meal planning, coach). It uses the LATEST recorded
 * weight, however old: the person is never made to weigh in again just to see an estimate, and weight tracking is not switched on by it.
 */
export function calorieNeedsFromRecords(a: {
  prefs: CalorieNeedsInput['prefs'];
  /** The stored quick-safety-questions outcome, or null when never answered. */
  readinessOutcome: 'clear' | 'low_impact_and_check_with_professional' | null | undefined;
  priv: { birthDate: string; heightCm: number; sex: Sex; activityLevel: ActivityLevel } | null;
  latestWeightKg: number | null;
  goals: readonly StoredWeightGoal[];
  now: Date;
}): NutritionTargets {
  return calorieNeeds({
    prefs: a.prefs,
    readiness: readinessState(a.readinessOutcome),
    body: {
      weightKg: a.latestWeightKg,
      heightCm: a.priv?.heightCm ?? null,
      ageYears: a.priv ? ageYearsOn(a.priv.birthDate, a.now) : null,
      sex: a.priv?.sex ?? null,
      activity: a.priv?.activityLevel ?? null,
    },
    activeGoal: pickActiveWeightGoal(a.goals),
  });
}
