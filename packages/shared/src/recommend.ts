import { filterWorkouts, WORKOUTS, type WorkoutDef } from './workouts';

/** Voluntary, self-chosen moods. Never detected or inferred; never stored as a record about the person. */
export const MOODS = ['energized', 'tired', 'stressed', 'happy', 'motivation'] as const;
export type Mood = (typeof MOODS)[number];

export interface MoodPick {
  workout: WorkoutDef;
  /** Plain-language reason built only from the workout's own metadata. */
  why: string;
}

const UPBEAT = new Set(['afrobeats', 'amapiano', 'bollywood', 'latin', 'hip_hop']);

const rules: Record<Mood, (w: WorkoutDef) => boolean> = {
  energized: (w) => w.intensity !== 'low' && w.minutes >= 10,
  tired: (w) => w.intensity === 'low' && w.minutes <= 15,
  stressed: (w) =>
    w.intensity !== 'high' && w.impact === 'low' && w.minutes >= 5 && w.minutes <= 20,
  happy: (w) => UPBEAT.has(w.style) && w.intensity !== 'low',
  motivation: (w) => w.minutes <= 10 && w.level === 'beginner' && w.intensity !== 'high',
};

const whyOf = (mood: Mood, w: WorkoutDef): string => {
  const base = `${w.minutes} min, ${w.intensity === 'low' ? 'gentle' : w.intensity === 'moderate' ? 'moderate' : 'high-energy'}, ${w.impact === 'low' ? 'low-impact' : `${w.impact}-impact`}`;
  return {
    energized: `${base}: a bit more to move with.`,
    tired: `${base}: an easy way to move without a big effort.`,
    stressed: `${base}: easy on the joints and not too long.`,
    happy: `${base}: an upbeat ${w.style.replace('_', ' ')} outline.`,
    motivation: `${base}: short and beginner-friendly, so it is easy to start.`,
  }[mood];
};

/**
 * Deterministic suggestions from workouts that actually exist, using only their metadata (duration, intensity, impact, level, style).
 * `lowImpactOnly` must be set when the person's screening routed them to low-impact options. If nothing matches the mood, falls back to
 * the shortest allowed workouts, so the answer is never empty while any workout exists. Not a diagnosis and not personalised by AI.
 */
export function recommendByMood(
  mood: Mood,
  opts: {
    lowImpactOnly?: boolean;
    seed?: number;
    limit?: number;
    excludeIds?: readonly string[];
  } = {},
  list: readonly WorkoutDef[] = WORKOUTS,
): MoodPick[] {
  const limit = opts.limit ?? 3;
  const allowed = filterWorkouts({ lowImpactOnly: opts.lowImpactOnly || undefined }, list).filter(
    (w) => !opts.excludeIds?.includes(w.id),
  );
  let pool = allowed.filter(rules[mood]);
  if (pool.length === 0) pool = [...allowed].sort((a, b) => a.minutes - b.minutes);
  if (pool.length === 0) return [];
  const start = (opts.seed ?? 0) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  // One per style first, for variety.
  const seen = new Set<string>();
  const picks: WorkoutDef[] = [];
  for (const w of rotated) {
    if (seen.has(w.style)) continue;
    seen.add(w.style);
    picks.push(w);
  }
  for (const w of rotated) if (!picks.includes(w)) picks.push(w);
  return picks.slice(0, limit).map((workout) => ({ workout, why: whyOf(mood, workout) }));
}
