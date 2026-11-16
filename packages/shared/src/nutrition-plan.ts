import { MIN_USER_AGE_YEARS } from './config';
import {
  PROVISIONAL_LIMITS,
  bmi,
  dailyCalorieGuidance,
  evaluateWeightGoal,
  type ActivityLevel,
  type Sex,
} from './safety';
import type { GoalIntent, TrackingStyle } from './wellness';

/**
 * Explainable nutrition targets. Method: Mifflin-St Jeor resting energy x a standard activity factor gives an ESTIMATED maintenance;
 * any deficit is capped at 20% of that and never goes below the person's own resting energy (see safety.ts). Protein range uses 0.8 to
 * 1.2 g/kg (0.8 g/kg is the adult recommended intake). All numbers are PROVISIONAL estimates, not reviewed by a dietitian or clinician,
 * and every result says so. When information is missing or the situation needs individual advice, NO numbers are produced.
 */
export type TargetMode = 'estimate' | 'general' | 'professional';
export interface NutritionTargets {
  mode: TargetMode;
  intent: GoalIntent;
  /**
   * `maintenance` is the estimated maintenance energy. `guide` is the goal-based daily estimate; it is null when the goal-based number is withheld for safety
   * (the maintenance estimate is still shown, with the reason). The whole object is null when no estimate can be given.
   */
  kcal: { guide: number | null; maintenance: number; floor: number; weeklyChangeKg: number } | null;
  proteinG: { low: number; high: number } | null;
  waterMl: number;
  /** Plain-language explanation of how each number was reached, or why there is none. */
  reasons: string[];
  /** How many days old the weight behind the estimate is (null when unknown or not used). The weight is never replaced or invented: it is only described honestly. */
  weightAgeDays: number | null;
  /** True when that weight is older than `STALE_WEIGHT_DAYS`. The estimate then says so and suggests updating it. */
  weightStale: boolean;
  /** Inputs that are needed for an estimate and are not available. The engine never invents them; the app tells the person what to add. */
  missing: MissingInput[];
  /** Always true: nothing here is professionally reviewed. */
  provisional: true;
  /** The person should talk to a qualified professional before using weight-loss numbers. */
  seeProfessional: boolean;
}

/** A recorded weight older than this is described as older, never as a current measurement. */
export const STALE_WEIGHT_DAYS = 60;

export type MissingInput = 'weight' | 'height' | 'age' | 'sex' | 'activity' | 'safety';

export interface TargetInput {
  intent: GoalIntent;
  tracking: TrackingStyle;
  weightKg: number | null;
  /** Age in days of the recorded weight, when known. Used only to describe the estimate honestly. */
  weightAgeDays?: number | null;
  heightCm: number | null;
  ageYears: number | null;
  sex: Sex | null;
  activity: ActivityLevel | null;
  /** Optional target weight for a loss or gain goal. */
  targetKg?: number | null;
  /**
   * The weekly change (kg, negative for loss) of the person's active weight goal, when they have one. It is re-checked against the same safety limits, so a stored
   * pace can only ever be lowered, never raised.
   */
  plannedWeeklyChangeKg?: number | null;
  pregnantOrPostpartum?: boolean;
  eatingConcern?: boolean;
  /** Readiness screening routed the person to gentler defaults. Loss numbers are then withheld, and so is a gain surplus. */
  readinessCautious?: boolean;
  /** The person has not answered the quick safety questions yet. A gain surplus waits for them (maintenance is still shown). */
  readinessUnknown?: boolean;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** A general daily water guide: about 30 ml per kg of body weight, within 1.5 to 3 L, or 2 L when weight is unknown. Needs vary; the person can change it. */
export function waterGuideMl(weightKg: number | null): number {
  if (!weightKg || weightKg <= 0) return 2000;
  return Math.min(3000, Math.max(1500, roundTo(weightKg * 30, 250)));
}

export function nutritionTargets(i: TargetInput): NutritionTargets {
  const base = { intent: i.intent, provisional: true as const, waterMl: waterGuideMl(i.weightKg) };
  let missing: MissingInput[] = [];
  const none = (
    mode: TargetMode,
    reasons: string[],
    seeProfessional = false,
  ): NutritionTargets => ({
    ...base,
    mode,
    kcal: null,
    proteinG: null,
    reasons,
    seeProfessional,
    missing,
    weightAgeDays: null,
    weightStale: false,
  });

  if (i.pregnantOrPostpartum)
    return none(
      'professional',
      [
        'Nutrition needs change during pregnancy and after birth, so we do not give calorie or weight-loss numbers. A midwife, doctor or dietitian can advise you.',
        'Gentle movement and water guidance are still available.',
      ],
      true,
    );
  if (i.eatingConcern)
    return none(
      'professional',
      [
        'You told us food can feel difficult. We will not show calorie or weight numbers. Support from a doctor or a dietitian who works with eating concerns can help.',
        'You can still use movement, sleep, water and habits.',
      ],
      true,
    );
  if (i.tracking === 'none')
    return none('general', [
      'You chose not to track numbers, so there are no calorie or weight targets. Balanced plates and regular movement are the focus.',
    ]);

  const { weightKg, heightCm, ageYears, sex, activity } = i;
  missing = [
    ...(weightKg ? [] : (['weight'] as const)),
    ...(heightCm ? [] : (['height'] as const)),
    ...(ageYears ? [] : (['age'] as const)),
    ...(sex ? [] : (['sex'] as const)),
    ...(activity ? [] : (['activity'] as const)),
  ];
  if (!weightKg || !heightCm || !ageYears || !sex || !activity)
    return none('general', [
      `To see an estimate we still need your ${missing.join(', ')}. We never guess these: add them in your profile (one entry is enough, you do not have to track them over time). Until then, a balanced plate and regular movement are a good default.`,
    ]);
  if (ageYears < MIN_USER_AGE_YEARS)
    return none('general', ['Locked In Fitness is for adults aged 18 and over.']);

  const reasons: string[] = [];
  let weekly = 0;
  let seeProfessional = false;
  /** Gain Weight only: the goal-based number is withheld (maintenance still shown). */
  let withholdGuide = false;
  let surplusCapApplied = false;
  if (i.intent === 'lose') {
    if (i.readinessCautious) {
      return none(
        'professional',
        [
          'Your answers suggest checking with a health professional before changing how you eat or move. We start with gentle, low-impact options and no deficit numbers.',
        ],
        true,
      );
    }
    const target = i.targetKg && i.targetKg > 0 ? i.targetKg : weightKg * (1 - 0.05);
    const ev = evaluateWeightGoal({
      ageYears,
      heightCm,
      currentKg: weightKg,
      targetKg: target,
      plannedWeeklyChangeKg: i.plannedWeeklyChangeKg ?? undefined,
    });
    if (ev.status === 'block') return none('professional', ev.reasons, true);
    weekly = ev.adjusted?.weeklyChangeKg ?? 0;
    reasons.push(...ev.reasons.filter((r) => !r.startsWith('Progress is not guaranteed')));
  } else if (i.intent === 'gain') {
    const L = PROVISIONAL_LIMITS;
    const target = i.targetKg && i.targetKg > weightKg ? i.targetKg : null;
    if (i.readinessCautious) {
      withholdGuide = true;
      seeProfessional = true;
      reasons.push(
        'Your answers suggest checking with a health professional before changing how you eat or move, so we show your estimated maintenance and no surplus for now.',
      );
    } else if (i.readinessUnknown) {
      withholdGuide = true;
      missing = ['safety'];
      reasons.push(
        'Finish the quick safety questions to see a gain estimate. Your estimated maintenance is shown for now.',
      );
    } else {
      const ev = evaluateWeightGoal({
        ageYears,
        heightCm,
        currentKg: weightKg,
        targetKg: target ?? weightKg + 0.01,
        plannedWeeklyChangeKg:
          i.plannedWeeklyChangeKg && i.plannedWeeklyChangeKg > 0
            ? i.plannedWeeklyChangeKg
            : weightKg * L.suggestedWeeklyGainFraction,
      });
      weekly = Math.max(0, ev.adjusted?.weeklyChangeKg ?? 0);
      reasons.push(
        'Gaining weight: a small daily surplus above your estimated maintenance, at a gentle pace, never more than 10% of maintenance. This ceiling is a conservative provisional choice. It is not clinically validated and has not been reviewed by a dietitian.',
      );
      // BMI never withholds guidance on its own. It only adds a note, because it cannot see muscle, frame size or body composition.
      if (
        bmi(weightKg, heightCm) >= L.bmiNoteForGain ||
        (target !== null && bmi(target, heightCm) >= L.bmiNoteForGain)
      ) {
        seeProfessional = true;
        reasons.push(
          'Body mass index (BMI) is only a rough screening number. It cannot see muscle, frame size or body composition, so it does not decide whether this estimate is right for you. Because the best amount and pace can differ from person to person, a doctor or registered dietitian can tailor it. The same 10% ceiling applies.',
        );
      }
    }
  } else if (i.intent === 'maintain') {
    reasons.push(
      'Maintaining: the estimate is your estimated maintenance energy, so there is no deficit.',
    );
  } else if (i.intent === 'strength') {
    reasons.push(
      'Building strength: the estimate is your estimated maintenance energy, so there is no deficit and no weight target. Eating enough, with protein spread through the day, supports training.',
    );
  } else {
    reasons.push(
      'Improving fitness: the estimate is your estimated maintenance energy to fuel your movement.',
    );
  }

  if (weekly > 0) {
    // The surplus ceiling: never more than 10% of the person's own estimated maintenance energy.
    const m = dailyCalorieGuidance({
      weightKg,
      heightCm,
      ageYears,
      sex,
      activity,
      weeklyChangeKg: 0,
    }).maintenanceKcal;
    const capWeekly = (m * PROVISIONAL_LIMITS.maxSurplusFraction * 7) / 7700;
    if (weekly > capWeekly) {
      weekly = capWeekly;
      surplusCapApplied = true;
    }
  }
  const g = dailyCalorieGuidance({
    weightKg,
    heightCm,
    ageYears,
    sex,
    activity,
    weeklyChangeKg: weekly,
  });
  let guide: number | null = g.targetKcal;
  if (weekly > 0)
    guide = Math.min(
      guide,
      Math.floor(g.maintenanceKcal * (1 + PROVISIONAL_LIMITS.maxSurplusFraction)),
    );
  if (withholdGuide) guide = null;
  if (g.deficitCapApplied)
    reasons.push(
      `The daily deficit is capped at ${Math.round(PROVISIONAL_LIMITS.maxDeficitFraction * 100)}% of your estimated maintenance.`,
    );
  if (g.floorApplied)
    reasons.push('The guide is never set below your own estimated resting energy.');
  if (surplusCapApplied)
    reasons.push(
      `The daily surplus is capped at ${Math.round(PROVISIONAL_LIMITS.maxSurplusFraction * 100)}% of your estimated maintenance.`,
    );
  if (bmi(weightKg, heightCm) < 18.5 && i.intent === 'lose') seeProfessional = true;
  const age =
    typeof i.weightAgeDays === 'number' && i.weightAgeDays >= 0
      ? Math.floor(i.weightAgeDays)
      : null;
  const stale = age !== null && age > STALE_WEIGHT_DAYS;
  if (stale)
    reasons.push(
      `This estimate uses the weight you recorded about ${age} days ago. It is not a current measurement, so it may be off if your weight has changed. Update your weight whenever you like to refresh it.`,
    );
  reasons.push(
    `Method: Mifflin-St Jeor resting energy (${g.floorKcal} kcal) times an activity factor gives about ${g.maintenanceKcal} kcal to maintain. This is an estimate, not a target you must hit.`,
    'Your usual activity level already includes your regular exercise, so we do not add workout calories on top of this estimate.',
  );
  return {
    ...base,
    mode: 'estimate',
    kcal: {
      guide,
      maintenance: g.maintenanceKcal,
      floor: g.floorKcal,
      weeklyChangeKg: guide === null ? 0 : Math.round(weekly * 100) / 100,
    },
    proteinG: { low: Math.round(weightKg * 0.8), high: Math.round(weightKg * 1.2) },
    reasons,
    seeProfessional,
    missing,
    weightAgeDays: age,
    weightStale: stale,
  };
}
