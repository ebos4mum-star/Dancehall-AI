import { fixturesEnabled } from './content-state';
import {
  HOME_ITEMS,
  HOME_ITEM_IDS,
  UNSAFE_IMPROVISED,
  isHomeItem,
  type HomeItemId,
} from './home-items';
import {
  STRENGTH_EXERCISES,
  exerciseProblems,
  strengthBlocks,
  type StrengthExerciseDef,
  type StrengthPattern,
  type StrengthWorkoutDef,
} from './strength';
import type { WellnessPrefs } from './wellness';

/**
 * "Use what you have": matching and building. A person says which household items they have (possibly none, possibly a seated session or balance support) and
 * gets a strength session built ONLY from exercises that need nothing else, at their level, that pass the substitution and safety rules below. The result is an
 * ordinary `StrengthWorkoutDef`, so the existing strength player, clock, resume and logging run it unchanged: this module adds no player and no catalogue.
 *
 * Safety rules, all enforced here and pinned by tests:
 *  - an exercise is offered only if EVERY item it needs is available (a seated session counts the chair as the seat);
 *  - a seated session uses only exercises done seated as written; balance support removes exercises that need standing balance;
 *  - nothing harder than the person's level is chosen, and a substitute is never harder than what it replaces;
 *  - draft (unreviewed) exercises are offered only in development and review builds, and reviewed ones must pass the strength review gate;
 *  - the session lists the safety checks of the items it actually uses, plus the things never to use.
 */
export const HOME_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type HomeLevel = (typeof HOME_LEVELS)[number];
export const HOME_MINUTES = [10, 15, 20] as const;
export type HomeMinutes = (typeof HOME_MINUTES)[number];

export interface HomeRequest {
  items: HomeItemId[];
  level: HomeLevel;
  minutes: HomeMinutes;
  seated: boolean;
  balanceSupport: boolean;
  /** 2 or 3 sets per exercise. Beginners always get 2. */
  sets: 2 | 3;
  /** Exercises the person swapped out. */
  exclude: string[];
}

const RANK: Record<HomeLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

const clampItems = (items: readonly unknown[]): HomeItemId[] =>
  HOME_ITEM_IDS.filter((id) => items.includes(id));

export function makeRequest(r: Partial<HomeRequest> = {}): HomeRequest {
  const level = HOME_LEVELS.find((l) => l === r.level) ?? 'beginner';
  const minutes = HOME_MINUTES.find((m) => m === r.minutes) ?? 15;
  return {
    items: clampItems(r.items ?? []),
    level,
    minutes,
    seated: r.seated === true,
    balanceSupport: r.balanceSupport === true,
    sets: level === 'beginner' ? 2 : r.sets === 3 ? 3 : 2,
    exclude: [...new Set(r.exclude ?? [])].sort(),
  };
}

/** The request implied by the person's saved preferences (experience, mobility, goal, items). Gentle defaults when nothing is told. */
export function requestFromPrefs(
  p: Pick<WellnessPrefs, 'homeItems' | 'experience' | 'mobility' | 'goalIntent'>,
  over: Partial<HomeRequest> = {},
): HomeRequest {
  const level: HomeLevel =
    p.experience === 'regular' ? 'advanced' : p.experience === 'some' ? 'intermediate' : 'beginner';
  return makeRequest({
    items: p.homeItems,
    level,
    seated: p.mobility.includes('seated'),
    balanceSupport: p.mobility.includes('balance_support'),
    sets: p.goalIntent === 'strength' ? 3 : 2,
    ...over,
  });
}

/** The items a session may use. A seated session counts the chair as the seat the person is on. */
const available = (r: HomeRequest): ReadonlySet<HomeItemId> =>
  new Set<HomeItemId>(r.seated ? [...r.items, 'chair'] : r.items);

/** Household exercises that may be offered right now: drafts only in development and review builds, reviewed ones only if they pass the review gate. */
export function homePool(
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): StrengthExerciseDef[] {
  return exercises.filter(
    (e) =>
      e.household !== undefined &&
      (e.fixture || e.draft ? fixturesEnabled() : exerciseProblems(e).length === 0),
  );
}
export const homeWorkoutsAvailable = (
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): boolean => homePool(exercises).length > 0;

/** Why an exercise cannot be offered for this request, or null if it can. */
export function whyNot(e: StrengthExerciseDef, r: HomeRequest): string | null {
  if (e.household === undefined) return 'not a household exercise';
  const have = available(r);
  const missing = e.household.filter((i) => !have.has(i));
  if (missing.length > 0) return `needs ${missing.map((i) => HOME_ITEMS[i].label).join(', ')}`;
  if (r.seated && !e.seated) return 'not a seated exercise';
  if (r.balanceSupport && e.needsBalance) return 'needs standing balance';
  if (RANK[e.level ?? 'beginner'] > RANK[r.level]) return 'harder than the chosen level';
  if (r.exclude.includes(e.id)) return 'swapped out';
  return null;
}
export const isEligible = (e: StrengthExerciseDef, r: HomeRequest): boolean =>
  whyNot(e, r) === null;

/**
 * Safer substitutes for an exercise: same movement pattern, eligible for this request, NEVER harder than the one being replaced, and preferring seated-capable,
 * then easier, then fewer items. Empty when there is nothing safer to offer (the exercise's own easier version is always still available in the player).
 */
export function safeSubstitutes(
  e: StrengthExerciseDef,
  r: HomeRequest,
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): StrengthExerciseDef[] {
  const own = RANK[e.level ?? 'beginner'];
  return homePool(exercises)
    .filter(
      (c) =>
        c.id !== e.id &&
        c.pattern === e.pattern &&
        RANK[c.level ?? 'beginner'] <= own &&
        isEligible(c, { ...r, exclude: r.exclude.filter((x) => x !== c.id) }),
    )
    .sort(
      (a, b) =>
        Number(!!b.seated) - Number(!!a.seated) ||
        RANK[a.level ?? 'beginner'] - RANK[b.level ?? 'beginner'] ||
        (a.household?.length ?? 0) - (b.household?.length ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

const PATTERNS_STANDING: StrengthPattern[] = ['squat', 'push', 'hinge', 'pull', 'core', 'lunge'];
const PATTERNS_SEATED: StrengthPattern[] = ['squat', 'push', 'pull', 'core'];
const COUNT: Record<HomeMinutes, number> = { 10: 3, 15: 4, 20: 5 };
const REPS: Record<HomeLevel, number> = { beginner: 8, intermediate: 10, advanced: 12 };
const REST: Record<HomeLevel, number> = { beginner: 45, intermediate: 45, advanced: 60 };

const WARMUP = {
  title: 'Warm-up',
  seconds: 120,
  cue: 'March gently in place, roll your shoulders and circle your hips. Build up slowly.',
};
const WARMUP_SEATED = {
  title: 'Warm-up',
  seconds: 120,
  cue: 'Sit tall and march your feet gently, roll your shoulders and turn your head slowly from side to side.',
};
const COOLDOWN = {
  title: 'Cool-down',
  seconds: 120,
  cue: 'Slow your breathing. Hold a calf, hip and chest stretch for about twenty seconds each.',
};
const COOLDOWN_SEATED = {
  title: 'Cool-down',
  seconds: 120,
  cue: 'Stay seated. Slow your breathing. Reach your arms overhead, hug yourself and turn gently to each side, then stretch each leg out in front of you.',
};

export interface HomeBuild {
  workout: StrengthWorkoutDef;
  exercises: StrengthExerciseDef[];
  /** The safety checks for the items this session actually uses, then what never to use. */
  checks: string[];
  never: readonly string[];
  /** Items used by the chosen exercises. */
  itemsUsed: HomeItemId[];
}
export type HomeResult = { ok: true; build: HomeBuild } | { ok: false; reason: string };

/** The best exercise for a pattern: the hardest the person's level allows (so progress is real), preferring ones that use the items they have. */
function best(
  pool: StrengthExerciseDef[],
  r: HomeRequest,
  used: Set<string>,
): StrengthExerciseDef | null {
  const cands = pool.filter((e) => !used.has(e.id));
  if (cands.length === 0) return null;
  cands.sort(
    (a, b) =>
      RANK[b.level ?? 'beginner'] - RANK[a.level ?? 'beginner'] ||
      (b.household?.length ?? 0) - (a.household?.length ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return cands[0]!;
}

export function buildHomeWorkout(
  req: Partial<HomeRequest>,
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): HomeResult {
  const r = makeRequest(req);
  const eligible = homePool(exercises).filter((e) => isEligible(e, r));
  if (eligible.length === 0)
    return {
      ok: false,
      reason:
        'Nothing suitable can be built from these items and choices yet. Try adding an item, or turn off the seated or balance option.',
    };
  const order = r.seated ? PATTERNS_SEATED : PATTERNS_STANDING;
  const want = COUNT[r.minutes];
  const chosen: StrengthExerciseDef[] = [];
  const used = new Set<string>();
  for (const pattern of order) {
    if (chosen.length >= want) break;
    const e = best(
      eligible.filter((x) => x.pattern === pattern),
      r,
      used,
    );
    if (e) {
      chosen.push(e);
      used.add(e.id);
    }
  }
  // Top up from any remaining eligible exercise if some patterns had none.
  while (chosen.length < want) {
    const e = best(eligible, r, used);
    if (!e) break;
    chosen.push(e);
    used.add(e.id);
  }
  if (chosen.length < 2)
    return {
      ok: false,
      reason:
        'Only one suitable exercise was found for these choices, which is not enough for a session. Add an item or change an option.',
    };
  const blocks = chosen.map((e) => ({
    exerciseId: e.id,
    sets: r.sets,
    reps: e.holdSeconds ? null : REPS[r.level],
    seconds: e.holdSeconds ?? null,
    restSeconds: REST[r.level],
  }));
  const itemsUsed = HOME_ITEM_IDS.filter((i) => chosen.some((e) => e.household?.includes(i)));
  const draft = chosen.find((e) => e.draft)?.draft;
  const workout: StrengthWorkoutDef = {
    id: encodeHomeId(r),
    title: 'Use what you have',
    level: r.level,
    minutes: 0,
    equipment: 'none',
    warmup: r.seated ? WARMUP_SEATED : WARMUP,
    cooldown: r.seated ? COOLDOWN_SEATED : COOLDOWN,
    blocks,
    safety: [
      'Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.',
      'Some effort is normal, but sharp or joint pain is not: stop that exercise and use the easier version or skip it.',
      ...(itemsUsed.length > 0
        ? ['Check your equipment before you start (see the list on this screen).']
        : []),
    ],
    contentOrigin: 'original_text',
    review: chosen.every((e) => e.review === 'approved') ? 'approved' : 'unreviewed',
    reviewer: null,
    ...(draft ? { draft } : {}),
  };
  workout.minutes = Math.max(
    5,
    Math.round(strengthBlocks(workout, chosen).reduce((n, b) => n + b.seconds, 0) / 60),
  );
  return {
    ok: true,
    build: {
      workout,
      exercises: chosen,
      checks: itemsUsed.flatMap((i) => HOME_ITEMS[i].checks),
      never: UNSAFE_IMPROVISED,
      itemsUsed,
    },
  };
}

const SEP = '~';
/** The session's id carries its whole request, so the existing player, resume and logging can rebuild the same session from the id alone. */
export function encodeHomeId(r: HomeRequest): string {
  return [
    'home',
    r.items.join(',') || '-',
    r.level,
    r.minutes,
    r.seated ? 's' : 'f',
    r.balanceSupport ? 'b' : 'n',
    r.sets,
    r.exclude.join(',') || '-',
  ].join(SEP);
}
export function decodeHomeId(id: string): HomeRequest | null {
  const p = id.split(SEP);
  if (p.length !== 8 || p[0] !== 'home') return null;
  const [, items, level, minutes, seated, balance, sets, exclude] = p as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const list = items === '-' ? [] : items.split(',');
  if (!list.every(isHomeItem)) return null;
  const lv = HOME_LEVELS.find((l) => l === level);
  const mn = HOME_MINUTES.find((m) => String(m) === minutes);
  if (!lv || !mn || !['s', 'f'].includes(seated) || !['b', 'n'].includes(balance)) return null;
  if (sets !== '2' && sets !== '3') return null;
  const ex = exclude === '-' ? [] : exclude.split(',');
  if (!ex.every((x) => /^[a-z0-9-]{2,60}$/.test(x))) return null;
  const r = makeRequest({
    items: list as HomeItemId[],
    level: lv,
    minutes: mn,
    seated: seated === 's',
    balanceSupport: balance === 'b',
    sets: sets === '3' ? 3 : 2,
    exclude: ex,
  });
  return encodeHomeId(r) === id ? r : null; // only canonical ids are accepted
}
export const isHomeId = (id: string): boolean => id.startsWith(`home${SEP}`);

const BANNED =
  /\b(stand on|standing on|dips?|jump|jumps|jumping|hop|hops|stool|table|sofa|couch|bed|bucket|brick|door|doorway|anchor|tie|tied)\b/i;

/**
 * Rules every household exercise must follow, whatever its review status (so a reviewer cannot be handed an unsafe draft, and a reviewed one cannot slip an unsafe
 * item in). Returns everything wrong with it.
 */
export function homeExerciseProblems(e: StrengthExerciseDef): string[] {
  const p: string[] = [];
  if (e.household === undefined) return [`${e.id}: not a household exercise`];
  if (!e.household.every(isHomeItem))
    p.push(`${e.id}: uses an item that is not on the supported list`);
  if (!e.level) p.push(`${e.id}: no level`);
  const text = [...e.cues, e.regression, e.progression ?? '', ...e.safety].join(' ');
  const hit = text.match(BANNED);
  if (hit) p.push(`${e.id}: mentions "${hit[0]}", which household exercises must not use`);
  if (e.household.some((i) => i === 'water_bottles' || i === 'backpack') && !e.loadNote)
    p.push(`${e.id}: a bottle or backpack exercise needs a plain-words load note`);
  if (e.household.includes('stairs')) {
    if (e.household.some((i) => i === 'water_bottles' || i === 'backpack'))
      p.push(`${e.id}: never carry a load on the stairs`);
    if (!/rail|bottom step/i.test(text))
      p.push(`${e.id}: stairs exercises must use the rail or the bottom step`);
  }
  if (e.seated && e.needsBalance) p.push(`${e.id}: a seated exercise cannot need standing balance`);
  if (e.cues.length === 0) p.push(`${e.id}: no instructions`);
  if (!e.regression.trim()) p.push(`${e.id}: no easier version`);
  if (e.safety.length === 0) p.push(`${e.id}: no stop-if note`);
  return p;
}
