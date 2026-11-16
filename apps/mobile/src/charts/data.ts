import { localDateKey, weekStartOf } from '@dancehall/shared';

/**
 * Chart data, built only from what the person recorded. Rules every builder follows:
 *  - A value is `null` when nothing was recorded (an unlogged food day is NOT a zero-calorie day). Charts draw a gap, never a made-up number.
 *  - Zero is used only where zero is true (no active minutes recorded that day).
 *  - Nothing is estimated, smoothed or extrapolated. Averages use only the days that have data and always say how many days that was.
 *  - Every series can describe itself in words (`describeSeries`) and as rows (`tableRows`), so no chart is the only way to learn something.
 */
export interface ChartPoint {
  key: string;
  /** Short axis label ("Mon", "Nov 10"). */
  label: string;
  /** Full label for a tooltip or a screen reader ("Monday 16 November"). */
  full: string;
  value: number | null;
  /** Optional extra line for the tooltip ("2 sessions"). */
  note?: string;
}

const DAY = 86_400_000;
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dow = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const md = (key: string) => `${MON[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
const mdFull = (key: string) =>
  `${Number(key.slice(8, 10))} ${MON_FULL[Number(key.slice(5, 7)) - 1]}`;

export interface SessionLike {
  status: string;
  completedAt: string | null;
  durationS: number | null;
  minutes: number;
}
const minutesOf = (s: SessionLike) =>
  s.durationS && s.durationS > 0 ? Math.max(1, Math.round(s.durationS / 60)) : s.minutes;
const completed = (sessions: readonly SessionLike[], tz: string | null) =>
  sessions
    .filter(
      (s) =>
        s.status === 'completed' && s.completedAt && Number.isFinite(Date.parse(s.completedAt)),
    )
    .map((s) => ({
      day: localDateKey(s.completedAt!, tz),
      at: s.completedAt!,
      minutes: minutesOf(s),
    }));

/** The last `n` local days, oldest first, ending today. */
export const lastDays = (today: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));

/** Active minutes per day for the last `n` days. Zero means no active minutes were recorded that day. */
export function dailyMinutes(
  sessions: readonly SessionLike[],
  today: string,
  tz: string | null,
  n = 7,
): ChartPoint[] {
  const done = completed(sessions, tz);
  return lastDays(today, n).map((day) => {
    const mine = done.filter((s) => s.day === day);
    return {
      key: day,
      label: WD[dow(day)]!.slice(0, 3),
      full: `${WD_FULL[dow(day)]} ${mdFull(day)}`,
      value: mine.reduce((a, s) => a + s.minutes, 0),
      note: mine.length
        ? `${mine.length} ${mine.length === 1 ? 'session' : 'sessions'}`
        : 'nothing recorded',
    };
  });
}

/** Active minutes per week (weeks start Monday) for the last `weeks` weeks including this one. */
export function weeklyMinutes(
  sessions: readonly SessionLike[],
  today: string,
  tz: string | null,
  weeks = 8,
): ChartPoint[] {
  const done = completed(sessions, tz);
  const thisWeek = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * (weeks - 1 - i))).map(
    (start) => {
      const mine = done.filter((s) => weekStartOf(s.day) === start);
      return {
        key: start,
        label: md(start),
        full: `Week of ${mdFull(start)}`,
        value: mine.reduce((a, s) => a + s.minutes, 0),
        note: `${mine.length} ${mine.length === 1 ? 'session' : 'sessions'}`,
      };
    },
  );
}

/** Sessions per calendar month for the last `months` months including this one. */
export function monthlySessions(
  sessions: readonly SessionLike[],
  today: string,
  tz: string | null,
  months = 6,
): ChartPoint[] {
  const done = completed(sessions, tz);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: months }, (_, i) => {
    const idx = y * 12 + m - (months - 1 - i);
    const yy = Math.floor(idx / 12);
    const mm = idx % 12;
    const prefix = `${yy}-${String(mm + 1).padStart(2, '0')}`;
    const mine = done.filter((s) => s.day.startsWith(prefix));
    return {
      key: prefix,
      label: MON[mm]!,
      full: `${MON_FULL[mm]} ${yy}`,
      value: mine.length,
      note: `${mine.reduce((a, s) => a + s.minutes, 0)} active minutes`,
    };
  });
}

/** How long each of the last `n` completed sessions was, oldest first. Fewer points when fewer sessions exist. */
export function durationTrend(
  sessions: readonly SessionLike[],
  tz: string | null,
  n = 12,
): ChartPoint[] {
  return completed(sessions, tz)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-n)
    .map((s, i) => ({
      key: `${s.at}#${i}`,
      label: md(s.day),
      full: mdFull(s.day),
      value: s.minutes,
    }));
}

export interface FoodLogLike {
  loggedAt: string;
  items: ReadonlyArray<{ kcal: number; proteinG: number; carbsG: number; fatG: number }>;
}
export interface NutritionDay {
  day: string;
  /** null when no meal was logged that day. */
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  meals: number;
}
/** Per-day nutrition totals for the last `n` days. A day with no logged meal is null, not zero. Fibre is not part of the food model, so it is not available here. */
export function nutritionDays(
  logs: readonly FoodLogLike[],
  today: string,
  tz: string | null,
  n = 14,
): NutritionDay[] {
  return lastDays(today, n).map((day) => {
    const mine = logs.filter((l) => localDateKey(l.loggedAt, tz) === day);
    if (mine.length === 0)
      return { day, kcal: null, proteinG: null, carbsG: null, fatG: null, meals: 0 };
    const sum = (f: (i: FoodLogLike['items'][number]) => number) =>
      Math.round(mine.reduce((a, l) => a + l.items.reduce((b, i) => b + f(i), 0), 0));
    return {
      day,
      kcal: sum((i) => i.kcal),
      proteinG: sum((i) => i.proteinG),
      carbsG: sum((i) => i.carbsG),
      fatG: sum((i) => i.fatG),
      meals: mine.length,
    };
  });
}
export type NutritionMetric = 'kcal' | 'proteinG';
export function nutritionSeries(
  days: readonly NutritionDay[],
  metric: NutritionMetric,
): ChartPoint[] {
  return days.map((d) => ({
    key: d.day,
    label: WD[dow(d.day)]!.slice(0, 1),
    full: `${WD_FULL[dow(d.day)]} ${mdFull(d.day)}`,
    value: d[metric],
    note: d.meals ? `${d.meals} ${d.meals === 1 ? 'meal' : 'meals'} logged` : 'no meals logged',
  }));
}

export interface WeekCompare {
  thisWeek: { loggedDays: number; avg: number | null };
  lastWeek: { loggedDays: number; avg: number | null };
  /** Only when BOTH weeks have at least 3 logged days; otherwise a comparison would mislead. */
  comparable: boolean;
}
/** Average per LOGGED day for the last 7 days against the 7 before, with the number of logged days each, so a sparse week is never passed off as a low one. */
export function compareWeeks(days: readonly NutritionDay[], metric: NutritionMetric): WeekCompare {
  const avg = (ds: readonly NutritionDay[]) => {
    const v = ds.map((d) => d[metric]).filter((x): x is number => x !== null);
    return {
      loggedDays: v.length,
      avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null,
    };
  };
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const a = avg(last7);
  const b = avg(prev7);
  return { thisWeek: a, lastWeek: b, comparable: a.loggedDays >= 3 && b.loggedDays >= 3 };
}

/** Cumulative XP at the end of each of the last `n` days, from the engine's own events. Never goes down. */
export function xpSeries(
  events: ReadonlyArray<{ day: string; xp: number }>,
  today: string,
  n = 30,
): ChartPoint[] {
  const days = lastDays(today, n);
  const before = events.filter((e) => e.day < days[0]!).reduce((a, e) => a + e.xp, 0);
  let running = before;
  return days.map((day) => {
    const gained = events.filter((e) => e.day === day).reduce((a, e) => a + e.xp, 0);
    running += gained;
    return {
      key: day,
      label: md(day),
      full: mdFull(day),
      value: running,
      note: gained ? `+${gained} XP` : 'no XP',
    };
  });
}

export type CalendarState = 'active' | 'rest' | 'missed' | 'today' | 'future';
export interface CalendarCell {
  key: string;
  state: CalendarState;
  full: string;
  /** Today that is also active. */
  active: boolean;
}
/** A Monday-first calendar of the last `weeks` weeks ending with this one. A planned rest day is a calm state, never a failure. */
export function calendarCells(
  active: ReadonlySet<string>,
  restWeekdays: readonly number[],
  today: string,
  weeks = 5,
): CalendarCell[] {
  const start = addDays(weekStartOf(today), -7 * (weeks - 1));
  const rest = new Set(restWeekdays);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const key = addDays(start, i);
    const isActive = active.has(key);
    const state: CalendarState =
      key > today
        ? 'future'
        : isActive
          ? 'active'
          : key === today
            ? 'today'
            : rest.has(dow(key))
              ? 'rest'
              : 'missed';
    return { key, state, full: `${WD_FULL[dow(key)]} ${mdFull(key)}`, active: isActive };
  });
}

/** One sentence per fact, built only from the series. Used as the chart's accessible description. */
export function describeSeries(
  title: string,
  points: readonly ChartPoint[],
  unit: string,
  opts: { zeroMeansNone?: boolean } = {},
): string {
  const real = points.filter((p): p is ChartPoint & { value: number } => p.value !== null);
  if (real.length === 0) return `${title}. Nothing has been recorded yet.`;
  const peak = real.reduce((a, b) => (b.value > a.value ? b : a));
  const last = real[real.length - 1]!;
  const gaps = points.length - real.length;
  const zeros = opts.zeroMeansNone ? real.filter((p) => p.value === 0).length : 0;
  const parts = [
    `${title}. ${real.length} of ${points.length} ${points.length === 1 ? 'point' : 'points'} recorded.`,
  ];
  parts.push(`Highest: ${peak.value} ${unit} (${peak.full}).`);
  parts.push(`Latest: ${last.value} ${unit} (${last.full}).`);
  if (gaps) parts.push(`${gaps} ${gaps === 1 ? 'point has' : 'points have'} nothing recorded.`);
  if (zeros) parts.push(`${zeros} with none.`);
  return parts.join(' ');
}
export const tableRows = (points: readonly ChartPoint[], unit: string): string[] =>
  points.map(
    (p) =>
      `${p.full}: ${p.value === null ? 'nothing recorded' : `${p.value} ${unit}`}${p.note && p.value !== null ? ` (${p.note})` : ''}`,
  );

/** A readable top for an axis: the max rounded up to a friendly step. Never below 1. */
export function niceMax(values: ReadonlyArray<number | null>): number {
  const m = Math.max(0, ...values.filter((v): v is number => v !== null));
  if (m <= 5) return Math.max(1, Math.ceil(m));
  const pow = 10 ** Math.floor(Math.log10(m));
  const f = m / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** Which of `n` equal slots a touch at x (within width w) falls in. Pure. */
export const slotAt = (x: number, w: number, n: number): number =>
  Math.min(n - 1, Math.max(0, Math.floor((x / Math.max(1, w)) * n)));
