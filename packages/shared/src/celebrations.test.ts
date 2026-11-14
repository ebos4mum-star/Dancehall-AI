import { describe, expect, it } from 'vitest';
import {
  CELEBRATION_RULES,
  achievedCelebrations,
  dueCelebrations,
  remember,
  type CelebrationInput,
} from './celebrations';
import type { WellnessEntry } from './wellness';

let n = 0;
const entry = (kind: WellnessEntry['kind'], day: string, amount: number): WellnessEntry => ({
  id: `e${n++}`,
  kind,
  day,
  amount,
  amount2: null,
  label: null,
  createdAt: `${day}T08:00:00Z`,
});
const base: CelebrationInput = {
  today: '2026-06-17', // a Wednesday; week starts 2026-06-15
  timeZone: 'UTC',
  waterGoalMl: 2000,
  weeklyMinutesGoal: null,
  entries: [],
  sessions: [],
  habits: { activeIds: [], checkins: [] },
};
const ids = (i: CelebrationInput) => achievedCelebrations(i).map((c) => c.id);

describe('daily celebrations', () => {
  it('nothing is celebrated from nothing recorded', () => {
    expect(achievedCelebrations(base)).toEqual([]);
  });
  it('water: only when the logged total reaches the goal, for that day', () => {
    const e = (a: number, day = base.today) => entry('hydration', day, a);
    expect(ids({ ...base, entries: [e(1500)] })).toEqual([]);
    expect(ids({ ...base, entries: [e(1500, '2026-06-16'), e(400)] })).toEqual([]);
    expect(ids({ ...base, entries: [e(1500), e(500)] })).toEqual(['daily:water:2026-06-17']);
  });
  it('habits: needs at least one active habit and every one ticked today', () => {
    const habits = (checkins: Array<[string, string]>) => ({
      activeIds: ['a', 'b'],
      checkins: checkins.map(([habitId, day]) => ({ habitId, day })),
    });
    expect(ids({ ...base, habits: { activeIds: [], checkins: [] } })).toEqual([]);
    expect(ids({ ...base, habits: habits([['a', base.today]]) })).toEqual([]);
    expect(
      ids({
        ...base,
        habits: habits([
          ['a', base.today],
          ['b', '2026-06-16'],
        ]),
      }),
    ).toEqual([]);
    expect(
      ids({
        ...base,
        habits: habits([
          ['a', base.today],
          ['b', base.today],
        ]),
      }),
    ).toEqual(['daily:habits:2026-06-17']);
  });
  it('movement: dance, walks and strength add up to the threshold; short bursts do not', () => {
    const session = {
      status: 'completed',
      completedAt: '2026-06-17T09:00:00Z',
      minutes: 5,
      durationS: null,
    };
    expect(ids({ ...base, sessions: [session] })).toEqual([]);
    expect(ids({ ...base, sessions: [session], entries: [entry('walk', base.today, 5)] })).toEqual([
      'daily:movement:2026-06-17',
    ]);
    expect(
      ids({
        ...base,
        sessions: [{ ...session, status: 'planned' }],
        entries: [entry('walk', base.today, 9)],
      }),
    ).toEqual([]);
    expect(CELEBRATION_RULES.dailyMovementMinutes).toBe(10);
  });
});

describe('weekly, monthly and yearly celebrations use the person’s OWN weekly goal', () => {
  const walks = (days: string[], m = 40) => days.map((d) => entry('walk', d, m));
  it('without a weekly goal there are none', () => {
    expect(
      ids({ ...base, entries: walks(['2026-06-15', '2026-06-16', '2026-06-17'], 300) }),
    ).not.toContain('weekly:movement_minutes:2026-06-15');
  });
  it('weekly: the week total reaches the goal', () => {
    const i = { ...base, weeklyMinutesGoal: 100 };
    expect(ids({ ...i, entries: walks(['2026-06-15', '2026-06-16'], 40) })).not.toContain(
      'weekly:movement_minutes:2026-06-15',
    );
    expect(ids({ ...i, entries: walks(['2026-06-15', '2026-06-16', '2026-06-17'], 40) })).toContain(
      'weekly:movement_minutes:2026-06-15',
    );
    // Last week's minutes do not count towards this week.
    expect(
      ids({ ...i, entries: walks(['2026-06-08', '2026-06-09', '2026-06-10'], 40) }),
    ).not.toContain('weekly:movement_minutes:2026-06-15');
  });
  it('monthly: the goal met in enough weeks starting in the month', () => {
    const i = { ...base, today: '2026-06-24', weeklyMinutesGoal: 30 };
    const two = walks(['2026-06-01', '2026-06-08']);
    expect(ids({ ...i, entries: two })).not.toContain('monthly:movement_weeks:2026-06');
    expect(ids({ ...i, entries: [...two, ...walks(['2026-06-15'])] })).toContain(
      'monthly:movement_weeks:2026-06',
    );
  });
  it('yearly: the goal met in about half the weeks of the year', () => {
    const i = { ...base, today: '2026-09-30', weeklyMinutesGoal: 30 };
    const weekDays = (count: number) =>
      Array.from({ length: count }, (_, k) => {
        const d = new Date(Date.UTC(2026, 0, 5 + k * 7)); // Mondays from Jan 5
        return d.toISOString().slice(0, 10);
      });
    expect(
      ids({ ...i, entries: walks(weekDays(CELEBRATION_RULES.yearlyWeeksRequired - 1)) }),
    ).not.toContain('yearly:movement_weeks:2026');
    expect(
      ids({ ...i, entries: walks(weekDays(CELEBRATION_RULES.yearlyWeeksRequired)) }),
    ).toContain('yearly:movement_weeks:2026');
  });
});

describe('the celebration ledger', () => {
  const water = { ...base, entries: [entry('hydration', base.today, 2500)] };
  it('a new ledger celebrates nothing retroactively', () => {
    expect(dueCelebrations(achievedCelebrations(water), null)).toEqual([]);
  });
  it('shows each achievement once, however often it is re-evaluated', () => {
    const a = achievedCelebrations(water);
    const first = dueCelebrations(a, new Set());
    expect(first.map((c) => c.id)).toEqual(['daily:water:2026-06-17']);
    const seen = new Set(remember(new Set(), first));
    expect(dueCelebrations(achievedCelebrations(water), seen)).toEqual([]);
    expect(
      dueCelebrations(
        achievedCelebrations({
          ...water,
          entries: [...water.entries, entry('hydration', base.today, 250)],
        }),
        seen,
      ),
    ).toEqual([]);
  });
  it('the next day is a new achievement; biggest period first', () => {
    const i = {
      ...base,
      weeklyMinutesGoal: 30,
      entries: [entry('hydration', base.today, 2500), entry('walk', base.today, 40)],
    };
    const due = dueCelebrations(achievedCelebrations(i), new Set());
    expect(due.map((c) => c.period)).toEqual(['weekly', 'daily', 'daily']);
    const seen = new Set(remember(new Set(), due));
    const tomorrow = {
      ...i,
      today: '2026-06-18',
      entries: [...i.entries, entry('hydration', '2026-06-18', 2500)],
    };
    expect(dueCelebrations(achievedCelebrations(tomorrow), seen).map((c) => c.id)).toEqual([
      'daily:water:2026-06-18',
    ]);
  });
  it('remember keeps the ledger bounded', () => {
    const many = Array.from({ length: 400 }, (_, k) => ({
      id: `daily:water:${k}`,
      period: 'daily' as const,
      kind: 'water' as const,
      periodKey: String(k),
    }));
    expect(remember(null, many)).toHaveLength(300);
    expect(remember(null, many).at(-1)).toBe('daily:water:399');
  });
  it('never mentions weight, calories or food numbers (no such kind exists)', () => {
    const kinds = new Set(
      achievedCelebrations({ ...water, weeklyMinutesGoal: 10 }).map((c) => c.kind),
    );
    for (const k of kinds)
      expect(['water', 'habits', 'movement', 'movement_minutes', 'movement_weeks']).toContain(k);
  });
});
