import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import type { FoodLog, WorkoutSession } from '../data/types';
import { computeAchievements, newlyEarned, weeklyHabits } from './achievements';
import { readSeen, writeSeen, type SeenStore } from './seen';

let n = 0;
const sess = (day: string, o: Partial<WorkoutSession> = {}): WorkoutSession =>
  ({
    id: `s${n++}`,
    title: 'Synthetic',
    minutes: 20,
    status: 'completed',
    lowImpact: false,
    completedAt: `${day}T12:00:00Z`,
    durationS: null,
    ...o,
  }) as WorkoutSession;
const meal = (day: string): FoodLog => ({ id: `m${n++}`, loggedAt: `${day}T12:00:00Z` }) as FoodLog;
const run = (sessions: WorkoutSession[], foodLogs: FoodLog[] = []) =>
  computeAchievements({ sessions, foodLogs, timeZone: 'UTC' });
const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe('computeAchievements', () => {
  it('has nothing for an empty history', () => expect(run([])).toEqual([]));
  it('ignores planned sessions', () =>
    expect(run([sess('2026-06-01', { status: 'planned', completedAt: null })])).toEqual([]));
  it('awards the first session on the day it happened', () =>
    expect(run([sess('2026-06-01')])).toEqual([{ id: 'first_session', earnedOn: '2026-06-01' }]));
  it('awards session-count milestones on the day the Nth session was completed', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      sess(`2026-06-${String(i + 1).padStart(2, '0')}`),
    );
    const got = Object.fromEntries(run(many).map((a) => [a.id, a.earnedOn]));
    expect(got.sessions_5).toBe('2026-06-05');
    expect(got.sessions_10).toBe('2026-06-10');
    expect(got.sessions_25).toBe('2026-06-25');
  });
  it('accumulates minutes from the recorded duration, falling back to planned minutes', () => {
    const got = run([
      sess('2026-06-01', { durationS: 1800 }),
      sess('2026-06-02', { durationS: 1800 }),
    ]);
    expect(ids(got)).toContain('minutes_60');
    expect(ids(run([sess('2026-06-01', { minutes: 59 })]))).not.toContain('minutes_60');
  });
  it('three active days inside seven days, but not spread over eight', () => {
    expect(ids(run([sess('2026-06-01'), sess('2026-06-03'), sess('2026-06-07')]))).toContain(
      'three_active_days',
    );
    expect(ids(run([sess('2026-06-01'), sess('2026-06-03'), sess('2026-06-08')]))).not.toContain(
      'three_active_days',
    );
  });
  it('celebrates low-impact sessions and returning after a break', () => {
    const got = run([sess('2026-06-01'), sess('2026-06-20', { lowImpact: true })]);
    expect(got.find((a) => a.id === 'gentle_session')?.earnedOn).toBe('2026-06-20');
    expect(got.find((a) => a.id === 'welcome_back')?.earnedOn).toBe('2026-06-20');
  });
  it('meal milestones count distinct days, not consecutive days', () => {
    const days = ['01', '03', '04', '09', '10', '15', '20'].map((d) => meal(`2026-06-${d}`));
    const got = run([], days);
    expect(got.find((a) => a.id === 'first_meal')?.earnedOn).toBe('2026-06-01');
    expect(got.find((a) => a.id === 'meals_7_days')?.earnedOn).toBe('2026-06-20');
    expect(ids(run([], [meal('2026-06-01'), meal('2026-06-01')]))).not.toContain('meals_7_days');
  });
  it('never removes a milestone when activity stops (no streaks)', () => {
    const before = ids(run([sess('2026-06-01'), sess('2026-06-02'), sess('2026-06-03')]));
    const later = ids(run([sess('2026-06-01'), sess('2026-06-02'), sess('2026-06-03')], []));
    expect(later).toEqual(before);
  });
  it('uses the person’s time zone for the day', () => {
    const s = [sess('2026-06-01', { completedAt: '2026-06-01T23:30:00Z' })];
    const got = computeAchievements({ sessions: s, foodLogs: [], timeZone: 'Asia/Tokyo' });
    expect(got[0]!.earnedOn).toBe('2026-06-02');
  });
});

describe('weeklyHabits', () => {
  const now = new Date('2026-06-10T15:00:00Z');
  it('covers seven days ending today with counts only', () => {
    const h = weeklyHabits(
      {
        sessions: [sess('2026-06-10'), sess('2026-06-08'), sess('2026-05-01')],
        foodLogs: [meal('2026-06-09')],
        timeZone: 'UTC',
      },
      now,
    );
    expect(h.days).toHaveLength(7);
    expect(h.days[0]!.date).toBe('2026-06-04');
    expect(h.days[6]!.date).toBe('2026-06-10');
    expect(h.movedDays).toBe(2);
    expect(h.loggedDays).toBe(1);
    expect(Object.keys(h.days[0]!).sort()).toEqual(['date', 'logged', 'moved']);
  });
  it('an empty week is just zeros', () => {
    const h = weeklyHabits({ sessions: [], foodLogs: [], timeZone: 'UTC' }, now);
    expect([h.movedDays, h.loggedDays]).toEqual([0, 0]);
  });
});

describe('newlyEarned and seen-state', () => {
  const earned = [
    { id: 'first_session', earnedOn: 'd' },
    { id: 'sessions_5', earnedOn: 'd' },
  ] as never;
  it('first run celebrates nothing, later runs only the new ones', () => {
    expect(newlyEarned(earned, null)).toEqual([]);
    expect(newlyEarned(earned, ['first_session'])).toEqual(['sessions_5']);
  });
  const mem = (): SeenStore & { d: Map<string, string> } => {
    const d = new Map<string, string>();
    return { d, get: async (k) => d.get(k) ?? null, set: async (k, v) => void d.set(k, v) };
  };
  it('round-trips per user and treats corrupt data as never recorded', async () => {
    const s = mem();
    expect(await readSeen(s, 'u1')).toBeNull();
    await writeSeen(s, 'u1', ['a', 'a', 'b']);
    expect(await readSeen(s, 'u1')).toEqual(['a', 'b']);
    expect(await readSeen(s, 'u2')).toBeNull();
    s.d.set('dh.achievements.seen.u1', '{nope');
    expect(await readSeen(s, 'u1')).toBeNull();
  });
  it('a failing store never throws', async () => {
    const bad: SeenStore = {
      get: async () => {
        throw new Error('x');
      },
      set: async () => {
        throw new Error('x');
      },
    };
    expect(await readSeen(bad, 'u')).toBeNull();
    await expect(writeSeen(bad, 'u', ['a'])).resolves.toBeUndefined();
  });
});

describe('tone', () => {
  const copy = Object.entries(en).filter(
    ([k]) => k.startsWith('ach.') || k.startsWith('habit.') || k.startsWith('habits.'),
  );
  it('has copy for every achievement id', () => {
    for (const id of [
      'first_session',
      'sessions_5',
      'sessions_10',
      'sessions_25',
      'minutes_60',
      'minutes_300',
      'three_active_days',
      'gentle_session',
      'welcome_back',
      'first_meal',
      'meals_7_days',
    ])
      expect(en).toHaveProperty([`ach.${id}.title`]);
  });
  it('uses no guilt, streak, weight or competition language', () => {
    const banned =
      /streak|lose|lost|missed|failed|fail|cheat|earn your|make up for|burn|guilt|shame|rank|leaderboard|kg|lb\b/i;
    // "Nothing to make up" is reassurance, so it is allowed explicitly.
    for (const [k, v] of copy) expect(v.replace('Nothing to make up', ''), k).not.toMatch(banned);
  });
});
