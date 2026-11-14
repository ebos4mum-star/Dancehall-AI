import {
  displayWeight,
  feetInchesToCm,
  cmToFeetInches,
  roundTo,
  type UnitSystem,
} from '@dancehall/shared';

export const formatWeight = (kg: number, units: UnitSystem): string => {
  const w = displayWeight(kg, units);
  return `${w.value} ${w.unit}`;
};

/** "+0.4 kg" / "−1.2 lb" using a real minus sign; zero reads as "no change". */
export function formatChange(kg: number | null, units: UnitSystem): string | null {
  if (kg === null) return null;
  const v = units === 'metric' ? kg : kg / 0.45359237;
  const r = roundTo(Math.abs(v), 1);
  if (r === 0) return 'no change';
  return `${v < 0 ? '−' : '+'}${r} ${units === 'metric' ? 'kg' : 'lb'}`;
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet} ft ${inches} in`;
}
export { feetInchesToCm };

/** Parses a decimal typed by the user; accepts a comma as the decimal separator. Returns null if invalid. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const todayIso = (now: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export function formatDate(iso: string, locale = 'en'): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
