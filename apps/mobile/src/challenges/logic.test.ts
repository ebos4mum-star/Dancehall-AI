import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../data/types';
import { challengeProgress, defaultTargetDays, isValidChallenge, maxTargetDays } from './logic';

const done = (day: string, h = 12): WorkoutSession =>
  ({
    id: day + h,
    status: 'completed',
    completedAt: `${day}T${String(h).padStart(2, '0')}:00:00Z`,
  }) as WorkoutSession;
const c = { startDate: '2026-06-01', lengthDays: 7 as const, targetDays: 3 };
const at = (day: string) => new Date(`${day}T10:00:00Z`);

describe('targets', () => {
  it('always leave rest days (matches the database rule)', () => {
    expect([7, 14, 30].map(maxTargetDays)).toEqual([5, 10, 21]);
    for (const n of [7, 14, 30]) expect(defaultTargetDays(n)).toBeLessThanOrEqual(maxTargetDays(n));
    expect([7, 14, 30].map(defaultTargetDays)).toEqual([3, 6, 13]);
  });
  it('validates length and target', () => {
    expect(isValidChallenge(7, 5)).toBe(true);
    expect(isValidChallenge(7, 6)).toBe(false);
    expect(isValidChallenge(7, 0)).toBe(false);
    expect(isValidChallenge(10, 3)).toBe(false);
    expect(isValidChallenge(14, 2.5)).toBe(false);
  });
});

describe('challengeProgress', () => {
  it('counts distinct active days inside the window only', () => {
    const p = challengeProgress(
      c,
      [
        done('2026-05-31'),
        done('2026-06-01'),
        done('2026-06-01', 18),
        done('2026-06-04'),
        done('2026-06-08'),
      ],
      'UTC',
      at('2026-06-05'),
    );
    expect(p.activeDays).toBe(2);
    expect(p.daysLeft).toBe(3);
    expect(p.ended).toBe(false);
    expect(p.met).toBe(false);
    expect(p.fraction).toBeCloseTo(2 / 3);
  });
  it('ignores planned and skipped sessions', () => {
    const p = challengeProgress(
      c,
      [{ status: 'planned', completedAt: null } as WorkoutSession],
      'UTC',
      at('2026-06-02'),
    );
    expect(p.activeDays).toBe(0);
  });
  it('is met at the target and the fraction never exceeds 1', () => {
    const s = ['01', '02', '03', '04'].map((d) => done(`2026-06-${d}`));
    const p = challengeProgress(c, s, 'UTC', at('2026-06-05'));
    expect(p.met).toBe(true);
    expect(p.fraction).toBe(1);
  });
  it('the last day still counts as in progress, the day after has ended', () => {
    expect(challengeProgress(c, [], 'UTC', at('2026-06-07'))).toMatchObject({
      ended: false,
      daysLeft: 1,
    });
    expect(challengeProgress(c, [], 'UTC', at('2026-06-08'))).toMatchObject({
      ended: true,
      daysLeft: 0,
    });
  });
  it('uses the person’s time zone for day boundaries', () => {
    const p = challengeProgress(c, [done('2026-05-31', 23)], 'Asia/Tokyo', at('2026-06-02')); // 08:00 on 1 June in Tokyo
    expect(p.activeDays).toBe(1);
  });
});

describe('challengeProgress with walking and strength', () => {
  it('counts walks and strength as active days, once per day, inside the window only', () => {
    const p = challengeProgress(c, [done('2026-06-01')], 'UTC', at('2026-06-05'), [
      { kind: 'walk', day: '2026-06-01' },
      { kind: 'walk', day: '2026-06-02' },
      { kind: 'strength', day: '2026-06-03' },
      { kind: 'strength', day: '2026-05-31' },
      { kind: 'hydration', day: '2026-06-04' },
      { kind: 'sleep', day: '2026-06-04' },
    ]);
    expect(p.activeDays).toBe(3);
    expect(p.byKind).toEqual({ dance: 1, walking: 2, strength: 1 });
    expect(p.met).toBe(true);
  });
  it('is unchanged when no wellness entries are given', () => {
    const p = challengeProgress(c, [done('2026-06-02')], 'UTC', at('2026-06-05'));
    expect(p.activeDays).toBe(1);
    expect(p.byKind).toEqual({ dance: 1, walking: 0, strength: 0 });
  });
});
