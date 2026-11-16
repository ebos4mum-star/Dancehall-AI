import { describe, expect, it } from 'vitest';
import {
  calendarCells,
  compareWeeks,
  dailyMinutes,
  describeSeries,
  durationTrend,
  lastDays,
  monthlySessions,
  niceMax,
  nutritionDays,
  nutritionSeries,
  tableRows,
  weeklyMinutes,
  xpSeries,
  type SessionLike,
} from './data';

const TODAY = '2026-06-17'; // a Wednesday
const s = (day: string, minutes: number, extra: Partial<SessionLike> = {}): SessionLike => ({
  status: 'completed',
  completedAt: `${day}T10:00:00Z`,
  durationS: minutes * 60,
  minutes,
  ...extra,
});

describe('activity series use only recorded sessions', () => {
  it('with no sessions every day is a real zero and the description says nothing was recorded for the rest', () => {
    const d = dailyMinutes([], TODAY, 'UTC');
    expect(d).toHaveLength(7);
    expect(d.every((p) => p.value === 0 && p.note === 'nothing recorded')).toBe(true);
    expect(d[6]!.key).toBe(TODAY);
  });
  it('sums minutes per day, ignores planned and skipped sessions, and counts sessions', () => {
    const d = dailyMinutes(
      [
        s('2026-06-17', 20),
        s('2026-06-17', 10),
        { status: 'planned', completedAt: null, durationS: null, minutes: 30 },
        { status: 'skipped', completedAt: null, durationS: null, minutes: 30 },
      ],
      TODAY,
      'UTC',
    );
    expect(d[6]).toMatchObject({ value: 30, note: '2 sessions' });
  });
  it('weeks start Monday and group correctly across the week boundary', () => {
    const w = weeklyMinutes(
      [s('2026-06-14', 30), s('2026-06-15', 40), s('2026-06-17', 20)],
      TODAY,
      'UTC',
      3,
    ); // Sun 14 is last week
    expect(w.map((p) => p.value)).toEqual([0, 30, 60]);
    expect(w[2]!.key).toBe('2026-06-15');
  });
  it('months count sessions and cross a year boundary', () => {
    const m = monthlySessions(
      [s('2026-01-05', 20), s('2025-12-20', 20), s('2025-12-21', 20)],
      '2026-01-10',
      'UTC',
      3,
    );
    expect(m.map((p) => [p.label, p.value])).toEqual([
      ['Nov', 0],
      ['Dec', 2],
      ['Jan', 1],
    ]);
  });
  it('duration trend returns only the sessions that exist, oldest first, up to n', () => {
    expect(durationTrend([], 'UTC')).toEqual([]);
    const t = durationTrend(
      [s('2026-06-10', 30), s('2026-06-12', 45), s('2026-06-11', 20)],
      'UTC',
      2,
    );
    expect(t.map((p) => p.value)).toEqual([20, 45]);
  });
  it('respects the person’s time zone for the day a session belongs to', () => {
    const late = s('2026-06-17', 20, { completedAt: '2026-06-17T23:30:00Z' }); // 07:30 on the 18th in Singapore
    expect(dailyMinutes([late], '2026-06-18', 'Asia/Singapore')[6]!.value).toBe(20);
    expect(dailyMinutes([late], '2026-06-17', 'UTC')[6]!.value).toBe(20);
  });
});

describe('nutrition series never turn "not logged" into zero', () => {
  const log = (day: string, kcal: number, protein = 20) => ({
    loggedAt: `${day}T12:00:00Z`,
    items: [{ kcal, proteinG: protein, carbsG: 10, fatG: 5 }],
  });
  it('unlogged days are null, logged days are summed', () => {
    const days = nutritionDays(
      [log('2026-06-17', 500), log('2026-06-17', 300, 10), log('2026-06-15', 700)],
      TODAY,
      'UTC',
      7,
    );
    expect(days.find((d) => d.day === '2026-06-16')!.kcal).toBeNull();
    expect(days[6]).toMatchObject({ kcal: 800, proteinG: 30, meals: 2 });
    expect(nutritionSeries(days, 'kcal').filter((p) => p.value === null)).toHaveLength(5);
  });
  it('week comparison averages only logged days, says how many, and refuses to compare thin weeks', () => {
    const logs = [
      ...['2026-06-17', '2026-06-16', '2026-06-15'].map((d) => log(d, 2000)),
      ...['2026-06-10', '2026-06-09', '2026-06-08'].map((d) => log(d, 1000)),
    ];
    const c = compareWeeks(nutritionDays(logs, TODAY, 'UTC', 14), 'kcal');
    expect(c).toEqual({
      thisWeek: { loggedDays: 3, avg: 2000 },
      lastWeek: { loggedDays: 3, avg: 1000 },
      comparable: true,
    });
    const thin = compareWeeks(
      nutritionDays([log('2026-06-17', 2000), ...logs.slice(3)], TODAY, 'UTC', 14),
      'kcal',
    );
    expect(thin.comparable).toBe(false);
    expect(compareWeeks(nutritionDays([], TODAY, 'UTC', 14), 'kcal').thisWeek.avg).toBeNull();
  });
});

describe('XP and calendar', () => {
  it('cumulative XP never goes down and starts from what was earned before the window', () => {
    const x = xpSeries(
      [
        { day: '2026-05-01', xp: 100 },
        { day: '2026-06-10', xp: 30 },
        { day: '2026-06-17', xp: 5 },
      ],
      TODAY,
      10,
    );
    const v = x.map((p) => p.value!);
    expect(v[0]).toBe(100);
    expect(v.every((n, i) => i === 0 || n >= v[i - 1]!)).toBe(true);
    expect(v[v.length - 1]).toBe(135);
    expect(x[x.length - 1]!.note).toBe('+5 XP');
  });
  it('the calendar has weeks x 7 cells, Monday first, planned rest days are calm and today is never "missed"', () => {
    const cells = calendarCells(new Set(['2026-06-15']), [0], TODAY, 2);
    expect(cells).toHaveLength(14);
    expect(cells[0]!.key).toBe('2026-06-08');
    expect(cells.find((c) => c.key === '2026-06-15')!.state).toBe('active');
    expect(cells.find((c) => c.key === '2026-06-14')!.state).toBe('rest'); // Sunday
    expect(cells.find((c) => c.key === '2026-06-17')!.state).toBe('today');
    expect(cells.find((c) => c.key === '2026-06-18')!.state).toBe('future');
    expect(cells.find((c) => c.key === '2026-06-12')!.state).toBe('missed');
  });
});

describe('words for every chart', () => {
  it('describes recorded data with highest, latest and gaps, and says plainly when there is none', () => {
    const pts = dailyMinutes([s('2026-06-16', 40), s('2026-06-17', 20)], TODAY, 'UTC');
    const d = describeSeries('Active minutes, last 7 days', pts, 'min', { zeroMeansNone: true });
    expect(d).toMatch(/Highest: 40 min \(Tuesday 16 June\)/);
    expect(d).toMatch(/Latest: 20 min/);
    expect(d).toMatch(/5 with none/);
    expect(describeSeries('x', [], 'min')).toBe('x. Nothing has been recorded yet.');
    expect(
      describeSeries('x', nutritionSeries(nutritionDays([], TODAY, 'UTC', 3), 'kcal'), 'kcal'),
    ).toMatch(/Nothing has been recorded yet/);
  });
  it('the table lists every point and marks gaps as "nothing recorded"', () => {
    const rows = tableRows(nutritionSeries(nutritionDays([], TODAY, 'UTC', 2), 'kcal'), 'kcal');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/nothing recorded/);
  });
  it('axis tops are friendly and never zero', () => {
    expect([
      niceMax([]),
      niceMax([0]),
      niceMax([3]),
      niceMax([37]),
      niceMax([420, null]),
      niceMax([1700]),
    ]).toEqual([1, 1, 3, 50, 500, 2000]);
    expect(lastDays(TODAY, 3)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });
});
