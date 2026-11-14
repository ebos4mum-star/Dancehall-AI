import { MIN_USER_AGE_YEARS } from './config';
import { PROVISIONAL_LIMITS, evaluateWeightGoal, type SafetyStatus } from './safety';

export const GOAL_TYPES = ['lose', 'maintain', 'gain'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_PERIODS = ['weekly', 'monthly', 'yearly'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);

/** End date for a goal period. Mirrors the database: weekly = +7 days; monthly/yearly = calendar month/year, clamped to month end. */
export function goalEndDate(startDate: string, period: GoalPeriod): string {
  const s = parseIso(startDate);
  if (period === 'weekly') return toIso(new Date(s.getTime() + 7 * 86_400_000));
  const months = period === 'monthly' ? 1 : 12;
  const y = s.getUTCFullYear() + Math.floor((s.getUTCMonth() + months) / 12);
  const m = (s.getUTCMonth() + months) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m, Math.min(s.getUTCDate(), lastDay))));
}

export const goalWeeks = (startDate: string, endDate: string): number =>
  (parseIso(endDate).getTime() - parseIso(startDate).getTime()) / (7 * 86_400_000);

export interface GoalProposalInput {
  type: GoalType;
  period: GoalPeriod;
  startDate: string;
  startKg: number;
  /** Optional for loss/gain: when omitted a gentle default pace is proposed. Ignored for maintenance. */
  targetKg?: number;
  heightCm: number;
  ageYears: number;
}
export interface GoalProposal {
  status: SafetyStatus;
  reasons: string[];
  goal?: {
    type: GoalType;
    period: GoalPeriod;
    startDate: string;
    endDate: string;
    startKg: number;
    targetKg: number;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns what the person asked for into a goal that satisfies the safety rules. Unsafe paces are adjusted with an
 * explanation; unsafe or invalid requests are blocked. The database re-checks the same hard limits.
 */
export function proposeGoal(input: GoalProposalInput): GoalProposal {
  const { type, period, startDate, startKg, heightCm, ageYears } = input;
  const endDate = goalEndDate(startDate, period);
  const weeks = goalWeeks(startDate, endDate);
  const make = (targetKg: number): GoalProposal['goal'] => ({
    type,
    period,
    startDate,
    endDate,
    startKg,
    targetKg,
  });

  if (type === 'maintain') {
    const base = evaluateWeightGoal({
      ageYears,
      heightCm,
      currentKg: startKg,
      targetKg: startKg,
      plannedWeeklyChangeKg: 0,
    });
    if (base.status === 'block') return { status: 'block', reasons: base.reasons };
    return { status: 'allow', reasons: ['Maintaining is a great goal.'], goal: make(startKg) };
  }

  let target = input.targetKg;
  if (target !== undefined && (type === 'lose' ? target >= startKg : target <= startKg)) {
    return {
      status: 'block',
      reasons: [
        type === 'lose'
          ? 'A loss goal needs a target below your current weight.'
          : 'A gain goal needs a target above your current weight.',
      ],
    };
  }
  const planned = target === undefined ? undefined : (target - startKg) / weeks;
  const decision = evaluateWeightGoal({
    ageYears,
    heightCm,
    currentKg: startKg,
    targetKg: target ?? (type === 'lose' ? startKg - 0.01 : startKg + 0.01),
    plannedWeeklyChangeKg: planned,
  });
  if (decision.status === 'block') return { status: 'block', reasons: decision.reasons };

  const weekly = decision.adjusted?.weeklyChangeKg ?? 0;
  if (target === undefined || decision.status === 'adjust') {
    // A small margin keeps the stored (rounded) pace inside the database's hard cap.
    const raw = startKg + weekly * weeks * 0.995;
    target = type === 'lose' ? Math.ceil(raw * 100) / 100 : Math.floor(raw * 100) / 100;
  }
  // Re-check the final rounded target (it can change BMI by a hair).
  const final = evaluateWeightGoal({
    ageYears,
    heightCm,
    currentKg: startKg,
    targetKg: target,
    plannedWeeklyChangeKg: (target - startKg) / weeks,
  });
  if (final.status === 'block') return { status: 'block', reasons: final.reasons };
  const reasons = [
    ...new Set([
      ...decision.reasons,
      ...(input.targetKg === undefined ? ['We suggested a gentle pace.'] : []),
    ]),
  ];
  return {
    status: decision.status === 'adjust' ? 'adjust' : 'allow',
    reasons,
    goal: make(r2(target)),
  };
}

/** 0..1 progress from start toward target. Maintenance counts as met while within the tolerance of the target. */
export const MAINTAIN_TOLERANCE_KG = 1;
export function goalProgress(
  g: { type: GoalType; startKg: number; targetKg: number },
  currentKg: number,
): { fraction: number; onTrack: boolean } {
  if (g.type === 'maintain') {
    const within = Math.abs(currentKg - g.targetKg) <= MAINTAIN_TOLERANCE_KG;
    return { fraction: within ? 1 : 0, onTrack: within };
  }
  const span = g.targetKg - g.startKg;
  if (span === 0) return { fraction: 1, onTrack: true };
  const raw = (currentKg - g.startKg) / span;
  return { fraction: Math.min(1, Math.max(0, raw)), onTrack: raw >= 0 };
}

/**
 * Exact mirror of the database trigger `app.validate_goal` (same checks, same error codes). The offline mock store uses it, and
 * a test compares it with the real trigger. Returns an error code, or null when the goal is acceptable.
 */
export function hardCheckGoal(
  g: {
    type: GoalType;
    period: GoalPeriod;
    startDate: string;
    endDate: string;
    startKg: number;
    targetKg: number;
  },
  who: { heightCm: number; ageYears: number },
): string | null {
  if (who.ageYears < MIN_USER_AGE_YEARS) return 'adults_only';
  const days = Math.round(goalWeeks(g.startDate, g.endDate) * 7);
  if (
    (g.period === 'weekly' && days !== 7) ||
    (g.period === 'monthly' && (days < 28 || days > 31)) ||
    (g.period === 'yearly' && (days < 365 || days > 366))
  ) {
    return 'goal_period_mismatch';
  }
  const weeks = days / 7;
  const planned = Math.round(((g.targetKg - g.startKg) / weeks) * 1000) / 1000;
  if (g.type === 'maintain' && g.targetKg !== g.startKg) return 'goal_direction_mismatch';
  if (g.type === 'lose' && g.targetKg >= g.startKg) return 'goal_direction_mismatch';
  if (g.type === 'gain' && g.targetKg <= g.startKg) return 'goal_direction_mismatch';
  const bmi = (kg: number) => kg / (who.heightCm / 100) ** 2;
  if (g.type === 'lose') {
    if (bmi(g.startKg) < PROVISIONAL_LIMITS.minTargetBmi) return 'goal_unsafe_underweight';
    if (bmi(g.targetKg) < PROVISIONAL_LIMITS.minTargetBmi) return 'goal_target_below_healthy_range';
    if (-planned > g.startKg * PROVISIONAL_LIMITS.maxWeeklyLossFraction)
      return 'goal_pace_too_fast';
  } else if (g.type === 'gain' && planned > g.startKg * PROVISIONAL_LIMITS.maxWeeklyGainFraction) {
    return 'goal_pace_too_fast';
  }
  return null;
}
