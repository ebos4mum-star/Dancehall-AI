import {
  activeDaySet,
  BADGE_IDS,
  countedWorkouts,
  GM,
  levelOf,
  normalizePrefs,
  seasonFor,
  weekStartOf,
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
export type BadgeBasis = 'qualified' | 'estimated' | 'recorded' | 'earlier';
export interface BadgeMilestone {
  id: BadgeId;
  basis: BadgeBasis;
  /** Local day (YYYY-MM-DD). Always null for 'earlier'. */
  day: string | null;
  /** For 'estimated': how early and how late the day could be if the person's settings had been different. */
  range?: { from: string; to: string };
  dependsOn?: SettingDependence;
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

/** The setting a badge's date can depend on. Settings are not stored historically, so a date that depends on one cannot be proven exact. */
export type SettingDependence = 'rest days' | 'weekly goal';
/**
 * Which setting each badge's rule reads (verified against `packages/shared/src/gamification.ts`):
 *  - streak badges and "rest respected": the planned rest weekdays (a rest day is neutral in the streak walk);
 *  - level badges and "ten quests": the weekly goal (the weekly "active days" quest completes at the goal, and its XP counts toward both);
 *  - the season badge: neither (active days against a fixed seasonal goal).
 */
export const SETTING_DEPENDENCE: Record<BadgeId, SettingDependence | null> = {
  level_5: 'weekly goal',
  level_10: 'weekly goal',
  quests_10: 'weekly goal',
  streak_7: 'rest days',
  streak_30: 'rest days',
  rest_respected: 'rest days',
  season_finisher: null,
};

export interface BadgeDay {
  /** The day under the settings in use now. */
  day: string;
  /** The earliest and latest the day could be under any setting the person could have had (`to` is today when some setting would not have earned it yet). */
  from: string;
  to: string;
  /** True only when no possible setting changes the day. */
  exact: boolean;
  dependsOn: SettingDependence | null;
}

/** Every set of planned rest weekdays a person could have chosen (0 to 4 days, as the engine allows). */
export function restSubsets(max = 4): number[][] {
  const out: number[][] = [];
  const walk = (start: number, cur: number[]) => {
    out.push([...cur]);
    if (cur.length >= max) return;
    for (let d = start; d < 7; d++) walk(d + 1, [...cur, d]);
  };
  walk(0, []);
  return out;
}

const dowOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();
/**
 * The engine's own streak walk (see `streakInfo`), run once over a whole history for a given set of rest weekdays. Returns the first day the longest run reaches each length.
 * Reproduced here only so thousands of settings can be tried cheaply; `history.test.ts` checks it against the engine itself.
 */
export function streakReachDays(
  active: ReadonlySet<string>,
  rest: ReadonlySet<number>,
  today: string,
  lengths: readonly number[],
): Record<number, string | null> {
  const out: Record<number, string | null> = {};
  for (const n of lengths) out[n] = null;
  const first = [...active].sort()[0];
  if (!first) return out;
  let current = 0;
  let longest = 0;
  const forgivenIn = new Map<string, number>();
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (active.has(d)) {
      current += 1;
      longest = Math.max(longest, current);
      for (const n of lengths) if (out[n] === null && longest >= n) out[n] = d;
    } else if (rest.has(dowOf(d)) || d === today) {
      /* neutral */
    } else {
      const wk = weekStartOf(d);
      const used = forgivenIn.get(wk) ?? 0;
      if (used < GM.FREE_MISSES_PER_WEEK) forgivenIn.set(wk, used + 1);
      else current = 0;
    }
  }
  return out;
}

const WEEKLY_QUEST_EVENT = /^quest:[^:]+:(active_days_target|try_two_styles)$/;
/** Quest XP amounts of the two weekly quests (see `weeklyQuests` in the engine; a test compares the results with real engine replays, so a rule change cannot go unnoticed). */
const WEEKLY_XP = { active_days_target: 30, try_two_styles: 20 } as const;

/**
 * The weekly quests as a live engine would have awarded them, dated on the day each was COMPLETED (the engine's replay of a finished week dates them on the week's last day,
 * which is later than the day the person actually completed them). "Active days" completes on the goal-th active day of the week; "two styles" on the day the second style appears.
 */
function weeklyQuestEvents(input: GmInput, goal: number): GmEvent[] {
  const weeks = new Map<
    string,
    { active: string[]; styled: Array<{ day: string; style: string }> }
  >();
  const bucket = (day: string) => {
    const wk = weekStartOf(day);
    if (!weeks.has(wk)) weeks.set(wk, { active: [], styled: [] });
    return weeks.get(wk)!;
  };
  for (const d of [...activeDaySet(input)].sort()) bucket(d).active.push(d);
  for (const w of countedWorkouts(input))
    if (w.style) bucket(w.day).styled.push({ day: w.day, style: w.style });
  const out: GmEvent[] = [];
  for (const [wk, b] of weeks) {
    if (b.active.length >= goal)
      out.push({
        id: `quest:${wk}:active_days_target`,
        kind: 'quest',
        day: b.active[goal - 1]!,
        xp: WEEKLY_XP.active_days_target,
      });
    const seen = new Set<string>();
    for (const w of b.styled.sort((x, y) => x.day.localeCompare(y.day))) {
      seen.add(w.style);
      if (seen.size >= 2) {
        out.push({
          id: `quest:${wk}:try_two_styles`,
          kind: 'quest',
          day: w.day,
          xp: WEEKLY_XP.try_two_styles,
        });
        break;
      }
    }
  }
  return out;
}

/** First day the running activity XP reaches each level, and the day the tenth quest is completed, for one weekly goal. */
function goalDays(
  base: readonly GmEvent[],
  input: GmInput,
  goal: number,
): Partial<Record<BadgeId, string>> {
  const events = [
    ...base.filter((e) => e.kind !== 'badge' && !WEEKLY_QUEST_EVENT.test(e.id)),
    ...weeklyQuestEvents(input, goal),
  ];
  const perDay = new Map<string, { xp: number; quests: number }>();
  for (const e of events) {
    const x = perDay.get(e.day) ?? { xp: 0, quests: 0 };
    x.xp += e.xp;
    if (e.kind === 'quest') x.quests += 1;
    perDay.set(e.day, x);
  }
  const out: Partial<Record<BadgeId, string>> = {};
  let xp = 0;
  let quests = 0;
  for (const day of [...perDay.keys()].sort()) {
    const x = perDay.get(day)!;
    xp += x.xp;
    quests += x.quests;
    const lv = levelOf(xp).level;
    if (lv >= 5 && !out.level_5) out.level_5 = day;
    if (lv >= 10 && !out.level_10) out.level_10 = day;
    if (quests >= 10 && !out.quests_10) out.quests_10 = day;
  }
  return out;
}

/** The first day a season's challenge was complete: the same fixed goal for everyone, so no setting is involved. */
function seasonDay(input: GmInput): string | null {
  const active = [...activeDaySet(input)].sort();
  for (const d of active) {
    const season = seasonFor(d);
    const n = active.filter((x) => x >= season.from && x <= d).length;
    if (n >= season.goalDays) return d;
  }
  return null;
}

/**
 * For each earned badge, the day the app's rules award it AND how far that day could move if the person's settings had been different. Settings are not stored historically,
 * so a date is "exact" only when no possible setting changes it. Meaningful only when `historyIsComplete` is true (at most `WINDOW_DAYS` days of records).
 *  - weekly-goal badges: worked out from the engine's own events with the weekly quests re-dated to the day they were completed, at the current goal and at the extremes
 *    (goal 1 and goal 5). A lower goal can only complete weekly quests sooner and a higher goal only later, so every other goal falls between them;
 *  - rest-day badges: every possible set of rest weekdays is tried with the engine's streak walk;
 *  - season badge: independent of settings.
 * `engineEvents` is the engine's result for these same records (already computed by the app), so no engine replay is needed. Tests check every date here against real
 * engine replays, for several goals and rest-day choices.
 */
export function badgeDayAnalysis(
  input: GmInput,
  earned: readonly BadgeId[],
  engineEvents: readonly GmEvent[],
): Partial<Record<BadgeId, BadgeDay>> {
  const out: Partial<Record<BadgeId, BadgeDay>> = {};
  if (earned.length === 0) return out;
  const prefs = normalizePrefs(input.prefs);
  let active: Set<string> | null = null;
  let weekly: Record<number, Partial<Record<BadgeId, string>>> | null = null;
  const goal = (g: number) => {
    weekly ??= {};
    return (weekly[g] ??= goalDays(engineEvents, input, g));
  };
  for (const id of earned) {
    const dep = SETTING_DEPENDENCE[id];
    if (dep === 'rest days') {
      active ??= activeDaySet(input);
      const n = id === 'streak_7' ? 7 : id === 'streak_30' ? 30 : 14;
      const here =
        streakReachDays(active, new Set(prefs.restWeekdays), input.today, [n])[n] ?? null;
      if (!here) continue;
      let from = here;
      let to = here;
      for (const r of restSubsets()) {
        if (id === 'rest_respected' && r.length === 0) continue;
        const d = streakReachDays(active, new Set(r), input.today, [n])[n] ?? null;
        if (d === null) to = input.today;
        else {
          if (d < from) from = d;
          if (to !== input.today && d > to) to = d;
        }
      }
      out[id] = { day: here, from, to, exact: from === here && to === here, dependsOn: dep };
    } else if (dep === 'weekly goal') {
      const here = goal(prefs.targetDaysPerWeek)[id];
      if (!here) continue;
      const from = goal(1)[id] ?? here;
      const to = goal(5)[id] ?? input.today;
      const lo = from < here ? from : here;
      const hi = to > here ? to : here;
      out[id] = { day: here, from: lo, to: hi, exact: lo === here && hi === here, dependsOn: dep };
    } else {
      const here = seasonDay(input);
      if (here) out[id] = { day: here, from: here, to: here, exact: true, dependsOn: null };
    }
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
 * The timeline, most certain first:
 *  - qualified: the history is complete and NO possible setting changes the day: it is exact;
 *  - recorded: the day this phone first saw the badge, only for a badge that appeared after the phone's baseline (kept as is: it is a fact about this phone);
 *  - estimated: the history is complete and the day depends on a setting that is not stored historically; shown with the range it could fall in, and only if that range is
 *    narrow enough to be useful (`maxSpreadDays`);
 *  - earlier: everything else. No date.
 * A badge present at the first sync is never given the first-sync date.
 */
export function badgeMilestones(args: {
  badges: readonly BadgeId[];
  /** Analysis of each badge's day; trusted only when `complete` is true. */
  analysis: Partial<Record<BadgeId, BadgeDay>> | null;
  complete: boolean;
  /** Day this phone first saw each badge, for badges that appeared after its baseline. */
  recorded: Readonly<Record<string, string>>;
  maxSpreadDays?: number;
}): BadgeMilestone[] {
  const order = new Map(BADGE_IDS.map((b, k) => [b, k] as const));
  const maxSpread = args.maxSpreadDays ?? MAX_ESTIMATE_SPREAD_DAYS;
  const spread = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
  const items: BadgeMilestone[] = args.badges.map((id) => {
    const a = args.complete ? args.analysis?.[id] : undefined;
    if (a?.exact) return { id, basis: 'qualified', day: a.day };
    const r = args.recorded[id];
    if (r) return { id, basis: 'recorded', day: r };
    if (a && a.dependsOn && spread(a.from, a.to) <= maxSpread)
      return {
        id,
        basis: 'estimated',
        day: a.day,
        range: { from: a.from, to: a.to },
        dependsOn: a.dependsOn,
      };
    return { id, basis: 'earlier', day: null };
  });
  return items.sort((a, b) => {
    if (a.day && b.day) return b.day.localeCompare(a.day) || order.get(a.id)! - order.get(b.id)!;
    if (a.day) return -1;
    if (b.day) return 1;
    return order.get(a.id)! - order.get(b.id)!;
  });
}
/** An estimate whose possible range is wider than this is not shown as a date. */
export const MAX_ESTIMATE_SPREAD_DAYS = 14;

export const basisWords: Record<BadgeBasis, string> = {
  qualified: 'Earned',
  estimated: 'Estimated',
  recorded: 'Recorded',
  earlier: 'Earlier',
};
