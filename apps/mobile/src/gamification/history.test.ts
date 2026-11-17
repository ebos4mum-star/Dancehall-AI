import { describe, expect, it } from 'vitest';
import { computeGamification, DEFAULT_GM_PREFS, type GmInput } from '@dancehall/shared';
import {
  activityEventsOf,
  badgeMilestones,
  firstRecordDay,
  historyIsComplete,
  qualifiedBadgeDays,
  recordsUpTo,
  WINDOW_DAYS,
  xpHistory,
  BADGE_XP,
} from './history';
import { cleanRecorded } from './prefs';
import { diffRewards, EMPTY_SEEN, snapshotOf } from './rewards';

const TODAY = '2026-11-16';
const DAY = 86_400_000;
const addDays = (k: string, n: number) =>
  new Date(Date.parse(`${k}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

interface Rec {
  workoutDays: string[];
  mealDays: string[];
  habitDays: string[];
  minutes?: number;
  extra?: GmInput['sessions'];
}
const build = (r: Rec, today = TODAY): GmInput => ({
  today,
  timeZone: 'UTC',
  sessions: [
    ...r.workoutDays.map((d, k) => ({
      id: `s${d}-${k}`,
      status: 'completed',
      completedAt: `${d}T09:00:00.000Z`,
      durationS: (r.minutes ?? 30) * 60,
      minutes: r.minutes ?? 30,
      source: 'manual',
      style: k % 2 ? 'strength' : 'dance',
      lowImpact: false,
      workoutId: null,
      title: 'x',
    })),
    ...(r.extra ?? []),
  ],
  mealLogDays: r.mealDays,
  habitDays: r.habitDays.map((day) => ({ day, habitId: 'h1' })),
  activeHabitCount: r.habitDays.length ? 1 : 0,
  prefs: { ...DEFAULT_GM_PREFS, restWeekdays: [0] },
});
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => addDays(TODAY, -(to - k)));
/** Records for days (today - back)..today, every day. */
const daily = (back: number, mealBack = 75): Rec => ({
  workoutDays: span(0, back),
  mealDays: span(0, Math.min(back, mealBack)),
  habitDays: [],
});
const upTo = recordsUpTo;
const histOf = (i: GmInput, opts: Partial<Parameters<typeof xpHistory>[0]> = {}) => {
  const g = computeGamification(i);
  const events = activityEventsOf(g.events);
  return {
    g,
    h: xpHistory({
      events,
      today: i.today,
      confirmedTotalXp: g.totalXp,
      badgeCount: g.badges.length,
      ...opts,
    }),
  };
};
const lastValue = (pts: { value: number | null }[]) => pts[pts.length - 1]!.value!;

describe('XP history accuracy', () => {
  it('ends at exactly the engine total minus badge bonuses, and its daily values add up to the window XP', () => {
    for (const back of [5, 20, 45, 59]) {
      const { g, h } = histOf(build(daily(back)));
      expect(lastValue(h.total) + h.badgeXp).toBe(g.totalXp);
      const sumDaily = h.daily.reduce((a, p) => a + (p.value ?? 0), 0);
      expect(sumDaily).toBe(h.windowXp);
      expect(h.badgeXp).toBe(g.badges.length * BADGE_XP);
    }
  });
  it('the running total never goes down and daily values are never negative', () => {
    const { h } = histOf(build(daily(100)));
    const vals = h.total.map((p) => p.value!);
    for (let k = 1; k < vals.length; k++) expect(vals[k]!).toBeGreaterThanOrEqual(vals[k - 1]!);
    expect(h.daily.every((p) => (p.value ?? 0) >= 0)).toBe(true);
  });
  it('badge XP is never placed on a day (the engine stamps it with the computation day)', () => {
    const { g, h } = histOf(build(daily(59)));
    expect(g.badges.length).toBeGreaterThan(0);
    const todayGain = g.events.filter((e) => e.day === TODAY).reduce((a, e) => a + e.xp, 0);
    const todayShown = h.daily[h.daily.length - 1]!.value!;
    expect(todayGain - todayShown).toBe(g.badges.length * BADGE_XP);
  });
  it('uses the engine events for the right days: a workout on one day shows on that day only', () => {
    const day = addDays(TODAY, -10);
    const { h } = histOf(build({ workoutDays: [day], mealDays: [], habitDays: [] }));
    const p = h.daily.find((x) => x.key === day)!;
    // 30 XP for the workout, plus that day's "move 10 minutes" quest (10 XP) when the engine picked it that day.
    expect(p.value).toBeGreaterThanOrEqual(30);
    expect(p.value).toBeLessThanOrEqual(30 + 10 * 3);
    expect(h.daily.filter((x) => (x.value ?? 0) > 0)).toHaveLength(1);
  });
});

describe('partial historical coverage', () => {
  it('older XP is not charted by day: it is the starting total, and the page says so', () => {
    const { g, h } = histOf(build(daily(120)));
    expect(h.state).toBe('partial');
    expect(h.earlierXp).toBeGreaterThan(0);
    expect(h.total[0]!.value).toBe(h.earlierXp + (h.daily[0]!.value ?? 0));
    expect(lastValue(h.total) + h.badgeXp).toBe(g.totalXp);
    expect(h.notes.join(' ')).toMatch(/last 60 days/);
    expect(h.notes.join(' ')).toMatch(/not shown day by day/);
    expect(h.windowStart).toBe(addDays(TODAY, -(WINDOW_DAYS - 1)));
  });
  it('XP the server has but this phone has no records for is included in the start and explained, never spread over days', () => {
    const i = build(daily(30));
    const g = computeGamification(i);
    const h = xpHistory({
      events: activityEventsOf(g.events),
      today: TODAY,
      confirmedTotalXp: g.totalXp + 400,
      badgeCount: g.badges.length,
    });
    expect(h.state).toBe('partial');
    expect(h.earlierXp).toBe(400);
    expect(lastValue(h.total) + h.badgeXp).toBe(g.totalXp + 400);
    expect(h.daily.reduce((a, p) => a + (p.value ?? 0), 0)).toBe(h.windowXp);
  });
  it('a young account starts at its first record, with a gap before it (no invented zeros, no padding)', () => {
    const { h } = histOf(build(daily(9)));
    expect(h.state).toBe('young');
    const gaps = h.total.filter((p) => p.value === null).length;
    expect(gaps).toBe(WINDOW_DAYS - 10);
    expect(
      h.total.filter((p) => p.value === null).every((p) => p.note === 'before your first record'),
    ).toBe(true);
    expect(h.notes.join(' ')).toMatch(/History starts on/);
  });
  it('an account with no XP yet is empty and has no notes about gaps', () => {
    const { h } = histOf(build({ workoutDays: [], mealDays: [], habitDays: [] }));
    expect(h.state).toBe('empty');
    expect(h.windowXp).toBe(0);
  });
  it('a record exactly at the window start leaves no gap', () => {
    const start = addDays(TODAY, -(WINDOW_DAYS - 1));
    const { h } = histOf(build({ workoutDays: [start, TODAY], mealDays: [], habitDays: [] }));
    expect(h.total.every((p) => p.value !== null)).toBe(true);
  });
});

describe('offline and delayed synchronization', () => {
  it('a server total behind this phone is shown as syncing and charts what is recorded here', () => {
    const i = build(daily(20));
    const g = computeGamification(i);
    const h = xpHistory({
      events: activityEventsOf(g.events),
      today: TODAY,
      confirmedTotalXp: g.totalXp - 90,
      badgeCount: g.badges.length,
      pending: true,
    });
    expect(h.state).toBe('syncing');
    expect(h.notes.join(' ')).toMatch(/still syncing/);
    expect(lastValue(h.total) + h.badgeXp).toBe(g.totalXp);
  });
  it('no confirmed total (offline, not loaded) charts only local records and says so', () => {
    const i = build(daily(20));
    const g = computeGamification(i);
    const h = xpHistory({
      events: activityEventsOf(g.events),
      today: TODAY,
      confirmedTotalXp: null,
      badgeCount: 0,
    });
    expect(h.state).toBe('offline');
    expect(h.notes.join(' ')).toMatch(/only what is recorded on this phone/);
  });
  it('a late import (a workout from 20 days ago saved today) lands on the day it happened, never on the day it arrived', () => {
    const before = histOf(build({ workoutDays: span(0, 5), mealDays: [], habitDays: [] }));
    const lateDay = addDays(TODAY, -20);
    const after = histOf(
      build({
        workoutDays: span(0, 5),
        mealDays: [],
        habitDays: [],
        extra: [
          {
            id: 'ah-1',
            status: 'completed',
            completedAt: `${lateDay}T07:00:00.000Z`,
            durationS: 1800,
            minutes: 30,
            source: 'apple_health',
            style: 'run',
            lowImpact: false,
            workoutId: null,
            title: 'Apple Health: Run',
          },
        ],
      }),
    );
    const at = (r: typeof after, d: string) => r.h.daily.find((p) => p.key === d)!.value;
    // The workout (30 XP) lands on its own day. The engine also completes that day's quest retroactively, so the day can gain quest XP too.
    expect(at(after, lateDay)! - (at(before, lateDay) ?? 0)).toBeGreaterThanOrEqual(30);
    expect(at(after, TODAY)).toBe(at(before, TODAY));
    expect(lastValue(after.h.total)).toBeGreaterThanOrEqual(lastValue(before.h.total) + 30);
  });
  it('is deterministic: the same records give the same history', () => {
    const i = build(daily(40));
    expect(histOf(i).h).toEqual(histOf(i).h);
  });
});

describe('badge dates', () => {
  const full = build(daily(59));
  const g = computeGamification(full);
  const q = qualifiedBadgeDays(full, g.badges);

  it('every qualified date is the exact day the engine first awards that badge (replayed on the records up to that day)', () => {
    const awarded = Object.keys(q) as Array<keyof typeof q>;
    expect(awarded.length).toBeGreaterThanOrEqual(3);
    for (const id of awarded) {
      const d = q[id]!;
      expect(computeGamification(upTo(full, d)).badges).toContain(id);
      expect(computeGamification(upTo(full, addDays(d, -1))).badges).not.toContain(id);
    }
  });
  it('streak and level dates are plausible and ordered (7-day streak before the 30-day streak)', () => {
    expect(q.streak_7 && q.streak_30 && q.streak_7 < q.streak_30).toBe(true);
    expect(q.level_5).toBeTruthy();
  });
  it('history that starts before the window, or does not match the confirmed total, is not complete', () => {
    const base = { today: TODAY, localActivityXp: 500, confirmedActivityXp: 500 };
    expect(historyIsComplete({ ...base, firstRecord: addDays(TODAY, -10) })).toBe(true);
    expect(historyIsComplete({ ...base, firstRecord: addDays(TODAY, -(WINDOW_DAYS - 1)) })).toBe(
      true,
    );
    expect(historyIsComplete({ ...base, firstRecord: addDays(TODAY, -WINDOW_DAYS) })).toBe(false);
    expect(historyIsComplete({ ...base, firstRecord: null })).toBe(false);
    expect(
      historyIsComplete({ ...base, firstRecord: addDays(TODAY, -5), confirmedActivityXp: 600 }),
    ).toBe(false);
    expect(
      historyIsComplete({ ...base, firstRecord: addDays(TODAY, -5), confirmedActivityXp: 400 }),
    ).toBe(false);
    expect(
      historyIsComplete({ ...base, firstRecord: addDays(TODAY, -5), confirmedActivityXp: null }),
    ).toBe(false);
  });
  it('the first record day comes from workouts, meals and habits', () => {
    const i = build({
      workoutDays: [addDays(TODAY, -3)],
      mealDays: [addDays(TODAY, -8)],
      habitDays: [addDays(TODAY, -5)],
    });
    expect(firstRecordDay(i, [addDays(TODAY, -3)])).toBe(addDays(TODAY, -8));
    expect(firstRecordDay(build({ workoutDays: [], mealDays: [], habitDays: [] }), [])).toBe(null);
  });

  it('complete history shows qualified dates', () => {
    const m = badgeMilestones({ badges: g.badges, qualified: q, complete: true, recorded: {} });
    expect(m.every((x) => x.basis === 'qualified' && x.day)).toBe(true);
  });
  it('incomplete history IGNORES candidate dates: nothing is qualified', () => {
    const m = badgeMilestones({ badges: g.badges, qualified: q, complete: false, recorded: {} });
    expect(m.every((x) => x.basis === 'earlier' && x.day === null)).toBe(true);
  });
  it('a recorded date is used only when no qualified date is trusted, and is labelled recorded', () => {
    const m = badgeMilestones({
      badges: ['streak_7', 'level_5'],
      qualified: q,
      complete: false,
      recorded: { streak_7: '2026-11-10' },
    });
    expect(m.find((x) => x.id === 'streak_7')).toEqual({
      id: 'streak_7',
      basis: 'recorded',
      day: '2026-11-10',
    });
    expect(m.find((x) => x.id === 'level_5')).toEqual({
      id: 'level_5',
      basis: 'earlier',
      day: null,
    });
  });
  it('unknown dates are never invented: "earlier" never carries a day, whatever the inputs', () => {
    for (const complete of [true, false])
      for (const withQ of [true, false])
        for (const withR of [true, false]) {
          const m = badgeMilestones({
            badges: g.badges,
            qualified: withQ ? q : null,
            complete,
            recorded: withR ? { streak_7: '2026-11-01' } : {},
          });
          for (const x of m) if (x.basis === 'earlier') expect(x.day).toBeNull();
          for (const x of m)
            if (x.basis !== 'earlier') expect(x.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
  });
  it('dated items come first, newest first; undated last', () => {
    const m = badgeMilestones({
      badges: ['level_5', 'streak_7', 'streak_30'],
      qualified: { level_5: '2026-10-01', streak_7: '2026-10-20' },
      complete: true,
      recorded: {},
    });
    expect(m.map((x) => x.id)).toEqual(['streak_7', 'level_5', 'streak_30']);
  });
});

describe('the first sync is never an achievement date', () => {
  const snap = (badges: string[]) =>
    snapshotOf({
      totalXp: 500,
      level: { level: 3 },
      streak: { current: 8 },
      badges: badges as never,
      cosmetics: [],
      dailyQuests: [],
      weeklyQuests: [],
      seasonal: { id: 'harvest-2026', done: false },
    });
  it('badges present at the phone baseline get no recorded date (so they show as earlier, not as the first-sync day)', () => {
    const d1 = diffRewards(snap(['streak_7', 'level_5']), EMPTY_SEEN, TODAY);
    expect(d1.seen.baselined).toBe(true);
    expect(d1.seen.badgeRecorded).toEqual({});
    const m = badgeMilestones({
      badges: ['streak_7', 'level_5'],
      qualified: null,
      complete: false,
      recorded: d1.seen.badgeRecorded,
    });
    expect(m.every((x) => x.basis === 'earlier' && x.day === null)).toBe(true);
  });
  it('a badge that appears later is recorded on the day this phone first saw it, once', () => {
    const base = diffRewards(snap(['level_5']), EMPTY_SEEN, '2026-11-01').seen;
    const next = diffRewards(snap(['level_5', 'streak_7']), base, '2026-11-10');
    expect(next.seen.badgeRecorded).toEqual({ streak_7: '2026-11-10' });
    const again = diffRewards(snap(['level_5', 'streak_7']), next.seen, '2026-11-15');
    expect(again.seen.badgeRecorded).toEqual({ streak_7: '2026-11-10' });
  });
  it('a badge removed and returned keeps its first recorded day', () => {
    const base = diffRewards(snap([]), EMPTY_SEEN, '2026-11-01').seen;
    const a = diffRewards(snap(['streak_7']), base, '2026-11-05').seen;
    const gone = diffRewards(snap([]), a, '2026-11-08').seen;
    const back = diffRewards(snap(['streak_7']), gone, '2026-11-12').seen;
    expect(back.badgeRecorded.streak_7).toBe('2026-11-05');
  });
  it('saved data is cleaned: only real badge ids with real dates survive', () => {
    expect(
      cleanRecorded({
        streak_7: '2026-11-10',
        nope: '2026-11-10',
        level_5: 'yesterday',
        level_10: 5,
      }),
    ).toEqual({ streak_7: '2026-11-10' });
    expect(cleanRecorded(null)).toEqual({});
    expect(cleanRecorded(['streak_7'])).toEqual({});
  });
});

describe('weekly quest dating is disclosed', () => {
  it('weekly quest XP is flagged and the chart says it is shown on the last day of its week', () => {
    const { h } = histOf(build(daily(59)));
    expect(h.notes.join(' ')).toMatch(/Weekly quest XP is shown on the last day of its week/);
  });
  it('no weekly quest in the window, no such note', () => {
    const { h } = histOf(build({ workoutDays: [addDays(TODAY, -2)], mealDays: [], habitDays: [] }));
    expect(h.notes.join(' ')).not.toMatch(/Weekly quest/);
  });
});
