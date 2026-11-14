/** Measurement conversion. Canonical storage is metric (kg, cm, kcal, g, ml); display follows the user's choice. */
export type UnitSystem = 'metric' | 'imperial';

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const G_PER_OZ = 28.349523125;
const ML_PER_FL_OZ = 29.5735295625;
const KJ_PER_KCAL = 4.184;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;
export const inToCm = (inches: number): number => inches * CM_PER_IN;
export const gToOz = (g: number): number => g / G_PER_OZ;
export const ozToG = (oz: number): number => oz * G_PER_OZ;
export const mlToFlOz = (ml: number): number => ml / ML_PER_FL_OZ;
export const flOzToMl = (floz: number): number => floz * ML_PER_FL_OZ;
export const kcalToKj = (kcal: number): number => kcal * KJ_PER_KCAL;
export const kjToKcal = (kj: number): number => kj / KJ_PER_KCAL;

export function roundTo(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToIn(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}
export const feetInchesToCm = (feet: number, inches: number): number => inToCm(feet * 12 + inches);

/** Body weight shown in the user's unit, rounded to one decimal. Plain numbers; formatting/localization lives in the UI. */
export function displayWeight(
  kg: number,
  system: UnitSystem,
): { value: number; unit: 'kg' | 'lb' } {
  return system === 'metric'
    ? { value: roundTo(kg, 1), unit: 'kg' }
    : { value: roundTo(kgToLb(kg), 1), unit: 'lb' };
}

/** Parses user input in the chosen system into canonical kilograms. Returns null for invalid input. */
export function parseWeightToKg(input: number, system: UnitSystem): number | null {
  if (!Number.isFinite(input) || input <= 0) return null;
  return system === 'metric' ? input : lbToKg(input);
}
