import { goalProgress, type goalProgress as GP } from '@dancehall/shared';

type GoalLike = Parameters<typeof GP>[0];

/** Progress toward a goal, or null when there is no recorded weight. Missing data is never shown as zero progress. */
export function goalFraction(goal: GoalLike, latestKg: number | null | undefined): number | null {
  if (latestKg == null || !Number.isFinite(latestKg)) return null;
  const f = goalProgress(goal, latestKg).fraction;
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : null;
}
