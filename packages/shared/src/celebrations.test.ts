import { describe, expect, it } from 'vitest';
import {
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
  dailyMovementMinutes: null,
  weeklyMinutesGoal: null,
  monthlyWeeksGoal: null,
  yearlyWeeksGoal: null,
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
  it('movement: dance, walks and strength add up to THEIR configured daily goal; no goal means no celebration', () => {
    const session = {
      status: 'completed',
      completedAt: '2026-06-17T09:00:00Z',
      minutes: 5,
      durationS: null,
    };
    const goal = { ...base, dailyMovementMinutes: 10 };
    expect(ids({ ...goal, sessions: [session] })).toEqual([]);
    expect(ids({ ...goal, sessions: [session], entries: [entry('walk', base.today, 5)] })).toEqual([
      'daily:movement:2026-06-17',
    ]);
    expect(
      ids({
        ...goal,
        sessions: [{ ...session, status: 'planned' }],
        entries: [entry('walk', base.today, 9)],
      }),
    ).toEqual([]);
    // Their goal is theirs: 30 means 30, and without a goal even a long walk is not celebrated.
    expect(
      ids({ ...base, dailyMovementMinutes: 30, entries: [entry('walk', base.today, 20)] }),
    ).toEqual([]);
    expect(ids({ ...base, entries: [entry('walk', base.today, 200)] })).toEqual([]);
  });
  it('water: only their configured goal is celebrated, never a default guide', () => {
    const e = [entry('hydration', base.today, 5000)];
    expect(ids({ ...base, waterGoalMl: null, entries: e })).toEqual([]);
    expect(ids({ ...base, waterGoalMl: 1500, entries: e })).toEqual(['daily:water:2026-06-17']);
  });
});

describe('weekly, monthly and yearly celebrations use goals the person configured', () => {
  const walks = (days: string[], m = 40) => days.map((d) => entry('walk', d, m));
  it('without a weekly goal there are none, however much they move', () => {
    const i = { ...base, monthlyWeeksGoal: 1, yearlyWeeksGoal: 1 };
    expect(ids({ ...i, entries: walks(['2026-06-15', '2026-06-16', '2026-06-17'], 300) })).toEqual(
      [],
    );
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
  it('monthly: only when they set a monthly weeks goal, and only once it is reached', () => {
    const i = { ...base, today: '2026-06-24', weeklyMinutesGoal: 30 };
    const two = walks(['2026-06-01', '2026-06-08']);
    const three = [...two, ...walks(['2026-06-15'])];
    expect(ids({ ...i, entries: three })).not.toContain('monthly:movement_weeks:2026-06');
    expect(ids({ ...i, monthlyWeeksGoal: 3, entries: two })).not.toContain(
      'monthly:movement_weeks:2026-06',
    );
    expect(ids({ ...i, monthlyWeeksGoal: 3, entries: three })).toContain(
      'monthly:movement_weeks:2026-06',
    );
    expect(ids({ ...i, monthlyWeeksGoal: 2, entries: two })).toContain(
      'monthly:movement_weeks:2026-06',
    );
  });
  it('yearly: only when they set a yearly weeks goal, and only once it is reached', () => {
    const i = { ...base, today: '2026-09-30', weeklyMinutesGoal: 30 };
    const weekDays = (count: number) =>
      Array.from({ length: count }, (_, k) => {
        const d = new Date(Date.UTC(2026, 0, 5 + k * 7)); // Mondays from Jan 5
        return d.toISOString().slice(0, 10);
      });
    expect(ids({ ...i, entries: walks(weekDays(30)) })).not.toContain('yearly:movement_weeks:2026');
    expect(ids({ ...i, yearlyWeeksGoal: 20, entries: walks(weekDays(19)) })).not.toContain(
      'yearly:movement_weeks:2026',
    );
    expect(ids({ ...i, yearlyWeeksGoal: 20, entries: walks(weekDays(20)) })).toContain(
      'yearly:movement_weeks:2026',
    );
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
      dailyMovementMinutes: 10,
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
