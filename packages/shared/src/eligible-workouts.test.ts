import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eligibleWorkouts, type WorkoutLike } from './eligible-workouts';
import { countedSessions } from './activity-energy';
import { computeGamification, DEFAULT_GM_PREFS } from './gamification';

type Case = { name: string; sessions: WorkoutLike[]; keep: string[] };
const { cases } = JSON.parse(
  readFileSync(
    new URL('../../../supabase/tests/eligible-workout-cases.json', import.meta.url),
    'utf8',
  ),
) as { cases: Case[] };

describe('one physical workout counts once (cases shared with the database)', () => {
  it('has the cases', () => expect(cases.length).toBeGreaterThanOrEqual(15));
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_n, c) => {
    expect(
      eligibleWorkouts(c.sessions)
        .map((s) => s.id)
        .sort(),
    ).toEqual([...c.keep].sort());
    // Whatever order the records arrive in, the answer is the same.
    expect(
      eligibleWorkouts([...c.sessions].reverse())
        .map((s) => s.id)
        .sort(),
    ).toEqual([...c.keep].sort());
  });
});

describe('every total uses the same eligible activity', () => {
  const watch = {
    id: 'h',
    status: 'completed' as const,
    completedAt: '2026-06-17T08:31:00Z',
    durationS: 1860,
    minutes: 31,
    source: 'apple_health',
    title: 'Apple Health: Dance',
    style: null,
    lowImpact: false,
  };
  const mine = {
    ...watch,
    id: 'g',
    completedAt: '2026-06-17T08:30:00Z',
    durationS: 1800,
    minutes: 30,
    source: 'manual',
    title: 'Guided class',
    workoutId: 'w1',
  };
  const input = (sessions: WorkoutLike[]) => ({
    today: '2026-06-17',
    timeZone: 'UTC',
    sessions,
    mealLogDays: [],
    habitDays: [],
    activeHabitCount: 0,
    prefs: DEFAULT_GM_PREFS,
  });
  it('progress counting (energy, summaries) and XP agree', () => {
    expect(countedSessions([mine, watch]).map((s) => s.id)).toEqual(['g']);
    const both = computeGamification(input([mine, watch]));
    const alone = computeGamification(input([mine]));
    expect(both.totalXp).toBe(alone.totalXp);
    expect(both.weekXp).toBe(alone.weekXp);
  });
  it('delayed import, retry, edit and delete are all just recomputation', () => {
    // Delayed: the import lands days later with the same times: still once.
    expect(eligibleWorkouts([mine, { ...watch, id: 'h-late' }]).map((s) => s.id)).toEqual(['g']);
    // Retry: the same imported record listed twice (or two ids for one workout from two devices) is once.
    expect(eligibleWorkouts([watch, { ...watch }]).map((s) => s.id)).toEqual(['h']);
    expect(
      eligibleWorkouts([watch, { ...watch, id: 'h2', completedAt: '2026-06-17T08:32:00Z' }]).map(
        (s) => s.id,
      ),
    ).toEqual(['h']);
    // Edit: the guided session is edited to a different time of day, so both are separate workouts.
    expect(
      eligibleWorkouts([{ ...mine, completedAt: '2026-06-17T19:30:00Z' }, watch])
        .map((s) => s.id)
        .sort(),
    ).toEqual(['g', 'h']);
    // Delete: the guided session is removed, so the imported workout counts again (and earns XP).
    expect(eligibleWorkouts([watch]).map((s) => s.id)).toEqual(['h']);
    expect(computeGamification(input([watch])).totalXp).toBeGreaterThan(0);
  });
});
