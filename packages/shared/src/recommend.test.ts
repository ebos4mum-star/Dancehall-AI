import { describe, expect, it } from 'vitest';
import { MOODS, recommendByMood } from './recommend';
import { WORKOUTS } from './workouts';

describe('recommendByMood', () => {
  it('only ever suggests workouts that exist, for every mood', () => {
    for (const m of MOODS)
      for (const r of recommendByMood(m, { limit: 10 }))
        expect(WORKOUTS.some((w) => w.id === r.workout.id)).toBe(true);
  });
  it('tired suggests gentle, short options', () => {
    const r = recommendByMood('tired', { limit: 10 });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.workout.intensity).toBe('low');
      expect(x.workout.minutes).toBeLessThanOrEqual(15);
    }
  });
  it('energized avoids gentle and very short sessions; motivation stays short and beginner', () => {
    for (const x of recommendByMood('energized', { limit: 10 })) {
      expect(x.workout.intensity).not.toBe('low');
      expect(x.workout.minutes).toBeGreaterThanOrEqual(10);
    }
    for (const x of recommendByMood('motivation', { limit: 10 })) {
      expect(x.workout.minutes).toBeLessThanOrEqual(10);
      expect(x.workout.level).toBe('beginner');
    }
  });
  it('respects the low-impact restriction for every mood', () => {
    for (const m of MOODS)
      for (const x of recommendByMood(m, { lowImpactOnly: true, limit: 10 }))
        expect(x.workout.impact).toBe('low');
  });
  it('is deterministic for a seed and varies styles first', () => {
    const a = recommendByMood('happy', { seed: 2 });
    expect(recommendByMood('happy', { seed: 2 })).toEqual(a);
    expect(new Set(a.map((x) => x.workout.style)).size).toBe(a.length);
  });
  it('falls back instead of returning nothing, and returns nothing only when no workouts exist', () => {
    const only = WORKOUTS.filter((w) => w.intensity === 'high');
    expect(recommendByMood('tired', {}, only).length).toBeGreaterThan(0);
    expect(recommendByMood('tired', {}, [])).toEqual([]);
  });
  it('never claims to know how the person feels', () => {
    for (const m of MOODS)
      for (const x of recommendByMood(m))
        expect(x.why).not.toMatch(/you are|you feel|detect|diagnos/i);
  });
});
