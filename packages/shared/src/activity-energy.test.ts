import { describe, expect, it } from 'vitest';
import {
  EXTRA_FUEL_CAP,
  assumedMovementKcal,
  countedSessions,
  dayEnergy,
  workoutEnergy,
  type EnergySession,
} from './activity-energy';
import { periodSummary } from './period-summary';
import { FOOD_BY_ID } from './food-data';
import { itemFromFood } from './food';

const s = (id: string, at: string, over: Partial<EnergySession> = {}): EnergySession => ({
  id,
  workoutId: 'w1',
  title: 'Dancehall Basics',
  style: 'dancehall',
  status: 'completed',
  completedAt: at,
  durationS: 30 * 60,
  minutes: 30,
  lowImpact: false,
  ...over,
});

describe('workoutEnergy', () => {
  it('is conservative and carries a range', () => {
    const e = workoutEnergy({ weightKg: 70, minutes: 30, style: 'dancehall' })!;
    // Net: 4.0 MET x 70 kg x 0.5 h x 0.9 = 126 kcal, well under the gross figure (~5 MET = 175 kcal).
    expect(e.kcal).toBeGreaterThan(100);
    expect(e.kcal).toBeLessThan(160);
    expect(e.low).toBeLessThan(e.kcal);
    expect(e.high).toBeGreaterThan(e.kcal);
  });
  it('returns null (never a guess) without usable weight or time', () => {
    expect(workoutEnergy({ weightKg: null, minutes: 30 })).toBeNull();
    expect(workoutEnergy({ weightKg: 70, minutes: 0 })).toBeNull();
    expect(workoutEnergy({ weightKg: 5, minutes: 30 })).toBeNull();
    expect(workoutEnergy({ weightKg: NaN, minutes: 30 })).toBeNull();
  });
  it('seated and low-impact sessions use lower figures, unknown styles a general one, and time is capped', () => {
    const a = workoutEnergy({ weightKg: 70, minutes: 30, style: 'dancehall' })!.kcal;
    expect(workoutEnergy({ weightKg: 70, minutes: 30, style: 'chair' })!.kcal).toBeLessThan(a);
    expect(
      workoutEnergy({ weightKg: 70, minutes: 30, style: 'dancehall', lowImpact: true })!.kcal,
    ).toBeLessThan(a);
    expect(workoutEnergy({ weightKg: 70, minutes: 30, style: 'mystery' })).not.toBeNull();
    expect(workoutEnergy({ weightKg: 70, minutes: 9999 })!.kcal).toBe(
      workoutEnergy({ weightKg: 70, minutes: 240 })!.kcal,
    );
  });
});

describe('countedSessions protects against double counting', () => {
  it('counts only completed sessions, once per id', () => {
    const list = [
      s('a', '2026-06-15T10:00:00Z'),
      s('a', '2026-06-15T10:00:00Z'),
      s('b', '2026-06-15T12:00:00Z', { status: 'planned', completedAt: null }),
      s('c', '2026-06-15T13:00:00Z', { status: 'skipped', completedAt: null }),
    ];
    expect(countedSessions(list).map((x) => x.id)).toEqual(['a']);
  });
  it('treats the same workout recorded twice within ten minutes as one', () => {
    const list = [s('a', '2026-06-15T10:00:00Z'), s('b', '2026-06-15T10:06:00Z')];
    expect(countedSessions(list)).toHaveLength(1);
    expect(
      countedSessions([s('a', '2026-06-15T10:00:00Z'), s('b', '2026-06-15T10:30:00Z')]),
    ).toHaveLength(2);
    expect(
      countedSessions([
        s('a', '2026-06-15T10:00:00Z'),
        s('b', '2026-06-15T10:03:00Z', { workoutId: 'w2', title: 'Other' }),
      ]),
    ).toHaveLength(2);
  });
});

describe('dayEnergy: the daily guide already assumes movement', () => {
  const assumed = assumedMovementKcal({
    weightKg: 70,
    heightCm: 170,
    ageYears: 35,
    sex: 'female',
    activity: 'moderate',
  });
  it('assumed movement grows with the activity level', () => {
    const base = { weightKg: 70, heightCm: 170, ageYears: 35, sex: 'female' as const };
    const v = (activity: 'low' | 'light' | 'moderate' | 'high') =>
      assumedMovementKcal({ ...base, activity });
    expect(v('low')).toBe(0);
    expect(v('light')).toBeLessThan(v('moderate'));
    expect(v('moderate')).toBeLessThan(v('high'));
  });
  it('one ordinary workout on a moderately active profile adds no extra fuel', () => {
    const e = dayEnergy({
      day: '2026-06-15',
      sessions: [s('a', '2026-06-15T10:00:00Z')],
      weightKg: 70,
      assumedKcal: assumed,
      timeZone: 'UTC',
    });
    expect(e.workoutKcal).toBeGreaterThan(0);
    expect(e.extraFuelKcal).toBe(0);
  });
  it('a long session on a low-activity profile offers at most half the excess, capped', () => {
    const long = s('a', '2026-06-15T10:00:00Z', { durationS: 180 * 60, minutes: 180 });
    const e = dayEnergy({
      day: '2026-06-15',
      sessions: [long],
      weightKg: 90,
      assumedKcal: 0,
      timeZone: 'UTC',
    });
    expect(e.extraFuelKcal).toBeGreaterThan(0);
    expect(e.extraFuelKcal).toBeLessThanOrEqual(EXTRA_FUEL_CAP);
    expect(e.extraFuelKcal).toBeLessThanOrEqual((e.workoutKcal ?? 0) / 2 + 5);
  });
  it('a duplicate record does not double the energy', () => {
    const one = dayEnergy({
      day: '2026-06-15',
      sessions: [s('a', '2026-06-15T10:00:00Z')],
      weightKg: 70,
      assumedKcal: 0,
      timeZone: 'UTC',
    });
    const dup = dayEnergy({
      day: '2026-06-15',
      sessions: [s('a', '2026-06-15T10:00:00Z'), s('b', '2026-06-15T10:04:00Z')],
      weightKg: 70,
      assumedKcal: 0,
      timeZone: 'UTC',
    });
    expect(dup.workoutKcal).toBe(one.workoutKcal);
  });
  it('missing weight gives no estimate and no extra fuel; other days are ignored', () => {
    const e = dayEnergy({
      day: '2026-06-15',
      sessions: [s('a', '2026-06-15T10:00:00Z')],
      weightKg: null,
      assumedKcal: 0,
      timeZone: 'UTC',
    });
    expect(e).toMatchObject({ sessions: 1, workoutKcal: null, extraFuelKcal: 0 });
    expect(
      dayEnergy({
        day: '2026-06-14',
        sessions: [s('a', '2026-06-15T10:00:00Z')],
        weightKg: 70,
        assumedKcal: 0,
        timeZone: 'UTC',
      }).sessions,
    ).toBe(0);
  });
});

describe('periodSummary', () => {
  const rice = FOOD_BY_ID.get('white-rice')!;
  const food = (at: string, g = 150) => ({ loggedAt: at, items: [itemFromFood(rice, g)] });
  const base = { now: new Date('2026-06-15T12:00:00Z'), timeZone: 'UTC', weightKg: 70 };
  it('averages only over days that have food, and reports missing as missing', () => {
    const r = periodSummary({
      ...base,
      period: 'week',
      foodLogs: [
        food('2026-06-14T08:00:00Z'),
        food('2026-06-14T18:00:00Z'),
        food('2026-06-12T08:00:00Z'),
      ],
      sessions: [],
      weights: [],
    });
    expect(r.days).toBe(7);
    expect(r.food.daysLogged).toBe(2);
    expect(r.food.avgKcal).toBe(Math.round((2 * 195 + 195) / 2));
    const empty = periodSummary({
      ...base,
      period: 'week',
      foodLogs: [],
      sessions: [],
      weights: [],
    });
    expect(empty.food).toEqual({ daysLogged: 0, avgKcal: null, avgProteinG: null });
    expect(empty.movement.estKcal).toBeNull();
    expect(empty.weight.changeKg).toBeNull();
    expect(empty.highlights[0]).toMatch(/ready/i);
  });
  it('month covers the first of the month through today, week the last seven days', () => {
    const m = periodSummary({ ...base, period: 'month', foodLogs: [], sessions: [], weights: [] });
    expect([m.from, m.to, m.days]).toEqual(['2026-06-01', '2026-06-15', 15]);
    const w = periodSummary({ ...base, period: 'week', foodLogs: [], sessions: [], weights: [] });
    expect([w.from, w.to]).toEqual(['2026-06-09', '2026-06-15']);
  });
  it('counts movement once, estimates energy with a range, and respects the period', () => {
    const sessions = [
      s('a', '2026-06-14T10:00:00Z'),
      s('dup', '2026-06-14T10:03:00Z'),
      s('old', '2026-05-30T10:00:00Z'),
    ];
    const m = periodSummary({ ...base, period: 'month', foodLogs: [], sessions, weights: [] });
    expect(m.movement.sessions).toBe(1);
    expect(m.movement.activeDays).toBe(1);
    expect(m.movement.estKcalLow!).toBeLessThan(m.movement.estKcal!);
    const noWeight = periodSummary({
      ...base,
      weightKg: null,
      period: 'month',
      foodLogs: [],
      sessions,
      weights: [],
    });
    expect(noWeight.movement.estKcal).toBeNull();
    expect(noWeight.movement.minutes).toBe(30);
  });
  it('weight change needs two entries inside the period', () => {
    const one = periodSummary({
      ...base,
      period: 'month',
      foodLogs: [],
      sessions: [],
      weights: [{ weightKg: 70, measuredAt: '2026-06-02T08:00:00Z' }],
    });
    expect(one.weight).toMatchObject({ entries: 1, changeKg: null });
    const two = periodSummary({
      ...base,
      period: 'month',
      foodLogs: [],
      sessions: [],
      weights: [
        { weightKg: 70, measuredAt: '2026-06-02T08:00:00Z' },
        { weightKg: 69.2, measuredAt: '2026-06-14T08:00:00Z' },
        { weightKg: 80, measuredAt: '2026-04-01T08:00:00Z' },
      ],
    });
    expect(two.weight).toMatchObject({ entries: 2, firstKg: 70, lastKg: 69.2, changeKg: -0.8 });
  });
});
