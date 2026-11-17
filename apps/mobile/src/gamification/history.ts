import {
  BADGE_IDS,
  computeGamification,
  type BadgeId,
  type GmEvent,
  type GmInput,
} from '@dancehall/shared';
import type { ChartPoint } from '../charts/data';

/**
 * XP history and badge dates, derived on the phone from the same records the XP engine reads. Nothing here is stored, and nothing here changes the engine.
 *
 * What the records can prove:
 *  - Workout, meal and habit XP carry the day of the record that earned it; quest XP is replayed by the engine for the last 60 days. So for the last
 *    `WINDOW_DAYS` days every kind of XP is complete and dated. Older XP is real but not dated per day here.
 *  - Badge XP is stamped by the engine with the day it was computed, which says nothing about when the badge was earned, so badge XP is kept OFF the daily line.
 *  - A badge date is "qualified" only when the history is complete and the same rules the engine uses can be replayed to name the day. Otherwise it is "recorded"
 *    (the day this phone first saw it, only for badges that appeared after the phone's baseline) or "earlier" (no date). The first sync is never an achievement date.
 */
export const WINDOW_DAYS = 60;
export const BADGE_XP = 25;

const DAY = 86_400_000;
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (key: string) => `${MON[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;
export const formatDay = (key: string) =>
  `${Number(key.slice(8, 10))} ${md(key).split(' ')[0]} ${key.slice(0, 4)}`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (key: string) => DOW[new Date(`${key}T00:00:00Z`).getUTCDay()]!;

export interface ActivityEvent {
  day: string;
  xp: number;
  kind: GmEvent['kind'];
  /** A weekly quest. The engine dates it on the last day of its week, which can be later than the day it was completed. */
  weekly?: boolean;
}
const WEEKLY_QUEST = /^quest:[^:]+:(active_days_target|try_two_styles)$/;
/** The dated, non-badge events the engine derived from the person's records. */
export const activityEventsOf = (events: readonly GmEvent[]): ActivityEvent[] =>
  events
    .filter((e) => e.kind !== 'badge')
    .map((e) => ({
      day: e.day,
      xp: e.xp,
      kind: e.kind,
      ...(WEEKLY_QUEST.test(e.id) ? { weekly: true } : {}),
    }));

export type XpHistoryState =
  /** Nothing earned yet. */
  | 'empty'
  /** Every day in the window is covered and nothing earlier exists. */
  | 'complete'
  /** The account's first record is inside the window: days before it have no data. */
  | 'young'
  /** Earlier XP exists that is not shown day by day. */
  | 'partial'
  /** The server's total is behind this phone's records (a delayed sync): the chart shows what is recorded here. */
  | 'syncing'
  /** No confirmed answer is available (offline or not loaded): the chart shows what is recorded here. */
  | 'offline';

export interface XpHistory {
  state: XpHistoryState;
  windowStart: string;
  windowEnd: string;
  /** Cumulative XP from activity at the end of each day (null = before the first record, nothing recorded). */
  total: ChartPoint[];
  /** XP earned each day (null = before the first record). */
  daily: ChartPoint[];
  windowXp: number;
  /** Activity XP earned before the window, included in the starting total but not dated per day. */
  earlierXp: number;
  /** Badge bonuses, never placed on a day. */
  badgeXp: number;
  firstDay: string | null;
  /** Plain sentences that explain the limits of what is shown. */
  notes: string[];
}

export interface XpHistoryInput {
  events: readonly ActivityEvent[];
  today: string;
  /** The confirmed total XP (server or engine), or null when none is available. */
  confirmedTotalXp: number | null;
  /** Badges the confirmed state lists. */
  badgeCount: number;
  /** A change is waiting for confirmation. */
  pending?: boolean;
  windowDays?: number;
}

export function xpHistory(i: XpHistoryInput): XpHistory {
  const n = i.windowDays ?? WINDOW_DAYS;
  const windowEnd = i.today;
  const windowStart = addDays(i.today, -(n - 1));
  const days = Array.from({ length: n }, (_, k) => addDays(windowStart, k));
  const inWindow = i.events.filter((e) => e.day >= windowStart && e.day <= windowEnd);
  const windowXp = inWindow.reduce((a, e) => a + e.xp, 0);
  const localActivity = i.events.reduce((a, e) => a + e.xp, 0);
  const localEarlier = localActivity - windowXp;
  const badgeXp = i.badgeCount * BADGE_XP;
  const confirmedActivity = i.confirmedTotalXp === null ? null : i.confirmedTotalXp - badgeXp;

  const firstDay = i.events.length ? i.events.map((e) => e.day).sort()[0]! : null;
  let state: XpHistoryState;
  let earlierXp: number;
  const notes: string[] = [];
  if (confirmedActivity === null) {
    state = 'offline';
    earlierXp = localEarlier;
    notes.push(
      'No confirmed total is available right now, so this shows only what is recorded on this phone.',
    );
  } else if (confirmedActivity < localActivity) {
    state = 'syncing';
    earlierXp = localEarlier;
    notes.push(
      'Your latest XP is still syncing. This shows what is recorded on this phone, so it may be ahead of your total for now.',
    );
  } else {
    earlierXp = Math.max(0, confirmedActivity - windowXp);
    state = 'complete';
  }
  const startsLate = earlierXp === 0 && firstDay !== null && firstDay > windowStart;
  if (state === 'complete') {
    if (firstDay === null && earlierXp === 0) state = 'empty';
    else if (earlierXp > 0) state = 'partial';
    else if (startsLate) state = 'young';
  }
  if (earlierXp > 0)
    notes.push(
      `Daily detail covers the last ${n} days (from ${md(windowStart)}). ${earlierXp} XP earned before then is included in the starting total but is not shown day by day.`,
    );
  if (startsLate && firstDay)
    notes.push(`History starts on ${md(firstDay)}: nothing is recorded before that.`);
  if (inWindow.some((e) => e.weekly))
    notes.push('Weekly quest XP is shown on the last day of its week.');
  if (badgeXp > 0) notes.push(`Badge bonuses (${badgeXp} XP) are not placed on a day.`);

  const byDay = new Map<string, number>();
  for (const e of inWindow) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.xp);
  const gapBefore = earlierXp === 0 ? firstDay : null;
  let running = earlierXp;
  const total: ChartPoint[] = [];
  const daily: ChartPoint[] = [];
  for (const day of days) {
    const gained = byDay.get(day) ?? 0;
    running += gained;
    const missing = gapBefore !== null && day < gapBefore;
    const base = {
      key: day,
      label: n > 14 ? md(day) : dow(day),
      full: `${dow(day)} ${formatDay(day)}`,
    };
    total.push({
      ...base,
      value: missing ? null : running,
      note: missing ? 'before your first record' : gained ? `+${gained} XP` : 'no XP',
    });
    daily.push({
      ...base,
      value: missing ? null : gained,
      note: missing ? 'before your first record' : gained ? `${gained} XP` : 'no XP',
    });
  }
  return {
    state,
    windowStart,
    windowEnd,
    total,
    daily,
    windowXp,
    earlierXp,
    badgeXp,
    firstDay,
    notes,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Badge dates
// ---------------------------------------------------------------------------------------------------------------------
export type BadgeBasis = 'qualified' | 'recorded' | 'earlier';
export interface BadgeMilestone {
  id: BadgeId;
  basis: BadgeBasis;
  /** Local day (YYYY-MM-DD). Always null for 'earlier'. */
  day: string | null;
}

/** The first and last dates of the records the XP engine reads (workouts that count, meal days, habit days). */
export function firstRecordDay(input: GmInput, eventDays: readonly string[]): string | null {
  const days = [...eventDays, ...input.mealLogDays, ...input.habitDays.map((h) => h.day)].filter(
    Boolean,
  );
  return days.length ? days.sort()[0]! : null;
}

const localDay = (iso: string, tz: string | null) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
};
/** The records known on or before `day` (a record belongs to the day it happened, not the day it was saved). */
export const recordsUpTo = (input: GmInput, day: string): GmInput => ({
  ...input,
  today: day,
  sessions: input.sessions.filter(
    (s) => s.completedAt && localDay(s.completedAt, input.timeZone) <= day,
  ),
  mealLogDays: input.mealLogDays.filter((d) => d <= day),
  habitDays: input.habitDays.filter((h) => h.day <= day),
});

/**
 * The qualified day of each earned badge: the first day on which the app's own rules (the XP engine, with today's settings for rest days and weekly target), run on the
 * records that existed by that day, award the badge. Exact by construction. It is meaningful only when `historyIsComplete` is true (at most `WINDOW_DAYS` days of
 * records), which also bounds the work to that many engine runs. Never show these dates otherwise.
 */
export function qualifiedBadgeDays(
  input: GmInput,
  earned: readonly BadgeId[],
): Partial<Record<BadgeId, string>> {
  const out: Partial<Record<BadgeId, string>> = {};
  if (earned.length === 0) return out;
  const days = [
    ...input.sessions
      .filter((s) => s.completedAt)
      .map((s) => localDay(s.completedAt!, input.timeZone)),
    ...input.mealLogDays,
    ...input.habitDays.map((h) => h.day),
  ].sort();
  const first = days[0];
  if (!first) return out;
  for (let d = first; d <= input.today; d = addDays(d, 1)) {
    const have = computeGamification(recordsUpTo(input, d)).badges;
    for (const b of earned) if (!out[b] && have.includes(b)) out[b] = d;
    if (earned.every((b) => out[b])) break;
  }
  return out;
}

/**
 * Whether the records cover this person's whole history, so a replay is exact: the first record is inside the window every kind of XP is complete for, and the confirmed
 * activity total agrees with what this phone derives (nothing earlier on a server, nothing still syncing).
 */
export function historyIsComplete(args: {
  firstRecord: string | null;
  today: string;
  confirmedActivityXp: number | null;
  localActivityXp: number;
  windowDays?: number;
}): boolean {
  if (args.firstRecord === null) return false;
  const start = addDays(args.today, -((args.windowDays ?? WINDOW_DAYS) - 1));
  if (args.firstRecord < start) return false;
  if (args.confirmedActivityXp === null) return false;
  return args.confirmedActivityXp === args.localActivityXp;
}

/**
 * The timeline: qualified date if reliably known; otherwise the day this phone first stored it, but only for a badge that appeared after the phone's baseline; otherwise
 * "earlier" with no date. A badge present at the first sync is never given the first-sync date.
 */
export function badgeMilestones(args: {
  badges: readonly BadgeId[];
  /** Candidate qualified dates; trusted only when `complete` is true. */
  qualified: Partial<Record<BadgeId, string>> | null;
  complete: boolean;
  /** Day this phone first saw each badge, for badges that appeared after its baseline. */
  recorded: Readonly<Record<string, string>>;
}): BadgeMilestone[] {
  const order = new Map(BADGE_IDS.map((b, k) => [b, k] as const));
  const items: BadgeMilestone[] = args.badges.map((id) => {
    const q = args.complete ? args.qualified?.[id] : undefined;
    if (q) return { id, basis: 'qualified', day: q };
    const r = args.recorded[id];
    if (r) return { id, basis: 'recorded', day: r };
    return { id, basis: 'earlier', day: null };
  });
  return items.sort((a, b) => {
    if (a.day && b.day) return b.day.localeCompare(a.day) || order.get(a.id)! - order.get(b.id)!;
    if (a.day) return -1;
    if (b.day) return 1;
    return order.get(a.id)! - order.get(b.id)!;
  });
}

export const basisWords: Record<BadgeBasis, string> = {
  qualified: 'Earned',
  recorded: 'Recorded',
  earlier: 'Earlier',
};
