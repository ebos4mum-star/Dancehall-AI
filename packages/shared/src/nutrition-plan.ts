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
  kcal: { guide: number; maintenance: number; floor: number; weeklyChangeKg: number } | null;
  proteinG: { low: number; high: number } | null;
  waterMl: number;
  /** Plain-language explanation of how each number was reached, or why there is none. */
  reasons: string[];
  /** Always true: nothing here is professionally reviewed. */
  provisional: true;
  /** The person should talk to a qualified professional before using weight-loss numbers. */
  seeProfessional: boolean;
}

export interface TargetInput {
  intent: GoalIntent;
  tracking: TrackingStyle;
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  sex: Sex | null;
  activity: ActivityLevel | null;
  /** Optional target weight for a loss goal. */
  targetKg?: number | null;
  pregnantOrPostpartum?: boolean;
  eatingConcern?: boolean;
  /** Readiness screening routed the person to gentler defaults. Calorie numbers are then withheld for loss. */
  readinessCautious?: boolean;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** A general daily water guide: about 30 ml per kg of body weight, within 1.5 to 3 L, or 2 L when weight is unknown. Needs vary; the person can change it. */
export function waterGuideMl(weightKg: number | null): number {
  if (!weightKg || weightKg <= 0) return 2000;
  return Math.min(3000, Math.max(1500, roundTo(weightKg * 30, 250)));
}

export function nutritionTargets(i: TargetInput): NutritionTargets {
  const base = { intent: i.intent, provisional: true as const, waterMl: waterGuideMl(i.weightKg) };
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
  if (!weightKg || !heightCm || !ageYears || !sex || !activity)
    return none('general', [
      'Add your weight, height, age and usual activity to see an estimate. Until then, a balanced plate and regular movement are a good default.',
    ]);
  if (ageYears < MIN_USER_AGE_YEARS)
    return none('general', ['DanceHall Fit is for adults aged 18 and over.']);

  const reasons: string[] = [];
  let weekly = 0;
  let seeProfessional = false;
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
    const ev = evaluateWeightGoal({ ageYears, heightCm, currentKg: weightKg, targetKg: target });
    if (ev.status === 'block') return none('professional', ev.reasons, true);
    weekly = ev.adjusted?.weeklyChangeKg ?? 0;
    reasons.push(...ev.reasons.filter((r) => !r.startsWith('Progress is not guaranteed')));
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

  const g = dailyCalorieGuidance({
    weightKg,
    heightCm,
    ageYears,
    sex,
    activity,
    weeklyChangeKg: weekly,
  });
  if (g.deficitCapApplied)
    reasons.push(
      `The daily deficit is capped at ${Math.round(PROVISIONAL_LIMITS.maxDeficitFraction * 100)}% of your estimated maintenance.`,
    );
  if (g.floorApplied)
    reasons.push('The guide is never set below your own estimated resting energy.');
  if (bmi(weightKg, heightCm) < 18.5 && i.intent === 'lose') seeProfessional = true;
  reasons.push(
    `Method: Mifflin-St Jeor resting energy (${g.floorKcal} kcal) times an activity factor gives about ${g.maintenanceKcal} kcal to maintain. This is an estimate, not a target you must hit.`,
  );
  return {
    ...base,
    mode: 'estimate',
    kcal: {
      guide: g.targetKcal,
      maintenance: g.maintenanceKcal,
      floor: g.floorKcal,
      weeklyChangeKg: Math.round(weekly * 100) / 100,
    },
    proteinG: { low: Math.round(weightKg * 0.8), high: Math.round(weightKg * 1.2) },
    reasons,
    seeProfessional,
  };
}
