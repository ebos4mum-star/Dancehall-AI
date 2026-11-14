import type { WeightPoint } from '@dancehall/shared';

export interface ChartGeometry {
  path: string;
  dots: Array<{ x: number; y: number }>;
  targetY: number | null;
  yMin: number;
  yMax: number;
}

/**
 * Maps weight entries to SVG coordinates. The y-axis is padded and never starts at zero, so small changes are visible, and an
 * optional goal target is drawn as a reference line (it is included in the range so it is always on screen).
 */
export function chartGeometry(
  points: readonly WeightPoint[],
  width: number,
  height: number,
  pad = 16,
  targetKg?: number | null,
): ChartGeometry | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const ys = sorted.map((p) => p.weightKg).concat(targetKg != null ? [targetKg] : []);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1) {
    lo -= 0.5;
    hi += 0.5;
  }
  const margin = (hi - lo) * 0.1;
  const yMin = lo - margin;
  const yMax = hi + margin;
  const t0 = Date.parse(sorted[0]!.measuredAt);
  const t1 = Date.parse(sorted[sorted.length - 1]!.measuredAt);
  const x = (t: number) =>
    t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - pad * 2);
  const y = (kg: number) => pad + (1 - (kg - yMin) / (yMax - yMin)) * (height - pad * 2);
  const dots = sorted.map((p) => ({ x: x(Date.parse(p.measuredAt)), y: y(p.weightKg) }));
  const path = dots
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x.toFixed(1)} ${d.y.toFixed(1)}`)
    .join(' ');
  return { path, dots, targetY: targetKg != null ? y(targetKg) : null, yMin, yMax };
}
