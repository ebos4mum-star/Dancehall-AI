import { describe, expect, it } from 'vitest';
import {
  bmi,
  dailyCalorieGuidance,
  estimateBmrKcal,
  evaluateReadiness,
  evaluateWeightGoal,
  READINESS_QUESTIONS,
  screenMessageForRiskSignals,
} from './safety';

const base = { ageYears: 35, heightCm: 170, currentKg: 80, targetKg: 72 };

describe('weight goal safety (synthetic data)', () => {
  it('blocks under-18s', () => {
    expect(evaluateWeightGoal({ ...base, ageYears: 17 }).status).toBe('block');
  });
  it('blocks invalid inputs', () => {
    expect(evaluateWeightGoal({ ...base, heightCm: 0 }).status).toBe('block');
    expect(evaluateWeightGoal({ ...base, currentKg: NaN }).status).toBe('block');
  });
  it('blocks a target below the minimum BMI', () => {
    const d = evaluateWeightGoal({ ...base, targetKg: 50 });
    expect(bmi(50, 170)).toBeLessThan(18.5);
    expect(d.status).toBe('block');
  });
  it('blocks loss goals when already below the minimum BMI', () => {
    expect(
      evaluateWeightGoal({ ageYears: 30, heightCm: 170, currentKg: 50, targetKg: 48 }).status,
    ).toBe('block');
  });
  it('proposes a gentle default pace and never promises results', () => {
    const d = evaluateWeightGoal(base);
    expect(d.status).toBe('allow');
    expect(d.adjusted?.weeklyChangeKg).toBeCloseTo(-0.4, 5);
    expect(d.reasons.join(' ')).toMatch(/not guaranteed/i);
  });
  it('caps an aggressive pace at 1% of body weight per week', () => {
    const d = evaluateWeightGoal({ ...base, plannedWeeklyChangeKg: -2 });
    expect(d.status).toBe('adjust');
    expect(d.adjusted?.weeklyChangeKg).toBeCloseTo(-0.8, 5);
  });
  it('resets a pace that points the wrong way', () => {
    const d = evaluateWeightGoal({ ...base, plannedWeeklyChangeKg: 0.3 });
    expect(d.status).toBe('adjust');
    expect(d.adjusted?.weeklyChangeKg).toBe(0);
  });
  it('caps gain pace', () => {
    const d = evaluateWeightGoal({ ...base, targetKg: 85, plannedWeeklyChangeKg: 1.5 });
    expect(d.adjusted?.weeklyChangeKg).toBeCloseTo(0.4, 5);
  });
});

describe('calorie guidance', () => {
  const p = {
    weightKg: 80,
    heightCm: 170,
    ageYears: 35,
    sex: 'unspecified' as const,
    activity: 'light' as const,
  };
  it('is individualized: the floor differs by person', () => {
    const a = dailyCalorieGuidance({ ...p, weeklyChangeKg: -0.4 });
    const b = dailyCalorieGuidance({ ...p, weightKg: 55, weeklyChangeKg: -0.25 });
    expect(a.floorKcal).not.toBe(b.floorKcal);
    expect(a.floorKcal).toBe(Math.round(estimateBmrKcal(p)));
  });
  it('caps the deficit at 20% of maintenance and never goes below resting energy', () => {
    const g = dailyCalorieGuidance({ ...p, weeklyChangeKg: -3 });
    expect(g.deficitCapApplied).toBe(true);
    expect(g.targetKcal).toBeGreaterThanOrEqual(g.floorKcal);
    expect(g.targetKcal).toBeGreaterThanOrEqual(Math.round(g.maintenanceKcal * 0.8) - 1);
    expect(g.reviewRequired).toBe(true);
  });
  it('does not change intake for maintenance', () => {
    const g = dailyCalorieGuidance({ ...p, weeklyChangeKg: 0 });
    expect(g.targetKcal).toBe(g.maintenanceKcal);
  });
});

describe('readiness screening', () => {
  it('is clear only when every question is answered no', () => {
    const all = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q, false]));
    expect(evaluateReadiness(all).outcome).toBe('clear');
  });
  it('defaults to low impact on any yes', () => {
    const r = evaluateReadiness({ chest_pain_during_activity: true });
    expect(r.defaultToLowImpact).toBe(true);
    expect(r.flagged).toEqual(['chest_pain_during_activity']);
  });
  it('treats unanswered questions cautiously', () => {
    expect(evaluateReadiness({}).defaultToLowImpact).toBe(true);
  });
});

describe('risk signal screen', () => {
  it('flags clear signals', () => {
    expect(screenMessageForRiskSignals('I want to die')).toBe('self_harm');
    expect(screenMessageForRiskSignals("I'm starving myself to hit my goal")).toBe(
      'disordered_eating',
    );
  });
  it('does not flag ordinary messages', () => {
    expect(screenMessageForRiskSignals('Give me a 10 minute low impact workout')).toBeNull();
  });
});
