export interface WeightPoint {
  weightKg: number;
  /** ISO timestamp */
  measuredAt: string;
}

const DAY = 86_400_000;
const t = (p: WeightPoint) => new Date(p.measuredAt).getTime();
export const sortByTime = (e: readonly WeightPoint[]): WeightPoint[] =>
  [...e].sort((a, b) => t(a) - t(b));

export interface WeightSummary {
  latest: WeightPoint | null;
  /** Mean of entries in the 7 days up to the latest entry. */
  sevenDayAverageKg: number | null;
  /** latest minus the earliest entry within the window (null when there is no earlier entry in it). */
  change7dKg: number | null;
  change30dKg: number | null;
  /** Linear trend over the last 28 days, kg per week; needs 3+ entries spanning a week. Always an approximation. */
  weeklyRateKg: number | null;
  count: number;
}

function changeOver(sorted: WeightPoint[], days: number): number | null {
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const from = t(latest) - days * DAY;
  const ref = sorted.find((p) => t(p) >= from && p !== latest);
  return ref ? Math.round((latest.weightKg - ref.weightKg) * 100) / 100 : null;
}

export function summarizeWeights(entries: readonly WeightPoint[]): WeightSummary {
  const sorted = sortByTime(entries);
  const latest = sorted[sorted.length - 1] ?? null;
  if (!latest)
    return {
      latest: null,
      sevenDayAverageKg: null,
      change7dKg: null,
      change30dKg: null,
      weeklyRateKg: null,
      count: 0,
    };
  const last7 = sorted.filter((p) => t(p) > t(latest) - 7 * DAY);
  const avg = last7.reduce((s, p) => s + p.weightKg, 0) / last7.length;
  const window = sorted.filter((p) => t(p) >= t(latest) - 28 * DAY);
  let rate: number | null = null;
  const first = window[0];
  if (first && window.length >= 3 && t(latest) - t(first) >= 7 * DAY) {
    const xs = window.map((p) => (t(p) - t(first)) / (7 * DAY));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = window.reduce((s, p) => s + p.weightKg, 0) / window.length;
    const num = xs.reduce((s, x, i) => s + (x - mx) * ((window[i]?.weightKg ?? 0) - my), 0);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    rate = den === 0 ? null : Math.round((num / den) * 100) / 100;
  }
  return {
    latest,
    sevenDayAverageKg: Math.round(avg * 100) / 100,
    change7dKg: changeOver(sorted, 7),
    change30dKg: changeOver(sorted, 30),
    weeklyRateKg: rate,
    count: sorted.length,
  };
}

/** Days with at least one entry in the last `days` days (a gentle consistency signal, not a streak penalty). */
export function loggedDays(entries: readonly WeightPoint[], now: Date, days: number): number {
  const set = new Set<string>();
  for (const p of entries)
    if (t(p) > now.getTime() - days * DAY && t(p) <= now.getTime() + DAY)
      set.add(p.measuredAt.slice(0, 10));
  return set.size;
}
