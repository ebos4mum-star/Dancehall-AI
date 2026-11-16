// GENERATED from packages/shared/src/gamification.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
// Self-contained on purpose: the server copy of this file (supabase/functions/_shared/generated) must not drag in the food catalogue.
const localDateKey = (iso: string, timeZone: string | null | undefined): string => {
  const d = new Date(iso);
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
const weekStartOf = (dateKey: string): string => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const sessionMinutes = (s: { durationS: number | null; minutes: number }): number =>
  s.durationS && s.durationS > 0 ? Math.max(1, Math.round(s.durationS / 60)) : s.minutes;

/**
 * Gamification engine: XP, lifetime levels, personalised streaks with planned rest days, daily and weekly quests, badges, cosmetics, seasons and league ranking.
 * Pure and deterministic. Every award has a stable event id built from the record that earned it, so replaying the same data (or syncing twice, or importing
 * the same Apple Health workout again) can never award twice. The server runs this same code over the person's own rows and stores the result in a ledger,
 * so the client never supplies XP. See docs/GAMIFICATION_ARCHITECTURE.md.
 *
 * Safety rules built into the numbers (docs/FITNESS_SAFETY.md):
 *  - Nothing is awarded for calories, weight, weight change, fasting or eating less. A meal log earns the same whatever it contains, once a day.
 *  - Exercise XP is capped per workout, per day and per week, and a very long day triggers a rest nudge instead of more reward.
 *  - A planned rest day never breaks a streak and one unplanned miss a week is forgiven automatically. Levels and badges are never lost.
 */
export const GM = {
  /** XP per started 5 minutes of a counted workout, up to MAX_WORKOUT_MIN minutes. */
  XP_PER_5_MIN: 5,
  MAX_WORKOUT_MIN: 45,
  MIN_WORKOUT_MIN: 5,
  MAX_WORKOUTS_PER_DAY: 2,
  MEAL_LOG_XP: 5,
  HABIT_DAY_XP: 5,
  /** Hard ceilings on action XP (quests and badges are fixed, one-off amounts on top). */
  DAILY_ACTION_XP_CAP: 100,
  WEEKLY_ACTION_XP_CAP: 400,
  /** A day counts toward a streak with this many movement minutes (or one habit tick). */
  STREAK_MIN_MINUTES: 10,
  FREE_MISSES_PER_WEEK: 1,
  /** More than this many minutes of recorded exercise in a day shows a rest nudge. */
  REST_NUDGE_MINUTES: 120,
  MAX_LEVEL: 100,
  DUPLICATE_WINDOW_MIN: 10,
} as const;

export type GmKind = 'workout' | 'meal_day' | 'habit_day' | 'quest' | 'badge';
export interface GmEvent {
  /** Stable, unique per earning record: `workout:<id>`, `meal:<day>`, `habit:<day>`, `quest:<periodKey>:<questId>`, `badge:<id>`. */
  id: string;
  kind: GmKind;
  /** Local day (YYYY-MM-DD) the XP belongs to. */
  day: string;
  xp: number;
}

export interface GmPrefs {
  enabled: boolean;
  /** Personal weekly target of active days, 1 to 5. */
  targetDaysPerWeek: number;
  /** Planned rest weekdays, 0 = Sunday ... 6 = Saturday. */
  restWeekdays: readonly number[];
}
export const DEFAULT_GM_PREFS: GmPrefs = { enabled: true, targetDaysPerWeek: 3, restWeekdays: [0] };

export const normalizePrefs = (p: Partial<GmPrefs> | null | undefined): GmPrefs => {
  const t = Number(p?.targetDaysPerWeek);
  const rest = Array.isArray(p?.restWeekdays)
    ? [...new Set(p!.restWeekdays!.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : DEFAULT_GM_PREFS.restWeekdays;
  return {
    enabled: p?.enabled !== false,
    targetDaysPerWeek: Number.isFinite(t) ? Math.min(5, Math.max(1, Math.round(t))) : 3,
    // Never more than 4 planned rest days a week: a plan that is all rest is not a plan.
    restWeekdays: rest.slice(0, 4),
  };
};

export interface GmSession {
  id: string;
  status: string;
  completedAt: string | null;
  durationS: number | null;
  minutes: number;
  source?: string | null;
  style?: string | null;
  lowImpact?: boolean;
}
export interface GmInput {
  today: string;
  timeZone: string | null;
  sessions: readonly GmSession[];
  /** Local days on which at least one meal was logged. Content and amounts are never looked at. */
  mealLogDays: readonly string[];
  /** Habit check-ins (a tick on a day). */
  habitDays: ReadonlyArray<{ day: string; habitId: string }>;
  activeHabitCount: number;
  prefs: GmPrefs;
}

const DAY_MS = 86_400_000;
const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dow = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

// ---------- counted workouts (duplicate prevention) ----------
export interface CountedWorkout {
  id: string;
  day: string;
  minutes: number;
  style: string | null;
  lowImpact: boolean;
  source: string;
}
/**
 * Completed sessions that count for XP. An Apple Health session that overlaps one recorded in the app (same start within the duplicate window, or inside it) is
 * dropped, so a guided session that a watch also recorded is rewarded once. Sessions shorter than the minimum earn nothing.
 */
export function countedWorkouts(input: Pick<GmInput, 'sessions' | 'timeZone'>): CountedWorkout[] {
  const done = input.sessions
    .filter(
      (s) =>
        s.status === 'completed' && s.completedAt && Number.isFinite(Date.parse(s.completedAt)),
    )
    .map((s) => ({
      s,
      end: Date.parse(s.completedAt!),
      min: sessionMinutes({ durationS: s.durationS, minutes: s.minutes }),
    }));
  const win = GM.DUPLICATE_WINDOW_MIN * 60_000;
  const native = done.filter((d) => d.s.source !== 'apple_health');
  const out: CountedWorkout[] = [];
  const seen = new Set<string>();
  for (const d of done) {
    if (seen.has(d.s.id)) continue;
    seen.add(d.s.id);
    if (!(d.min >= GM.MIN_WORKOUT_MIN)) continue;
    if (d.s.source === 'apple_health') {
      const began = d.end - d.min * 60_000;
      const overlaps = native.some((n) => {
        const nb = n.end - n.min * 60_000;
        return Math.abs(nb - began) <= win || (began >= nb - win && began <= n.end);
      });
      if (overlaps) continue;
    }
    out.push({
      id: d.s.id,
      day: localDateKey(d.s.completedAt!, input.timeZone),
      minutes: Math.min(d.min, 600),
      style: d.s.style ?? null,
      lowImpact: d.s.lowImpact === true,
      source: d.s.source ?? 'manual',
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}

export const workoutXp = (minutes: number): number =>
  Math.min(GM.MAX_WORKOUT_MIN, Math.max(0, minutes)) >= GM.MIN_WORKOUT_MIN
    ? Math.ceil(Math.min(GM.MAX_WORKOUT_MIN, minutes) / 5) * GM.XP_PER_5_MIN
    : 0;

// ---------- action events (capped) ----------
export function actionEvents(input: GmInput): GmEvent[] {
  const workouts = countedWorkouts(input);
  const byDay = new Map<string, GmEvent[]>();
  const push = (e: GmEvent) => byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const perDay = new Map<string, number>();
  for (const w of workouts) {
    const n = perDay.get(w.day) ?? 0;
    perDay.set(w.day, n + 1);
    if (n >= GM.MAX_WORKOUTS_PER_DAY) continue;
    push({ id: `workout:${w.id}`, kind: 'workout', day: w.day, xp: workoutXp(w.minutes) });
  }
  for (const day of new Set(input.mealLogDays))
    push({ id: `meal:${day}`, kind: 'meal_day', day, xp: GM.MEAL_LOG_XP });
  for (const day of new Set(input.habitDays.map((h) => h.day)))
    push({ id: `habit:${day}`, kind: 'habit_day', day, xp: GM.HABIT_DAY_XP });
  // Apply the per-day and per-week ceilings in a fixed order so the result is deterministic.
  const out: GmEvent[] = [];
  const weekUsed = new Map<string, number>();
  for (const day of [...byDay.keys()].sort()) {
    const wk = weekStartOf(day);
    let dayLeft: number = GM.DAILY_ACTION_XP_CAP;
    for (const e of byDay.get(day)!.sort((a, b) => a.id.localeCompare(b.id))) {
      const weekLeft = GM.WEEKLY_ACTION_XP_CAP - (weekUsed.get(wk) ?? 0);
      const xp = Math.max(0, Math.min(e.xp, dayLeft, weekLeft));
      dayLeft -= xp;
      weekUsed.set(wk, (weekUsed.get(wk) ?? 0) + xp);
      out.push({ ...e, xp });
    }
  }
  return out;
}

// ---------- levels (lifetime, never lost) ----------
/** Cumulative XP to reach a level: 0, 100, 300, 600, 1000 ... (50 * n * (n - 1)). */
export const xpToReach = (level: number): number => 50 * level * (level - 1);
export function levelOf(xp: number): {
  level: number;
  xpInto: number;
  xpForNext: number;
  fraction: number;
} {
  const x = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = Math.min(GM.MAX_LEVEL, Math.max(1, Math.floor((1 + Math.sqrt(1 + x / 12.5)) / 2)));
  const base = xpToReach(level);
  const next = level >= GM.MAX_LEVEL ? base : xpToReach(level + 1);
  const span = Math.max(1, next - base);
  return {
    level,
    xpInto: x - base,
    xpForNext: next - base,
    fraction: level >= GM.MAX_LEVEL ? 1 : Math.min(1, (x - base) / span),
  };
}

// ---------- activity days, streaks, rest ----------
export type DayKind = 'active' | 'rest' | 'forgiven' | 'missed' | 'open';
export function activeDaySet(input: GmInput): Set<string> {
  const days = new Set<string>();
  const minutes = new Map<string, number>();
  for (const w of countedWorkouts(input)) minutes.set(w.day, (minutes.get(w.day) ?? 0) + w.minutes);
  for (const [d, m] of minutes) if (m >= GM.STREAK_MIN_MINUTES) days.add(d);
  for (const h of input.habitDays) days.add(h.day);
  return days;
}
export interface StreakInfo {
  /** Active days in the current run (planned rest days keep the run alive but do not add to it). */
  current: number;
  longest: number;
  /** Today's state: 'open' means not yet active but not missed (the day is not over). */
  todayKind: DayKind;
  isPlannedRestToday: boolean;
  /** Days this week that count toward the personal target. */
  activeDaysThisWeek: number;
  targetDays: number;
}
/**
 * The run walks forward day by day from the first active day. Active adds one. A planned rest weekday is neutral. The first unplanned miss in a week is forgiven.
 * Any further miss resets the run to zero. Today is never a miss: it stays open until it is over.
 */
export function streakInfo(input: GmInput): StreakInfo {
  const prefs = normalizePrefs(input.prefs);
  const active = activeDaySet(input);
  const rest = new Set(prefs.restWeekdays);
  const sorted = [...active].sort();
  const first = sorted[0];
  let current = 0;
  let longest = 0;
  const forgivenIn = new Map<string, number>();
  if (first) {
    for (let d = first; d <= input.today; d = addDays(d, 1)) {
      if (active.has(d)) {
        current += 1;
        longest = Math.max(longest, current);
      } else if (rest.has(dow(d)) || d === input.today) {
        /* neutral */
      } else {
        const wk = weekStartOf(d);
        const used = forgivenIn.get(wk) ?? 0;
        if (used < GM.FREE_MISSES_PER_WEEK) forgivenIn.set(wk, used + 1);
        else current = 0;
      }
    }
  }
  const restToday = rest.has(dow(input.today));
  const todayKind: DayKind = active.has(input.today) ? 'active' : restToday ? 'rest' : 'open';
  const wkStart = weekStartOf(input.today);
  let activeDaysThisWeek = 0;
  for (let i = 0; i < 7; i++) if (active.has(addDays(wkStart, i))) activeDaysThisWeek += 1;
  return {
    current,
    longest,
    todayKind,
    isPlannedRestToday: restToday,
    activeDaysThisWeek,
    targetDays: prefs.targetDaysPerWeek,
  };
}
/** True when today's recorded exercise is long enough that the kind thing is to rest, not to earn more. */
export function restNudge(input: GmInput): boolean {
  return (
    countedWorkouts(input)
      .filter((w) => w.day === input.today)
      .reduce((n, w) => n + w.minutes, 0) >= GM.REST_NUDGE_MINUTES
  );
}

// ---------- quests ----------
export type QuestId =
  | 'move_10'
  | 'habit_tick'
  | 'log_a_meal'
  | 'gentle_session'
  | 'active_days_target'
  | 'try_two_styles';
export interface Quest {
  id: QuestId;
  period: 'daily' | 'weekly';
  periodKey: string;
  progress: number;
  goal: number;
  done: boolean;
  xp: number;
}
const DAILY_POOL: readonly QuestId[] = ['move_10', 'habit_tick', 'log_a_meal', 'gentle_session'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function dailyQuests(input: GmInput): Quest[] {
  const day = input.today;
  const eligible = DAILY_POOL.filter((q) =>
    q === 'habit_tick' ? input.activeHabitCount > 0 : true,
  );
  // Three per day, chosen by the date so everyone's day is the same and it cannot be re-rolled.
  const start = hash(day) % eligible.length;
  const picked = [0, 1, 2]
    .map((i) => eligible[(start + i) % eligible.length]!)
    .filter((q, i, a) => a.indexOf(q) === i);
  const workouts = countedWorkouts(input).filter((w) => w.day === day);
  const mins = workouts.reduce((n, w) => n + w.minutes, 0);
  const progress = (q: QuestId): [number, number] => {
    switch (q) {
      case 'move_10':
        return [Math.min(mins, 10), 10];
      case 'habit_tick':
        return [input.habitDays.some((h) => h.day === day) ? 1 : 0, 1];
      case 'log_a_meal':
        return [input.mealLogDays.includes(day) ? 1 : 0, 1];
      case 'gentle_session':
        return [
          workouts.some((w) => w.lowImpact || /stretch|mobility|yoga|walk/i.test(w.style ?? ''))
            ? 1
            : 0,
          1,
        ];
      default:
        return [0, 1];
    }
  };
  return picked.map((id) => {
    const [p, goal] = progress(id);
    return { id, period: 'daily', periodKey: day, progress: p, goal, done: p >= goal, xp: 10 };
  });
}
export function weeklyQuests(input: GmInput): Quest[] {
  const wk = weekStartOf(input.today);
  const target = normalizePrefs(input.prefs).targetDaysPerWeek;
  const active = activeDaySet(input);
  let days = 0;
  for (let i = 0; i < 7; i++) if (active.has(addDays(wk, i))) days += 1;
  const styles = new Set(
    countedWorkouts(input)
      .filter((w) => weekStartOf(w.day) === wk && w.style)
      .map((w) => w.style),
  );
  return [
    {
      id: 'active_days_target',
      period: 'weekly',
      periodKey: wk,
      progress: Math.min(days, target),
      goal: target,
      done: days >= target,
      xp: 30,
    },
    {
      id: 'try_two_styles',
      period: 'weekly',
      periodKey: wk,
      progress: Math.min(styles.size, 2),
      goal: 2,
      done: styles.size >= 2,
      xp: 20,
    },
  ];
}
export const questEventId = (q: Quest) => `quest:${q.periodKey}:${q.id}`;

/** Quest XP for every quest ever completed, from the same data (so it replays identically). Looks back at most 60 days. */
export function questEvents(input: GmInput, lookbackDays = 60): GmEvent[] {
  const out: GmEvent[] = [];
  const seenWeeks = new Set<string>();
  for (let i = lookbackDays; i >= 0; i--) {
    const day = addDays(input.today, -i);
    const at = { ...input, today: day };
    for (const q of dailyQuests(at))
      if (q.done) out.push({ id: questEventId(q), kind: 'quest', day, xp: q.xp });
    const wk = weekStartOf(day);
    if (!seenWeeks.has(wk) && addDays(wk, 6) <= input.today) {
      seenWeeks.add(wk);
      for (const q of weeklyQuests({ ...input, today: addDays(wk, 6) }))
        if (q.done) out.push({ id: questEventId(q), kind: 'quest', day: addDays(wk, 6), xp: q.xp });
    }
  }
  // The current (unfinished) week can still be completed.
  for (const q of weeklyQuests(input))
    if (q.done && !out.some((e) => e.id === questEventId(q)))
      out.push({ id: questEventId(q), kind: 'quest', day: input.today, xp: q.xp });
  return dedupe(out);
}

export function dedupe(events: readonly GmEvent[]): GmEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

// ---------- badges, cosmetics, seasons ----------
export type BadgeId =
  | 'level_5'
  | 'level_10'
  | 'streak_7'
  | 'streak_30'
  | 'quests_10'
  | 'rest_respected'
  | 'season_finisher';
export const BADGE_IDS: readonly BadgeId[] = [
  'level_5',
  'level_10',
  'streak_7',
  'streak_30',
  'quests_10',
  'rest_respected',
  'season_finisher',
];

export interface Season {
  id: string;
  /** Inclusive local dates. */
  from: string;
  to: string;
  /** Active days needed to finish the season challenge. */
  goalDays: number;
  cosmetic: CosmeticId;
}
/** Original seasons (no third-party themes). Year-independent; the id carries the year. */
export function seasonFor(today: string): Season {
  const y = today.slice(0, 4);
  const m = Number(today.slice(5, 7));
  const table: Array<[number, number, string, CosmeticId, number, string]> = [
    [3, 5, 'bloom', 'cosmetic_flower', 18, `${y}-03-01`],
    [6, 8, 'sun', 'cosmetic_sunglasses', 20, `${y}-06-01`],
    [9, 11, 'harvest', 'cosmetic_scarf', 18, `${y}-09-01`],
  ];
  for (const [a, b, name, cosmetic, goal, from] of table)
    if (m >= a && m <= b)
      return {
        id: `${name}-${y}`,
        from,
        to: addDays(`${y}-${String(b + 1).padStart(2, '0')}-01`, -1),
        goalDays: goal,
        cosmetic,
      };
  const winterYear = m === 12 ? Number(y) : Number(y) - 1;
  return {
    id: `frost-${winterYear}`,
    from: `${winterYear}-12-01`,
    to: addDays(`${winterYear + 1}-03-01`, -1),
    goalDays: 20,
    cosmetic: 'cosmetic_beanie',
  };
}
export function seasonProgress(input: GmInput): {
  season: Season;
  activeDays: number;
  done: boolean;
} {
  const season = seasonFor(input.today);
  let n = 0;
  for (const d of activeDaySet(input)) if (d >= season.from && d <= season.to) n += 1;
  return { season, activeDays: n, done: n >= season.goalDays };
}

export type CosmeticId =
  | 'cosmetic_headband'
  | 'cosmetic_wristbands'
  | 'cosmetic_cape'
  | 'cosmetic_flower'
  | 'cosmetic_sunglasses'
  | 'cosmetic_scarf'
  | 'cosmetic_beanie';
export const COSMETICS: ReadonlyArray<{
  id: CosmeticId;
  needs: { level?: number; season?: boolean };
}> = [
  { id: 'cosmetic_headband', needs: { level: 3 } },
  { id: 'cosmetic_wristbands', needs: { level: 6 } },
  { id: 'cosmetic_cape', needs: { level: 10 } },
  { id: 'cosmetic_flower', needs: { season: true } },
  { id: 'cosmetic_sunglasses', needs: { season: true } },
  { id: 'cosmetic_scarf', needs: { season: true } },
  { id: 'cosmetic_beanie', needs: { season: true } },
];

// ---------- the whole picture ----------
export interface GmState {
  enabled: boolean;
  events: GmEvent[];
  totalXp: number;
  level: ReturnType<typeof levelOf>;
  streak: StreakInfo;
  restNudge: boolean;
  dailyQuests: Quest[];
  weeklyQuests: Quest[];
  badges: BadgeId[];
  seasonal: ReturnType<typeof seasonProgress>;
  cosmetics: CosmeticId[];
  /** XP earned in the current week (capped inputs only), for leagues. */
  weekXp: number;
}
export function computeGamification(raw: GmInput): GmState {
  const input = { ...raw, prefs: normalizePrefs(raw.prefs) };
  const streak = streakInfo(input);
  const seasonal = seasonProgress(input);
  const base = dedupe([...actionEvents(input), ...questEvents(input)]);
  const questCount = base.filter((e) => e.kind === 'quest').length;
  const levelNoBadges = levelOf(base.reduce((n, e) => n + e.xp, 0)).level;
  const badges: BadgeId[] = [];
  if (levelNoBadges >= 5) badges.push('level_5');
  if (levelNoBadges >= 10) badges.push('level_10');
  if (streak.longest >= 7) badges.push('streak_7');
  if (streak.longest >= 30) badges.push('streak_30');
  if (questCount >= 10) badges.push('quests_10');
  if (input.prefs.restWeekdays.length > 0 && streak.longest >= 14) badges.push('rest_respected');
  if (seasonal.done) badges.push('season_finisher');
  const badgeEvents: GmEvent[] = badges.map((b) => ({
    id: `badge:${b}`,
    kind: 'badge',
    day: input.today,
    xp: 25,
  }));
  const events = dedupe([...base, ...badgeEvents]);
  const totalXp = events.reduce((n, e) => n + e.xp, 0);
  const level = levelOf(totalXp);
  const cosmetics = COSMETICS.filter(
    (c) =>
      (c.needs.level ? level.level >= c.needs.level : false) ||
      (c.needs.season && c.id === seasonal.season.cosmetic && seasonal.done),
  ).map((c) => c.id);
  const wk = weekStartOf(input.today);
  const weekXp = events
    .filter((e) => e.kind !== 'badge' && weekStartOf(e.day) === wk)
    .reduce((n, e) => n + e.xp, 0);
  return {
    enabled: input.prefs.enabled,
    events,
    totalXp,
    level,
    streak,
    restNudge: restNudge(input),
    dailyQuests: dailyQuests(input),
    weeklyQuests: weeklyQuests(input),
    badges,
    seasonal,
    cosmetics,
    weekXp,
  };
}

// ---------- optional friends league ----------
export interface LeagueEntry {
  username: string;
  weekXp: number;
  isMe?: boolean;
}
/**
 * Friends-only weekly league. Everyone's number is capped at the weekly ceiling, so nobody can win by doing more than the safe amount. Ties share a rank.
 * Only people who opted in appear; the screen shows usernames and a number, never any health or nutrition record.
 */
export function leagueStandings(
  entries: readonly LeagueEntry[],
): Array<LeagueEntry & { rank: number }> {
  const cap = GM.WEEKLY_ACTION_XP_CAP + 200; // actions plus quests in one week
  const rows = entries.map((e) => ({
    ...e,
    weekXp: Math.min(cap, Math.max(0, Math.round(Number.isFinite(e.weekXp) ? e.weekXp : 0))),
  }));
  rows.sort((a, b) => b.weekXp - a.weekXp || a.username.localeCompare(b.username));
  let rank = 0;
  let prev = -1;
  return rows.map((r, i) => {
    if (r.weekXp !== prev) rank = i + 1;
    prev = r.weekXp;
    return { ...r, rank };
  });
}
