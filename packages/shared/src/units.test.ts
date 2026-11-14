import { describe, expect, it } from 'vitest';
import {
  cmToFeetInches,
  displayWeight,
  feetInchesToCm,
  kcalToKj,
  kgToLb,
  lbToKg,
  parseWeightToKg,
  roundTo,
} from './units';

describe('units', () => {
  it('converts kg and lb both ways', () => {
    expect(roundTo(kgToLb(100), 2)).toBe(220.46);
    expect(roundTo(lbToKg(220.462), 2)).toBe(100);
  });
  it('round-trips weight within rounding error', () => {
    for (const kg of [45, 61.3, 82.5, 130]) expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 10);
  });
  it('converts height', () => {
    expect(cmToFeetInches(175.26)).toEqual({ feet: 5, inches: 9 });
    expect(feetInchesToCm(5, 9)).toBeCloseTo(175.26, 2);
  });
  it('displays weight in the chosen system', () => {
    expect(displayWeight(70, 'metric')).toEqual({ value: 70, unit: 'kg' });
    expect(displayWeight(70, 'imperial')).toEqual({ value: 154.3, unit: 'lb' });
  });
  it('parses input and rejects invalid values', () => {
    expect(parseWeightToKg(154.3, 'imperial')).toBeCloseTo(69.99, 1);
    expect(parseWeightToKg(70, 'metric')).toBe(70);
    for (const bad of [0, -5, NaN, Infinity]) expect(parseWeightToKg(bad, 'metric')).toBeNull();
  });
  it('converts energy', () => {
    expect(roundTo(kcalToKj(100), 1)).toBe(418.4);
  });
});
