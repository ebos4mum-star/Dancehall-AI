import { afterAll, describe, expect, it } from 'vitest';
import {
  activeDaySet,
  BADGE_IDS,
  computeGamification,
  DEFAULT_GM_PREFS,
  type BadgeId,
  type GmInput,
} from '@dancehall/shared';
import {
  activityEventsOf,
  badgeMilestones,
  firstRecordDay,
  historyIsComplete,
  badgeDayAnalysis,
  restSubsets,
  SETTING_DEPENDENCE,
  streakReachDays,
  recordsUpTo,
  WINDOW_DAYS,
  xpHistory,
  BADGE_XP,
} from './history';
import { cleanRecorded } from './prefs';
import { diffRewards, EMPTY_SEEN, snapshotOf } from './rewards';

// TEST-ONLY speed-up. The shared `localDateKey` builds a new Intl.DateTimeFormat on every call and the engine calls it thousands of times per computation, so replaying the engine
// day by day for the cross-checks below takes minutes. Reusing one formatter per locale and options gives the identical result about 8x faster (measured: 243 ms to 28 ms for a 60-day
// history). It is applied to this test file only and restored afterwards; the app and the shared engine are unchanged.
const RealDateTimeFormat = Intl.DateTimeFormat;
const formatterCache = new Map<string, Intl.DateTimeFormat>();
(Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = function (
  locales?: string | string[],
  options?: Intl.DateTimeFormatOptions,
) {
  const key = JSON.stringify([locales, options]);
  let f = formatterCache.get(key);
  if (!f) {
    f = new RealDateTimeFormat(locales, options);
    formatterCache.set(key, f);
  }
  return f;
};
afterAll(() => {
  (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = RealDateTimeFormat;
});

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

const dowOf = (k: string) => new Date(`${k}T00:00:00Z`).getUTCDay();
const daysBack = (n: number) => span(0, n - 1);
type Awards = Partial<Record<BadgeId, string>>;
/** Independent of the code under test: the real engine, run on the records known by each day from the first record forward, all badges in one pass. */
const linearAwards = (input: GmInput): Awards => {
  const days = [
    ...input.sessions.map((x) => x.completedAt!.slice(0, 10)),
    ...input.mealLogDays,
    ...input.habitDays.map((h) => h.day),
  ].sort();
  const out: Awards = {};
  for (let d = days[0]!; d <= input.today; d = addDays(d, 1))
    for (const id of computeGamification(recordsUpTo(input, d)).badges) out[id] ??= d;
  return out;
};
const withPrefs = (i: GmInput, p: Partial<GmInput['prefs']>): GmInput => ({
  ...i,
  prefs: { ...i.prefs, ...p },
});
const analyse = (i: GmInput) => {
  const g = computeGamification(i);
  return { g, a: badgeDayAnalysis(i, g.badges, g.events) };
};
/** Mon to Fri active, weekends off: whether the streak survives depends on which weekdays are planned rest days. */
const weekdayOnly = (n: number): GmInput => ({
  ...build({
    workoutDays: daysBack(n).filter((d) => dowOf(d) >= 1 && dowOf(d) <= 5),
    mealDays: [],
    habitDays: [],
  }),
  prefs: { ...DEFAULT_GM_PREFS, restWeekdays: [0, 6] },
});
const LONG = 120_000;

describe('which settings a badge date depends on (checked against the real engine)', () => {
  const everyDay = build(daily(24));
  const sparse = build({
    workoutDays: daysBack(26).filter((_, k) => k % 3 !== 0),
    mealDays: daysBack(26).filter((_, k) => k % 2 === 0),
    habitDays: daysBack(26).filter((_, k) => k % 4 === 0),
  });
  const REST_FREE: BadgeId[] = ['level_5', 'level_10', 'quests_10', 'season_finisher'];
  const GOAL_FREE: BadgeId[] = ['streak_7', 'streak_30', 'rest_respected', 'season_finisher'];
  it(
    'level, quest-count and season badges do not move when the rest days change',
    () => {
      for (const i of [everyDay, sparse]) {
        const base = linearAwards(withPrefs(i, { restWeekdays: [0] }));
        for (const rest of [[], [0, 3, 5, 6]]) {
          const other = linearAwards(withPrefs(i, { restWeekdays: rest }));
          for (const id of REST_FREE) expect(other[id], `${id} rest ${rest}`).toBe(base[id]);
        }
      }
    },
    LONG,
  );
  it(
    'streak, rest-respected and season badges do not move when the weekly goal changes',
    () => {
      for (const i of [everyDay, sparse]) {
        const base = linearAwards(withPrefs(i, { targetDaysPerWeek: 3 }));
        for (const goal of [1, 5]) {
          const other = linearAwards(withPrefs(i, { targetDaysPerWeek: goal }));
          for (const id of GOAL_FREE) expect(other[id], `${id} goal ${goal}`).toBe(base[id]);
        }
      }
    },
    LONG,
  );
  it(
    'the streak walk reproduced for fast search equals the engine for several rest-day choices',
    () => {
      for (const i of [everyDay, weekdayOnly(26)]) {
        const active = activeDaySet(i);
        for (const rest of [[], [0, 6], [1, 3, 5]]) {
          const fast = streakReachDays(active, new Set(rest), i.today, [7, 14, 30]);
          const real = linearAwards({ ...i, prefs: { ...i.prefs, restWeekdays: rest } });
          expect(fast[7] ?? undefined, `rest ${rest} streak_7`).toBe(real.streak_7);
          expect(fast[30] ?? undefined, `rest ${rest} streak_30`).toBe(real.streak_30);
          if (rest.length > 0) expect(fast[14] ?? undefined).toBe(real.rest_respected);
        }
      }
    },
    LONG,
  );
  it(
    'weekly-goal badge days worked out from the engine events equal real engine replays, for every goal',
    () => {
      for (const i of [everyDay, sparse]) {
        const g = computeGamification(i);
        for (const goal of [1, 2, 3, 4, 5]) {
          const real = linearAwards(withPrefs(i, { targetDaysPerWeek: goal }));
          const mine = badgeDayAnalysis(
            withPrefs(i, { targetDaysPerWeek: goal }),
            [...BADGE_IDS],
            g.events,
          );
          for (const id of ['level_5', 'level_10', 'quests_10', 'season_finisher'] as const)
            expect(mine[id]?.day, `${id} goal ${goal}`).toBe(real[id]);
        }
      }
    },
    LONG,
  );
  it(
    'a lower weekly goal never makes a badge later, and a higher one never earlier (the bound the estimate relies on)',
    () => {
      const g = computeGamification(sparse);
      for (const id of ['level_5', 'quests_10'] as const) {
        const days = [1, 2, 3, 4, 5].map(
          (goal) =>
            badgeDayAnalysis(withPrefs(sparse, { targetDaysPerWeek: goal }), [id], g.events)[id]
              ?.day ?? null,
        );
        const real = days.filter((d): d is string => d !== null);
        for (let k = 1; k < real.length; k++) expect(real[k]! >= real[k - 1]!).toBe(true);
        const firstNull = days.indexOf(null);
        if (firstNull >= 0) expect(days.slice(firstNull).every((d) => d === null)).toBe(true);
      }
    },
    LONG,
  );
});

describe('badge dates: exact only when no setting could change them', () => {
  const robust = build(daily(24));
  const { g: gR, a: aR } = analyse(robust);

  it('a history where no rest day or goal matters gives exact dates, and they are the real first-award days', () => {
    expect(gR.badges).toContain('streak_7');
    const s7 = aR.streak_7!;
    expect(s7.exact).toBe(true);
    expect(s7.from).toBe(s7.day);
    expect(s7.to).toBe(s7.day);
  });
  it(
    'exact really means exact: no weekly goal and no rest-day choice moves it (checked on the real engine)',
    () => {
      const exactIds = (Object.keys(aR) as BadgeId[]).filter((id) => aR[id]!.exact);
      expect(exactIds.length).toBeGreaterThan(0);
      for (const goal of [1, 5]) {
        const real = linearAwards(withPrefs(robust, { targetDaysPerWeek: goal }));
        for (const id of exactIds) expect(real[id], `${id} goal ${goal}`).toBe(aR[id]!.day);
      }
      for (const rest of [[], [0, 6]]) {
        const real = linearAwards(withPrefs(robust, { restWeekdays: rest }));
        for (const id of exactIds)
          if (id !== 'rest_respected' || rest.length)
            expect(real[id], `${id} rest ${rest}`).toBe(aR[id]!.day);
      }
    },
    LONG,
  );
  it('a date that depends on rest days is NOT exact: it carries the range and what it depends on', () => {
    const i = weekdayOnly(21);
    const { g, a: an } = analyse(i);
    expect(g.badges).toContain('streak_7');
    const a = an.streak_7!;
    expect(a.exact).toBe(false);
    expect(a.dependsOn).toBe('rest days');
    expect(a.from <= a.day && a.day <= a.to).toBe(true);
    expect(a.to).toBe(i.today); // with no planned rest days the run would never have reached 7
    const m = badgeMilestones({
      badges: g.badges,
      analysis: { streak_7: a },
      complete: true,
      recorded: {},
      maxSpreadDays: 100,
    });
    const s = m.find((x) => x.id === 'streak_7')!;
    expect(s.basis).toBe('estimated');
    expect(s.day).toBe(a.day);
    expect(s.range).toEqual({ from: a.from, to: a.to });
    expect(s.dependsOn).toBe('rest days');
  });
  it('an estimate whose range is too wide becomes "earlier" with no date', () => {
    const i = weekdayOnly(50);
    const { g, a: an } = analyse(i);
    const a = an.streak_7!;
    const wide = Math.round(
      (Date.parse(`${a.to}T00:00:00Z`) - Date.parse(`${a.from}T00:00:00Z`)) / DAY,
    );
    expect(wide).toBeGreaterThan(14);
    const m = badgeMilestones({
      badges: g.badges.filter((b) => b === 'streak_7'),
      analysis: { streak_7: a },
      complete: true,
      recorded: {},
    });
    expect(m[0]).toEqual({ id: 'streak_7', basis: 'earlier', day: null });
    // the same badge with a wide enough limit would be an estimate, so the limit (not the data) is what decides
    expect(
      badgeMilestones({
        badges: ['streak_7'],
        analysis: { streak_7: a },
        complete: true,
        recorded: {},
        maxSpreadDays: wide,
      })[0]!.basis,
    ).toBe('estimated');
  });
  it(
    'weekly-goal badges: the range comes from the lowest and highest goal and contains the date at every goal',
    () => {
      const i = build({
        workoutDays: daysBack(30).filter((_, k) => k % 3 !== 0),
        mealDays: daysBack(30),
        habitDays: [],
      });
      const { g, a: an } = analyse(i);
      let checked = 0;
      for (const id of ['level_5', 'quests_10'] as const) {
        if (!g.badges.includes(id)) continue;
        const a = an[id]!;
        checked += 1;
        expect(a.dependsOn).toBe('weekly goal');
        expect(a.from <= a.day && a.day <= a.to).toBe(true);
        for (const goal of [1, 2, 3, 4, 5]) {
          const d = linearAwards(withPrefs(i, { targetDaysPerWeek: goal }))[id] ?? i.today;
          expect(d >= a.from && d <= a.to, `${id} goal ${goal}`).toBe(true);
        }
      }
      expect(checked).toBeGreaterThan(0);
    },
    LONG,
  );
  it('the season badge never depends on a setting', () => {
    expect(SETTING_DEPENDENCE.season_finisher).toBeNull();
    const i = build({ workoutDays: span(0, 30), mealDays: [], habitDays: [] });
    const { g, a: an } = analyse(i);
    if (g.badges.includes('season_finisher'))
      expect(an.season_finisher).toMatchObject({ exact: true, dependsOn: null });
  });
  it('the work is small enough to run on a phone while drawing the screen (a 60-day history, no engine replays)', () => {
    const i = build(daily(59));
    const g = computeGamification(i);
    const t0 = Date.now();
    badgeDayAnalysis(i, g.badges, g.events);
    const ms = Date.now() - t0;
    console.info(`badgeDayAnalysis, ${g.badges.length} badges, 60-day history: ${ms} ms`);
    expect(ms).toBeLessThan(300);
  });
});

describe('history completeness and first records', () => {
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
});

describe('the timeline order of certainty', () => {
  const exact = {
    day: '2026-11-05',
    from: '2026-11-05',
    to: '2026-11-05',
    exact: true,
    dependsOn: null,
  } as const;
  const soft = {
    day: '2026-11-08',
    from: '2026-11-06',
    to: '2026-11-12',
    exact: false,
    dependsOn: 'rest days',
  } as const;
  it('exact beats recorded; recorded beats an estimate; an estimate beats nothing', () => {
    const m = badgeMilestones({
      badges: ['level_5', 'streak_7', 'streak_30', 'level_10'],
      analysis: { level_5: exact, streak_7: soft, streak_30: soft },
      complete: true,
      recorded: { level_5: '2026-11-14', streak_7: '2026-11-10' },
    });
    const by = (id: string) => m.find((x) => x.id === id)!;
    expect(by('level_5')).toMatchObject({ basis: 'qualified', day: '2026-11-05' });
    expect(by('streak_7')).toMatchObject({ basis: 'recorded', day: '2026-11-10' });
    expect(by('streak_30')).toMatchObject({ basis: 'estimated', day: '2026-11-08' });
    expect(by('level_10')).toEqual({ id: 'level_10', basis: 'earlier', day: null });
  });
  it('recorded dates are preserved when the history is incomplete (no analysis is trusted)', () => {
    const m = badgeMilestones({
      badges: ['streak_7', 'level_5'],
      analysis: { streak_7: exact, level_5: soft },
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
  it('dated rows come first (newest first); undated rows last', () => {
    const m = badgeMilestones({
      badges: ['level_5', 'streak_7', 'streak_30'],
      analysis: {
        level_5: { ...exact, day: '2026-10-01', from: '2026-10-01', to: '2026-10-01' },
        streak_7: { ...exact, day: '2026-10-20', from: '2026-10-20', to: '2026-10-20' },
      },
      complete: true,
      recorded: {},
    });
    expect(m.map((x) => x.id)).toEqual(['streak_7', 'level_5', 'streak_30']);
  });
  it('only "earlier" is undated; every other basis carries a real day; only "estimated" has a range', () => {
    const recs: Record<string, string>[] = [{}, { streak_7: '2026-11-01', level_5: '2026-11-02' }];
    for (const complete of [true, false])
      for (const an of [null, { streak_7: exact, streak_30: soft }])
        for (const rec of recs) {
          const m = badgeMilestones({
            badges: ['streak_7', 'streak_30', 'level_5', 'level_10'],
            analysis: an,
            complete,
            recorded: rec,
          });
          for (const x of m) {
            if (x.basis === 'earlier') expect(x.day).toBeNull();
            else expect(x.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(x.range !== undefined).toBe(x.basis === 'estimated');
          }
        }
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
      analysis: null,
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

describe('rest-day subsets', () => {
  it('are every choice the engine allows: 0 to 4 weekdays, 99 in total, no duplicates', () => {
    const all = restSubsets();
    expect(all).toHaveLength(99);
    expect(new Set(all.map((r) => r.join(','))).size).toBe(99);
    expect(all.every((r) => r.length <= 4 && r.every((d) => d >= 0 && d <= 6))).toBe(true);
  });
});
