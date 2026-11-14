import { localDateKey, type WellnessEntry } from '@dancehall/shared';
import type { FitChallenge, WorkoutSession } from '../data/types';

export const CHALLENGE_LENGTHS = [7, 14, 30] as const;
export type ChallengeLength = (typeof CHALLENGE_LENGTHS)[number];

/** Mirrors the database rule: at most 5 active days in every 7, so every challenge leaves rest days. */
export const maxTargetDays = (length: number) => Math.floor((length * 5) / 7);
/** Gentle default: about three active days a week. */
export const defaultTargetDays = (length: number) => Math.ceil((length * 3) / 7);

export function isValidChallenge(length: number, target: number): boolean {
  return (
    (CHALLENGE_LENGTHS as readonly number[]).includes(length) &&
    Number.isInteger(target) &&
    target >= 1 &&
    target <= maxTargetDays(length)
  );
}

const DAY_MS = 86_400_000;
const dayNum = (k: string) => Math.floor(Date.parse(`${k}T00:00:00Z`) / DAY_MS);

export interface ChallengeProgress {
  /** Different days with a completed session inside the challenge window. */
  activeDays: number;
  targetDays: number;
  /** Whole days remaining including today; 0 once the window has passed. */
  daysLeft: number;
  /** The window (start .. start + length - 1) has passed. */
  ended: boolean;
  met: boolean;
  /** 0..1 for display. */
  fraction: number;
  /** Which of those days came from where. A day with several kinds counts once in `activeDays` and once in each kind. */
  byKind: { dance: number; walking: number; strength: number };
}

export function challengeProgress(
  c: Pick<FitChallenge, 'startDate' | 'lengthDays' | 'targetDays'>,
  sessions: WorkoutSession[],
  timeZone: string | null,
  now: Date,
  /** Optional logged walks and strength sessions. They count as active days alongside dance, so a challenge suits whichever movement the person chose. */
  wellness: readonly Pick<WellnessEntry, 'kind' | 'day'>[] = [],
): ChallengeProgress {
  const start = dayNum(c.startDate);
  const end = start + c.lengthDays - 1;
  const days = new Set<number>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedAt) continue;
    const d = dayNum(localDateKey(s.completedAt, timeZone));
    if (d >= start && d <= end) days.add(d);
  }
  const dance = new Set(days);
  const walking = new Set<number>();
  const strength = new Set<number>();
  for (const e of wellness) {
    if (e.kind !== 'walk' && e.kind !== 'strength') continue;
    const d = dayNum(e.day);
    if (d < start || d > end) continue;
    days.add(d);
    (e.kind === 'walk' ? walking : strength).add(d);
  }
  const today = dayNum(localDateKey(now, timeZone));
  const activeDays = days.size;
  return {
    activeDays,
    targetDays: c.targetDays,
    daysLeft: Math.max(0, end - today + 1),
    ended: today > end,
    met: activeDays >= c.targetDays,
    fraction: Math.min(1, activeDays / c.targetDays),
    byKind: { dance: dance.size, walking: walking.size, strength: strength.size },
  };
}
