import { describe, expect, it } from 'vitest';
import { goalEndDate, goalProgress, goalWeeks, proposeGoal } from './goals';
import { loggedDays, summarizeWeights } from './progress';

const base = { startDate: '2026-03-01', heightCm: 170, ageYears: 35 };

describe('goal dates', () => {
  it('computes period ends like the database', () => {
    expect(goalEndDate('2026-03-01', 'weekly')).toBe('2026-03-08');
    expect(goalEndDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(goalEndDate('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(goalEndDate('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(goalEndDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(goalEndDate('2026-03-01', 'yearly')).toBe('2027-03-01');
    expect(goalWeeks('2026-03-01', '2026-03-08')).toBe(1);
  });
});

describe('proposeGoal', () => {
  it('accepts a moderate yearly loss target unchanged', () => {
    const p = proposeGoal({ ...base, type: 'lose', period: 'yearly', startKg: 85, targetKg: 77 });
    expect(p.status).toBe('allow');
    expect(p.goal).toMatchObject({ endDate: '2027-03-01', targetKg: 77 });
  });
  it('suggests a gentle default when no target is given', () => {
    const p = proposeGoal({ ...base, type: 'lose', period: 'monthly', startKg: 80 });
    expect(p.goal!.targetKg).toBeLessThan(80);
    expect(80 - p.goal!.targetKg).toBeLessThanOrEqual(80 * 0.005 * (31 / 7) + 0.01);
  });
  it('slows an aggressive pace and the result stays inside the database cap', () => {
    for (const startKg of [60, 71.37, 82.37, 99.99, 130.01]) {
      const p = proposeGoal({
        ...base,
        startDate: '2026-03-01',
        type: 'lose',
        period: 'weekly',
        startKg,
        targetKg: startKg - 4,
      });
      if (p.status === 'block') continue;
      expect(p.status).toBe('adjust');
      const weekly = (p.goal!.targetKg - startKg) / 1;
      expect(Math.round(-weekly * 1000) / 1000).toBeLessThanOrEqual(startKg * 0.01);
    }
  });
  it('blocks wrong-direction, too-low and under-18 requests', () => {
    expect(
      proposeGoal({ ...base, type: 'lose', period: 'monthly', startKg: 80, targetKg: 82 }).status,
    ).toBe('block');
    expect(
      proposeGoal({ ...base, type: 'gain', period: 'monthly', startKg: 80, targetKg: 78 }).status,
    ).toBe('block');
    expect(
      proposeGoal({ ...base, type: 'lose', period: 'yearly', startKg: 62, targetKg: 48 }).status,
    ).toBe('block');
    expect(
      proposeGoal({ ...base, ageYears: 17, type: 'maintain', period: 'monthly', startKg: 70 })
        .status,
    ).toBe('block');
  });
  it('maintenance keeps the weight', () => {
    const p = proposeGoal({ ...base, type: 'maintain', period: 'weekly', startKg: 70 });
    expect(p.goal).toMatchObject({ targetKg: 70, endDate: '2026-03-08' });
  });
  it('caps gain pace', () => {
    const p = proposeGoal({ ...base, type: 'gain', period: 'weekly', startKg: 60, targetKg: 62 });
    expect(p.status).toBe('adjust');
    expect(p.goal!.targetKg - 60).toBeLessThanOrEqual(0.3);
  });
});

describe('goalProgress', () => {
  it('tracks loss and gain from start toward target', () => {
    expect(goalProgress({ type: 'lose', startKg: 80, targetKg: 76 }, 78)).toEqual({
      fraction: 0.5,
      onTrack: true,
    });
    expect(goalProgress({ type: 'lose', startKg: 80, targetKg: 76 }, 81)).toEqual({
      fraction: 0,
      onTrack: false,
    });
    expect(goalProgress({ type: 'gain', startKg: 60, targetKg: 64 }, 70).fraction).toBe(1);
    expect(goalProgress({ type: 'maintain', startKg: 70, targetKg: 70 }, 70.6).onTrack).toBe(true);
    expect(goalProgress({ type: 'maintain', startKg: 70, targetKg: 70 }, 72).onTrack).toBe(false);
  });
});

describe('weight summary', () => {
  const day = (n: number, kg: number) => ({
    weightKg: kg,
    measuredAt: new Date(Date.UTC(2026, 2, 1 + n, 8)).toISOString(),
  });
  it('is empty-safe', () => {
    expect(summarizeWeights([]).latest).toBeNull();
    expect(summarizeWeights([day(0, 80)])).toMatchObject({
      change7dKg: null,
      weeklyRateKg: null,
      count: 1,
    });
  });
  it('computes changes, average and trend from unsorted data', () => {
    const e = [day(14, 79), day(0, 81), day(7, 80), day(21, 78), day(28, 77)];
    const s = summarizeWeights(e);
    expect(s.latest?.weightKg).toBe(77);
    expect(s.change7dKg).toBe(-1);
    expect(s.change30dKg).toBe(-4);
    expect(s.weeklyRateKg).toBe(-1);
    expect(s.sevenDayAverageKg).toBe(77);
  });
  it('counts distinct logged days', () => {
    const e = [
      day(0, 80),
      { weightKg: 80, measuredAt: day(0, 80).measuredAt.replace('T08', 'T20') },
      day(2, 80),
    ];
    expect(loggedDays(e, new Date(Date.UTC(2026, 2, 4)), 7)).toBe(2);
  });
});

import { readFileSync } from 'node:fs';
import { hardCheckGoal } from './goals';

describe('hardCheckGoal matches the shared database cases', () => {
  const doc = JSON.parse(
    readFileSync(new URL('../../../supabase/tests/goal-cases.json', import.meta.url), 'utf8'),
  ) as {
    adult: { ageYears: number };
    cases: Array<{
      name: string;
      type: 'lose' | 'maintain' | 'gain';
      period: 'weekly' | 'monthly' | 'yearly';
      startDate: string;
      endDate: string;
      startKg: number;
      targetKg: number;
      heightCm: number;
      expect: string | null;
    }>;
  };
  it.each(doc.cases)('$name', (c) => {
    expect(hardCheckGoal(c, { heightCm: c.heightCm, ageYears: doc.adult.ageYears })).toBe(c.expect);
  });
  it('rejects minors', () => {
    expect(
      hardCheckGoal(
        {
          type: 'maintain',
          period: 'weekly',
          startDate: '2026-03-01',
          endDate: '2026-03-08',
          startKg: 70,
          targetKg: 70,
        },
        { heightCm: 170, ageYears: 17 },
      ),
    ).toBe('adults_only');
  });
});

describe('every proposal satisfies the database rules', () => {
  it('holds across many inputs', () => {
    let accepted = 0;
    for (const type of ['lose', 'gain', 'maintain'] as const) {
      for (const period of ['weekly', 'monthly', 'yearly'] as const) {
        for (const startKg of [48, 55.5, 62.37, 71, 82.37, 99.99, 125.5, 160]) {
          for (const delta of [undefined, 0.2, 1, 3, 8, 30]) {
            for (const heightCm of [150, 170, 192]) {
              for (const startDate of ['2026-01-31', '2026-03-01', '2027-03-01', '2028-02-29']) {
                const targetKg =
                  delta === undefined
                    ? undefined
                    : type === 'lose'
                      ? startKg - delta
                      : startKg + delta;
                const p = proposeGoal({
                  type,
                  period,
                  startDate,
                  startKg,
                  targetKg,
                  heightCm,
                  ageYears: 30,
                });
                if (p.status === 'block') continue;
                accepted += 1;
                expect(
                  hardCheckGoal(p.goal!, { heightCm, ageYears: 30 }),
                  JSON.stringify({
                    type,
                    period,
                    startKg,
                    targetKg,
                    heightCm,
                    startDate,
                    goal: p.goal,
                  }),
                ).toBeNull();
              }
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(500);
  });
});
