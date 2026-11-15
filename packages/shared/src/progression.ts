import { localDateKey } from './food';
import { weekStartOf } from './activity';
import { LEVELS, WORKOUT_BY_ID, type Level, type WorkoutDef } from './workouts';

/**
 * Next-level suggestion. It looks only at what the person did and how they said it felt, offers a change as an option, and says staying put is fine. It never
 * scores, ranks or compares anyone, never states a target and makes no performance or health claim. PROVISIONAL: the numbers are engineering defaults that no exercise
 * professional has reviewed (see PROGRESSION_STATUS), which is why the wording is soft and the thresholds are never shown to people.
 */
export const PROGRESSION_STATUS = {
  reviewedByProfessional: false,
  note: 'Provisional thresholds. Not reviewed by an exercise professional.',
} as const;
export const PROGRESSION_RULES = {
  windowDays: 28,
  /** Completed sessions at a level before moving up is even suggested. */
  minSessions: 6,
  /** Distinct weeks those sessions must be spread over, so one burst does not count as readiness. */
  minActiveWeeks: 3,
  /** Perceived exertion (1 to 10) at or above this is "very hard". */
  veryHard: 8,
  /** Average perceived exertion at or below this counts as manageable. */
  manageable: 6,
} as const;

export interface ProgressionSession {
  workoutId: string | null;
  status: 'planned' | 'completed' | 'skipped';
  completedAt: string | null;
  perceivedExertion: number | null;
}
export interface LevelSuggestion {
  /** `up` offers the next level; `easier` offers something gentler; null means no suggestion. */
  direction: 'up' | 'easier' | null;
  from: Level | null;
  to: Level | null;
  /** Plain-language reasons, each from the person's own history. */
  reasons: string[];
  /** Always shown with the suggestion. */
  note: string;
  /** The person has chosen low impact or seated options: suggested sessions stay low impact. */
  keepLowImpact: boolean;
  provisional: true;
}
const NONE: Omit<LevelSuggestion, 'keepLowImpact'> = {
  direction: null,
  from: null,
  to: null,
  reasons: [],
  note: '',
  provisional: true,
};
const NOTE =
  'This is only an idea. Staying where you are is just as good, and you can change level any time.';

const levelOf = (
  s: ProgressionSession,
  catalog: ReadonlyMap<string, Pick<WorkoutDef, 'level'>>,
): Level | null => (s.workoutId ? (catalog.get(s.workoutId)?.level ?? null) : null);

export function levelSuggestion(args: {
  sessions: readonly ProgressionSession[];
  now: Date;
  timeZone: string | null;
  /** The person asked for low-impact or seated movement. Suggested sessions then stay low impact. */
  keepLowImpact?: boolean;
  catalog?: ReadonlyMap<string, Pick<WorkoutDef, 'level'>>;
}): LevelSuggestion {
  const keep = args.keepLowImpact === true;
  const catalog = args.catalog ?? WORKOUT_BY_ID;
  const cutoff = args.now.getTime() - PROGRESSION_RULES.windowDays * 86_400_000;
  const recent = args.sessions
    .filter((s) => s.status === 'completed' && s.completedAt && Date.parse(s.completedAt) >= cutoff)
    .map((s) => ({ s, level: levelOf(s, catalog) }))
    .filter((x): x is { s: ProgressionSession; level: Level } => x.level !== null)
    .sort((a, b) => a.s.completedAt!.localeCompare(b.s.completedAt!));

  // Something gentler: two of the last three sessions at a level felt very hard.
  const last3 = recent.slice(-3);
  const hard = last3.filter(
    (x) => x.s.perceivedExertion !== null && x.s.perceivedExertion >= PROGRESSION_RULES.veryHard,
  );
  if (last3.length === 3 && hard.length >= 2) {
    const lvl = last3[last3.length - 1]!.level;
    const i = LEVELS.indexOf(lvl);
    return {
      direction: 'easier',
      from: lvl,
      to: i > 0 ? LEVELS[i - 1]! : lvl,
      reasons: [
        'A couple of your recent sessions felt very hard.',
        i > 0
          ? 'A gentler level, or the low-impact versions, may feel better for a while.'
          : 'The low-impact versions of the same sessions may feel better for a while.',
      ],
      note: NOTE,
      keepLowImpact: keep,
      provisional: true,
    };
  }

  // Next level up: enough sessions at one level, spread over several weeks, and they felt manageable.
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const lvl = LEVELS[i]!;
    const here = recent.filter((x) => x.level === lvl);
    const next = recent.filter((x) => x.level === LEVELS[i + 1]);
    if (here.length < PROGRESSION_RULES.minSessions) continue;
    if (next.length >= 2) continue; // already moving up on their own
    const weeks = new Set(
      here.map((x) => weekStartOf(localDateKey(x.s.completedAt!, args.timeZone))),
    );
    if (weeks.size < PROGRESSION_RULES.minActiveWeeks) continue;
    const rated = here.map((x) => x.s.perceivedExertion).filter((v): v is number => v !== null);
    if (rated.some((v) => v >= PROGRESSION_RULES.veryHard)) continue;
    if (
      rated.length > 0 &&
      rated.reduce((a, b) => a + b, 0) / rated.length > PROGRESSION_RULES.manageable
    )
      continue;
    return {
      direction: 'up',
      from: lvl,
      to: LEVELS[i + 1]!,
      reasons: [
        `You have done ${here.length} ${lvl} sessions over the last four weeks.`,
        rated.length > 0 ? 'You said they felt manageable.' : 'They have been steady.',
        keep
          ? 'Sessions at the next level come in low-impact versions too.'
          : 'You could try one session at the next level when you feel like it.',
      ],
      note: NOTE,
      keepLowImpact: keep,
      provisional: true,
    };
  }
  return { ...NONE, keepLowImpact: keep };
}
