import { describe, expect, it } from 'vitest';
import {
  GM,
  DEFAULT_GM_PREFS,
  computeGamification,
  countedWorkouts,
  leagueStandings,
  levelOf,
  normalizePrefs,
  restNudge,
  seasonFor,
  streakInfo,
  workoutXp,
  xpToReach,
  type GmInput,
  type GmSession,
} from './gamification';

const base = (over: Partial<GmInput> = {}): GmInput => ({
  today: '2026-06-17', // Wednesday
  timeZone: 'UTC',
  sessions: [],
  mealLogDays: [],
  habitDays: [],
  activeHabitCount: 0,
  prefs: DEFAULT_GM_PREFS,
  ...over,
});
let n = 0;
const sess = (day: string, minutes = 20, over: Partial<GmSession> = {}): GmSession => ({
  id: `s${++n}`,
  status: 'completed',
  completedAt: `${day}T10:00:00Z`,
  durationS: minutes * 60,
  minutes,
  source: 'manual',
  ...over,
});

describe('XP and levels', () => {
  it('levels follow the published curve and never go down as XP rises', () => {
    expect([0, 99, 100, 299, 300, 600].map((x) => levelOf(x).level)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(xpToReach(2)).toBe(100);
    let prev = 1;
    for (let x = 0; x <= 200_000; x += 997) {
      const l = levelOf(x).level;
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
    expect(levelOf(1e12).level).toBe(GM.MAX_LEVEL);
    expect(levelOf(Number.NaN).level).toBe(1);
  });
  it('workout XP is capped per workout, and tiny workouts earn nothing', () => {
    expect(workoutXp(4)).toBe(0);
    expect(workoutXp(5)).toBe(5);
    expect(workoutXp(45)).toBe(45);
    expect(workoutXp(600)).toBe(45);
  });
  it('excess exercise is not rewarded: per-day workout count, per-day and per-week caps', () => {
    const many = Array.from({ length: 6 }, () => sess('2026-06-17', 60));
    const s = computeGamification(base({ sessions: many }));
    const day = s.events.filter((e) => e.day === '2026-06-17' && e.kind === 'workout');
    expect(day).toHaveLength(GM.MAX_WORKOUTS_PER_DAY);
    expect(day.reduce((a, e) => a + e.xp, 0)).toBeLessThanOrEqual(GM.DAILY_ACTION_XP_CAP);
    const week = [
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
    ].flatMap((d) => [sess(d, 90), sess(d, 90)]);
    const w = computeGamification(base({ today: '2026-06-21', sessions: week }));
    expect(
      w.events.filter((e) => e.kind === 'workout').reduce((a, e) => a + e.xp, 0),
    ).toBeLessThanOrEqual(GM.WEEKLY_ACTION_XP_CAP);
  });
  it('a very long day shows a rest nudge instead of more reward', () => {
    expect(restNudge(base({ sessions: [sess('2026-06-17', 70), sess('2026-06-17', 70)] }))).toBe(
      true,
    );
    expect(restNudge(base({ sessions: [sess('2026-06-17', 30)] }))).toBe(false);
  });
  it('nothing in the engine takes calories or weight, and a meal log earns the same whatever it holds, once a day', () => {
    const one = computeGamification(base({ mealLogDays: ['2026-06-17'] }));
    const same = computeGamification(
      base({ mealLogDays: ['2026-06-17', '2026-06-17', '2026-06-17'] }),
    );
    expect(one.totalXp).toBe(same.totalXp);
    expect(Object.keys(base())).not.toEqual(
      expect.arrayContaining(['kcal', 'calories', 'weightKg']),
    );
  });
});

describe('duplicate prevention', () => {
  it('replaying the same sessions, or listing one twice, awards once', () => {
    const a = sess('2026-06-17', 30);
    const once = computeGamification(base({ sessions: [a] }));
    const twice = computeGamification(base({ sessions: [a, a, { ...a }] }));
    expect(twice.totalXp).toBe(once.totalXp);
    expect(twice.events.map((e) => e.id).sort()).toEqual(once.events.map((e) => e.id).sort());
    expect(new Set(once.events.map((e) => e.id)).size).toBe(once.events.length);
  });
  it('an Apple Health workout that overlaps an app session is not counted twice', () => {
    const mine = sess('2026-06-17', 30, { completedAt: '2026-06-17T10:30:00Z' });
    const watch = sess('2026-06-17', 31, {
      completedAt: '2026-06-17T10:31:00Z',
      source: 'apple_health',
    });
    expect(countedWorkouts(base({ sessions: [mine, watch] }))).toHaveLength(1);
    const separate = sess('2026-06-17', 30, {
      completedAt: '2026-06-17T18:30:00Z',
      source: 'apple_health',
    });
    expect(countedWorkouts(base({ sessions: [mine, separate] }))).toHaveLength(2);
  });
  it('quest and badge ids are stable, so a quest cannot pay twice', () => {
    const input = base({ sessions: [sess('2026-06-17', 20)] });
    const a = computeGamification(input);
    const b = computeGamification({ ...input, sessions: [...input.sessions] });
    expect(a.events.map((e) => e.id)).toEqual(b.events.map((e) => e.id));
  });
});

describe('streaks, planned rest and forgiveness', () => {
  const days = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13'];
  it('counts active days and a planned rest day neither breaks nor adds', () => {
    const s = streakInfo(base({ today: '2026-06-14', sessions: days.map((d) => sess(d, 15)) })); // Sunday is the default rest day
    expect(s.current).toBe(6);
    expect(s.todayKind).toBe('rest');
    expect(s.isPlannedRestToday).toBe(true);
  });
  it('a day not yet done is open, not missed', () => {
    const s = streakInfo(
      base({ today: '2026-06-17', sessions: ['2026-06-15', '2026-06-16'].map((d) => sess(d, 15)) }),
    );
    expect(s.current).toBe(2);
    expect(s.todayKind).toBe('open');
  });
  it('one unplanned miss in a week is forgiven, a second resets', () => {
    const one = streakInfo(
      base({
        today: '2026-06-19',
        sessions: ['2026-06-15', '2026-06-17', '2026-06-18'].map((d) => sess(d, 15)),
      }),
    );
    expect(one.current).toBe(3);
    const two = streakInfo(
      base({ today: '2026-06-19', sessions: ['2026-06-15', '2026-06-18'].map((d) => sess(d, 15)) }),
    );
    expect(two.current).toBe(1);
  });
  it('a quiet stretch never reduces level or badges already earned', () => {
    const active = Array.from({ length: 10 }, (_, i) =>
      sess(`2026-06-${String(1 + i).padStart(2, '0')}`, 45),
    );
    const early = computeGamification(base({ today: '2026-06-10', sessions: active }));
    const later = computeGamification(base({ today: '2026-06-30', sessions: active }));
    expect(later.totalXp).toBeGreaterThanOrEqual(early.totalXp);
    expect(later.level.level).toBeGreaterThanOrEqual(early.level.level);
  });
  it('preferences are clamped: at most 5 target days and 4 rest days', () => {
    const p = normalizePrefs({ targetDaysPerWeek: 99, restWeekdays: [0, 1, 2, 3, 4, 5, 6, 9, -1] });
    expect(p.targetDaysPerWeek).toBe(5);
    expect(p.restWeekdays).toHaveLength(4);
    expect(normalizePrefs({ targetDaysPerWeek: Number.NaN }).targetDaysPerWeek).toBe(3);
  });
});

describe('quests, badges, seasons, cosmetics and leagues', () => {
  it('three daily quests, the same for the same date, with habit quests only when habits exist', () => {
    const a = computeGamification(base());
    expect(a.dailyQuests).toHaveLength(3);
    expect(a.dailyQuests.map((q) => q.id)).toEqual(
      computeGamification(base()).dailyQuests.map((q) => q.id),
    );
    for (let d = 1; d <= 28; d++) {
      const q = computeGamification(
        base({ today: `2026-06-${String(d).padStart(2, '0')}` }),
      ).dailyQuests;
      expect(q.some((x) => x.id === 'habit_tick')).toBe(false);
    }
  });
  it('completing a quest pays its XP once', () => {
    const q = computeGamification(base({ sessions: [sess('2026-06-17', 20)] }));
    const move = q.dailyQuests.find((x) => x.id === 'move_10');
    if (move) expect(move.done).toBe(true);
    const ids = q.events.filter((e) => e.kind === 'quest').map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('badges unlock from level and streak and are idempotent events', () => {
    const run = Array.from({ length: 9 }, (_, i) =>
      sess(`2026-06-${String(8 + i).padStart(2, '0')}`, 20),
    );
    const s = computeGamification(base({ today: '2026-06-17', sessions: run }));
    expect(s.badges).toContain('streak_7');
    expect(s.events.filter((e) => e.id === 'badge:streak_7')).toHaveLength(1);
  });
  it('seasons are original, cover the whole year, and unlock a cosmetic only when finished', () => {
    for (const d of [
      '2026-01-15',
      '2026-04-10',
      '2026-07-04',
      '2026-10-20',
      '2026-12-31',
      '2027-02-28',
    ]) {
      const s = seasonFor(d);
      expect(s.from <= d && d <= s.to, d).toBe(true);
    }
    const s = computeGamification(base());
    expect(s.cosmetics.filter((c) => c === s.seasonal.season.cosmetic)).toHaveLength(0);
  });
  it('league: capped, ties share a rank, order is by weekly XP then name', () => {
    const r = leagueStandings([
      { username: 'b', weekXp: 50 },
      { username: 'a', weekXp: 50 },
      { username: 'c', weekXp: 9999 },
      { username: 'd', weekXp: Number.NaN },
    ]);
    expect(r.map((x) => x.username)).toEqual(['c', 'a', 'b', 'd']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(r[0]!.weekXp).toBeLessThanOrEqual(GM.WEEKLY_ACTION_XP_CAP + 200);
  });
  it('disabled preference still computes but is flagged off for the UI', () => {
    expect(
      computeGamification(base({ prefs: { ...DEFAULT_GM_PREFS, enabled: false } })).enabled,
    ).toBe(false);
  });
});
