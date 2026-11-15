/**
 * Safety-rule architecture.
 *
 * Rules live in code, not in prompt wording, so they apply identically to the app, the AI gateway and
 * the admin tools, and so they can be unit-tested. EVERY numeric threshold below is PROVISIONAL: it is an
 * engineering placeholder that must be reviewed and replaced by a registered dietitian / qualified
 * clinician before any public release. Nothing here is medical advice or a clinical approval.
 */
import { MIN_USER_AGE_YEARS } from './config';

export const SAFETY_RULES_STATUS = {
  reviewedByProfessional: false,
  note: 'Provisional engineering defaults. Not reviewed by a registered dietitian or clinician.',
} as const;

export const PROVISIONAL_LIMITS = {
  /** Lowest target BMI the app will help someone work toward. */
  minTargetBmi: 18.5,
  /** Hard cap on planned weekly loss, as a fraction of current body weight. */
  maxWeeklyLossFraction: 0.01,
  /** Gentler default shown as the suggested pace. */
  suggestedWeeklyLossFraction: 0.005,
  /** Cap on planned weekly gain, as a fraction of body weight. */
  maxWeeklyGainFraction: 0.005,
  /** Planned daily deficit never exceeds this fraction of estimated maintenance energy. */
  maxDeficitFraction: 0.2,
  /**
   * Gain Weight: the planned daily surplus never exceeds this fraction of estimated maintenance energy. A conservative PROVISIONAL ceiling chosen by the product owner:
   * it is not clinically validated and has not been reviewed by a registered dietitian or clinician.
   */
  maxSurplusFraction: 0.1,
  /** Gentle default pace when a person chooses Gain Weight without a target: a quarter of a percent of body weight per week (half the hard cap). */
  suggestedWeeklyGainFraction: 0.0025,
  /**
   * Gain Weight: at or above this BMI (for the person or for their target) the estimate still appears, with the same surplus ceiling, but it carries a plain note and a
   * suggestion to ask a professional. BMI is a rough screening number that cannot see muscle, frame size or body composition, so it NEVER decides on its own whether
   * someone gets calorie guidance. Not a clinical threshold.
   */
  bmiNoteForGain: 25,
} as const;

export type SafetyStatus = 'allow' | 'adjust' | 'block';
export interface SafetyDecision<T = undefined> {
  status: SafetyStatus;
  /** Plain-language, non-judgmental reasons that can be shown to the user. */
  reasons: string[];
  adjusted?: T;
}

export const bmi = (weightKg: number, heightCm: number): number => weightKg / (heightCm / 100) ** 2;

export interface WeightGoalInput {
  ageYears: number;
  heightCm: number;
  currentKg: number;
  targetKg: number;
  /** Planned change per week in kg (negative = loss). Optional; the app proposes a gentle default. */
  plannedWeeklyChangeKg?: number;
}

export interface WeightGoalAdjusted {
  weeklyChangeKg: number;
}

export function evaluateWeightGoal(input: WeightGoalInput): SafetyDecision<WeightGoalAdjusted> {
  const { ageYears, heightCm, currentKg, targetKg } = input;
  if (![ageYears, heightCm, currentKg, targetKg].every((n) => Number.isFinite(n) && n > 0)) {
    return {
      status: 'block',
      reasons: ['We need valid age, height and weight to suggest a goal.'],
    };
  }
  if (ageYears < MIN_USER_AGE_YEARS) {
    return { status: 'block', reasons: ['Weight goals are available to adults aged 18 and over.'] };
  }
  const L = PROVISIONAL_LIMITS;
  const losing = targetKg < currentKg;
  if (losing && bmi(currentKg, heightCm) < L.minTargetBmi) {
    return {
      status: 'block',
      reasons: [
        'Based on what you entered, a weight-loss goal is not a good fit right now. Talking with a health professional can help.',
      ],
    };
  }
  if (losing && bmi(targetKg, heightCm) < L.minTargetBmi) {
    return {
      status: 'block',
      reasons: ['That target is below a healthy range for your height. Try a higher target.'],
    };
  }
  const planned =
    input.plannedWeeklyChangeKg ??
    (losing
      ? -currentKg * L.suggestedWeeklyLossFraction
      : targetKg > currentKg
        ? currentKg * L.maxWeeklyGainFraction
        : 0);
  const reasons: string[] = [];
  let weekly = planned;
  if (planned < 0 && -planned > currentKg * L.maxWeeklyLossFraction) {
    weekly = -currentKg * L.maxWeeklyLossFraction;
    reasons.push('We lowered the pace to keep it steady and sustainable.');
  }
  if (planned > 0 && planned > currentKg * L.maxWeeklyGainFraction) {
    weekly = currentKg * L.maxWeeklyGainFraction;
    reasons.push('We lowered the pace to keep it steady and sustainable.');
  }
  // A change in the wrong direction for the stated target is corrected, not silently accepted.
  if ((losing && weekly > 0) || (!losing && targetKg > currentKg && weekly < 0)) {
    weekly = 0;
    reasons.push('The pace did not match your target, so we reset it. You can adjust it any time.');
  }
  reasons.push('Progress is not guaranteed and can vary from week to week.');
  const changed = weekly !== planned;
  return { status: changed ? 'adjust' : 'allow', reasons, adjusted: { weeklyChangeKg: weekly } };
}

export type Sex = 'female' | 'male' | 'unspecified';
export type ActivityLevel = 'low' | 'light' | 'moderate' | 'high';
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  low: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

/** Mifflin-St Jeor resting energy estimate (kcal/day). For `unspecified`, the midpoint of the two constants. */
export function estimateBmrKcal(a: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
}): number {
  const base = 10 * a.weightKg + 6.25 * a.heightCm - 5 * a.ageYears;
  const offset = a.sex === 'male' ? 5 : a.sex === 'female' ? -161 : -78;
  return base + offset;
}

export interface CalorieGuidance {
  maintenanceKcal: number;
  targetKcal: number;
  floorKcal: number;
  floorApplied: boolean;
  deficitCapApplied: boolean;
  reviewRequired: true;
}

/**
 * Individualized daily energy guidance. There is deliberately no single universal calorie floor: the floor is
 * the person's own estimated resting energy, and the deficit is capped relative to their own maintenance.
 */
export function dailyCalorieGuidance(args: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activity: ActivityLevel;
  weeklyChangeKg: number;
}): CalorieGuidance {
  const bmr = estimateBmrKcal(args);
  const maintenance = bmr * ACTIVITY_FACTOR[args.activity];
  const rawDelta = (args.weeklyChangeKg * 7700) / 7;
  const maxDeficit = maintenance * PROVISIONAL_LIMITS.maxDeficitFraction;
  let delta = rawDelta;
  let deficitCapApplied = false;
  if (-delta > maxDeficit) {
    delta = -maxDeficit;
    deficitCapApplied = true;
  }
  let target = maintenance + delta;
  let floorApplied = false;
  if (target < bmr) {
    target = bmr;
    floorApplied = true;
  }
  return {
    maintenanceKcal: Math.round(maintenance),
    targetKcal: Math.round(target),
    floorKcal: Math.round(bmr),
    floorApplied,
    deficitCapApplied,
    reviewRequired: true,
  };
}

export const READINESS_QUESTIONS = [
  'heart_condition_or_advice_to_limit_activity',
  'chest_pain_during_activity',
  'dizziness_or_loss_of_balance',
  'bone_or_joint_problem_made_worse_by_activity',
  'taking_medication_for_blood_pressure_or_heart',
  'pregnant_or_recently_gave_birth',
  'other_reason_to_be_careful',
] as const;
export type ReadinessQuestion = (typeof READINESS_QUESTIONS)[number];

export type ReadinessOutcome = 'clear' | 'low_impact_and_check_with_professional';
export interface ReadinessResult {
  outcome: ReadinessOutcome;
  flagged: ReadinessQuestion[];
  /** When true, the app starts the person on low-impact options and recommends speaking to a professional first. */
  defaultToLowImpact: boolean;
}

/** PAR-Q-style screening. A "yes" never diagnoses anything; it only routes to gentler defaults and a suggestion. */
export function evaluateReadiness(
  answers: Readonly<Partial<Record<ReadinessQuestion, boolean>>>,
): ReadinessResult {
  const unanswered = READINESS_QUESTIONS.filter((q) => answers[q] === undefined);
  const flagged = READINESS_QUESTIONS.filter((q) => answers[q] === true);
  // Unanswered questions are treated cautiously.
  const cautious = flagged.length > 0 || unanswered.length > 0;
  return {
    outcome: cautious ? 'low_impact_and_check_with_professional' : 'clear',
    flagged,
    defaultToLowImpact: cautious,
  };
}

export type RiskSignalCategory = 'self_harm' | 'disordered_eating';

const RISK_PATTERNS: ReadonlyArray<{ category: RiskSignalCategory; re: RegExp }> = [
  { category: 'self_harm', re: /\b(kill myself|end my life|want to die|hurt myself|suicid)/i },
  {
    category: 'disordered_eating',
    re: /\b(starv(e|ing) myself|purg(e|ing)|make myself (throw up|vomit)|haven'?t eaten (in|for) (days|\d+ days)|eat nothing|laxatives to lose)/i,
  },
];

/**
 * Minimal first-line screen for the Fit Concierge input. This keyword check is deliberately simple and
 * incomplete; it is a floor, not the design. The production approach (model-based classification, reviewed
 * support resources per country, human escalation) is a Phase 1+ gate recorded in docs/NUTRITION_SAFETY.md.
 */
export function screenMessageForRiskSignals(text: string): RiskSignalCategory | null {
  for (const p of RISK_PATTERNS) if (p.re.test(text)) return p.category;
  return null;
}
