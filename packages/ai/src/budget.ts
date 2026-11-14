import { DEFAULT_AI_MONTHLY_BUDGET_USD } from '@dancehall/shared';

/**
 * Application-side monthly AI budget.
 *
 * IMPORTANT LIMIT: this is an application control, not a guarantee of an absolute provider bill. Concurrent
 * requests, retries, delayed provider-side billing and usage we fail to record can all push real spend above the
 * configured ceiling. It must be paired with the provider's own spend limit and alerts (see docs/AI_COST_CONTROLS.md).
 * To reduce the overshoot, the gateway reserves a worst-case cost BEFORE each call and settles the true cost after.
 */
export const ALERT_THRESHOLDS = [0.5, 0.8, 0.9, 1.0] as const;

export interface BudgetState {
  ceilingUsd: number;
  settledUsd: number;
  reservedUsd: number;
}

export const newBudget = (ceilingUsd: number = DEFAULT_AI_MONTHLY_BUDGET_USD): BudgetState => ({
  ceilingUsd,
  settledUsd: 0,
  reservedUsd: 0,
});

export const committedUsd = (b: BudgetState): number => b.settledUsd + b.reservedUsd;

export type ReserveResult =
  { ok: true; budget: BudgetState } | { ok: false; reason: 'budget_exhausted' };

/** Rejects when the worst case would cross the ceiling. Reserved money counts, so concurrent calls cannot all slip through. */
export function reserve(b: BudgetState, worstCaseUsd: number): ReserveResult {
  if (!(worstCaseUsd >= 0) || committedUsd(b) + worstCaseUsd > b.ceilingUsd) {
    return { ok: false, reason: 'budget_exhausted' };
  }
  return { ok: true, budget: { ...b, reservedUsd: b.reservedUsd + worstCaseUsd } };
}

/** Replaces a reservation with the actual cost. A failed call settles at 0 (or its billed cost if the provider billed). */
export function settle(b: BudgetState, reservedUsd: number, actualUsd: number): BudgetState {
  return {
    ...b,
    reservedUsd: Math.max(0, b.reservedUsd - reservedUsd),
    settledUsd: b.settledUsd + actualUsd,
  };
}

/** Alert thresholds newly crossed when spend moves from `beforeUsd` to `afterUsd`. */
export function crossedThresholds(
  ceilingUsd: number,
  beforeUsd: number,
  afterUsd: number,
): number[] {
  return ALERT_THRESHOLDS.filter((t) => beforeUsd < ceilingUsd * t && afterUsd >= ceilingUsd * t);
}
