import { describe, expect, it } from 'vitest';
import { weeklyRecap, type RecapInput } from './recap';

// Wednesday 2026-06-17 12:00 UTC; week starts Monday 2026-06-15.
const base: RecapInput = {
  now: new Date('2026-06-17T12:00:00Z'),
  timeZone: 'UTC',
  sessions: [],
  foodLogTimes: [],
  habits: [],
  checkins: [],
  goals: [],
  weights: [],
};
const done = (iso: string, minutes = 10, durationS: number | null = null) => ({
  status: 'completed',
  completedAt: iso,
  durationS,
  minutes,
});

describe('weeklyRecap', () => {
  it('handles a partial week and reports missing data as missing, not zero', () => {
    const r = weeklyRecap(base);
    expect(r.weekStart).toBe('2026-06-15');
    expect(r.daysSoFar).toBe(3);
    expect(r.foodDays).toBeNull();
    expect(r.habits).toBeNull();
    expect(r.goals).toEqual([]);
    expect(r.insight).toMatch(/still open/);
    expect(r.insight).not.toMatch(/fail|miss|behind|lazy/i);
  });
  it('counts only completed sessions this week, using actual duration when known', () => {
    const r = weeklyRecap({
      ...base,
      sessions: [
        done('2026-06-15T09:00:00Z', 10, 600),
        done('2026-06-15T18:00:00Z', 10, 125),
        done('2026-06-08T09:00:00Z'),
        { status: 'planned', completedAt: null, durationS: null, minutes: 20 },
      ],
    });
    expect(r.dance).toEqual({ sessions: 2, minutes: 12, activeDays: 1 });
    expect(r.insight).toMatch(/moved on 1 day/);
  });
  it('uses the person’s time zone for week boundaries', () => {
    // 23:30 UTC Sunday is already Monday in Auckland, so it belongs to the new week there.
    const r = weeklyRecap({
      ...base,
      now: new Date('2026-06-17T12:00:00Z'),
      timeZone: 'Pacific/Auckland',
      sessions: [done('2026-06-14T23:30:00Z')],
    });
    expect(r.dance.sessions).toBe(1);
    expect(weeklyRecap({ ...base, sessions: [done('2026-06-14T23:30:00Z')] }).dance.sessions).toBe(
      0,
    );
  });
  it('food days: zero once logging has started, null before', () => {
    expect(weeklyRecap({ ...base, foodLogTimes: ['2026-06-01T10:00:00Z'] }).foodDays).toBe(0);
    expect(
      weeklyRecap({ ...base, foodLogTimes: ['2026-06-16T10:00:00Z', '2026-06-16T19:00:00Z'] })
        .foodDays,
    ).toBe(1);
  });
  it('habits are measured against the days that have started', () => {
    const r = weeklyRecap({
      ...base,
      habits: [{ id: 'a' }, { id: 'b' }],
      checkins: [
        { habitId: 'a', day: '2026-06-15' },
        { habitId: 'b', day: '2026-06-16' },
        { habitId: 'a', day: '2026-06-10' },
        { habitId: 'gone', day: '2026-06-15' },
      ],
    });
    expect(r.habits).toEqual({ done: 2, possible: 6 });
  });
  it('goal progress is null without a recorded weight', () => {
    const goals = [{ status: 'active', type: 'lose', startKg: 80, targetKg: 76 }];
    expect(weeklyRecap({ ...base, goals }).goals[0]!.fraction).toBeNull();
    const w = [{ weightKg: 78, measuredAt: '2026-06-16T08:00:00Z' }];
    const r = weeklyRecap({ ...base, goals, weights: w });
    expect(r.goals[0]!.fraction).toBeCloseTo(0.5, 2);
    expect(r.weightEntries).toBe(1);
  });
});
