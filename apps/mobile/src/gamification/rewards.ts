import type { BadgeId, CosmeticId, Quest, QuestId } from '@dancehall/shared';
import { questEventId } from '@dancehall/shared';

/** Milestones (active days in a row) worth a celebration. Gentle spacing, no loss framing. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

/** What the person's progression looks like at one confirmed moment. Built from the server's answer, or from the engine over the person's records when there is no server. */
export interface ProgressSnapshot {
  totalXp: number;
  level: number;
  streakCurrent: number;
  badges: readonly BadgeId[];
  cosmetics: readonly CosmeticId[];
  /** Ids of quests done (daily and weekly), `quest:<period>:<id>`. */
  questsDone: readonly string[];
  seasonId: string;
  seasonDone: boolean;
}

/** What has already been shown to this person on this phone. Persisted per account. */
export interface SeenState {
  baselined: boolean;
  xpSeen: number;
  levelSeen: number;
  badgesSeen: string[];
  /**
   * The local day this phone first saw each badge, ONLY for badges that appeared after this phone's baseline. A badge already present at the baseline has no entry,
   * because the baseline day says nothing about when it was earned.
   */
  badgeRecorded: Record<string, string>;
  cosmeticsSeen: string[];
  questsSeen: string[];
  streakMilestoneSeen: number;
  seasonDoneSeen: string | null;
  /** Toast budget for the repetition limit. */
  toastDay: string;
  toastCount: number;
}
export const EMPTY_SEEN: SeenState = {
  baselined: false,
  xpSeen: 0,
  levelSeen: 1,
  badgesSeen: [],
  badgeRecorded: {},
  cosmeticsSeen: [],
  questsSeen: [],
  streakMilestoneSeen: 0,
  seasonDoneSeen: null,
  toastDay: '',
  toastCount: 0,
};

export interface RewardSummary {
  xpGained: number;
  levelUp: number | null;
  badges: BadgeId[];
  cosmetics: CosmeticId[];
  questsDone: QuestId[];
  streakMilestone: number | null;
  seasonDone: boolean;
  /** Apple Health workouts brought in since the last confirmation (set by the caller, never by the diff). */
  importedWorkouts: number;
}
export const NO_REWARD: RewardSummary = {
  xpGained: 0,
  levelUp: null,
  badges: [],
  cosmetics: [],
  questsDone: [],
  streakMilestone: null,
  seasonDone: false,
  importedWorkouts: 0,
};
export const hasReward = (s: RewardSummary): boolean =>
  s.xpGained > 0 ||
  s.levelUp !== null ||
  s.badges.length > 0 ||
  s.cosmetics.length > 0 ||
  s.questsDone.length > 0 ||
  s.streakMilestone !== null ||
  s.seasonDone;

/** The one thing Pulse should react to, highest first. */
export type PrimaryReaction =
  'level_up' | 'badge' | 'streak' | 'season' | 'cosmetic' | 'quest' | 'xp' | null;
export function primaryReaction(s: RewardSummary): PrimaryReaction {
  if (s.levelUp !== null) return 'level_up';
  if (s.badges.length) return 'badge';
  if (s.streakMilestone !== null) return 'streak';
  if (s.seasonDone) return 'season';
  if (s.cosmetics.length) return 'cosmetic';
  if (s.questsDone.length) return 'quest';
  if (s.xpGained > 0) return 'xp';
  return null;
}

const asSeen = (n: ProgressSnapshot, prev: SeenState): SeenState => ({
  ...prev,
  baselined: true,
  xpSeen: n.totalXp,
  levelSeen: n.level,
  badgesSeen: [...n.badges],
  cosmeticsSeen: [...n.cosmetics],
  questsSeen: [...n.questsDone].slice(-200),
  streakMilestoneSeen: Math.max(0, ...STREAK_MILESTONES.filter((m) => m <= n.streakCurrent)),
  seasonDoneSeen: n.seasonDone ? n.seasonId : null,
});

/**
 * Which rewards are NEW since the person last saw their progression, from a CONFIRMED snapshot only (never from a guess before the server or the records have answered).
 * The first snapshot ever seen on a phone only sets the baseline and celebrates nothing, so a reinstall or a new phone never replays old achievements.
 * Quiet decreases (a deleted workout) lower the baseline without any message. Everything is idempotent: the same snapshot twice gives nothing the second time.
 */
export function diffRewards(
  next: ProgressSnapshot,
  seen: SeenState,
  /** The local day of this confirmation; used only to record when a NEW badge was first seen. */
  today?: string,
): { summary: RewardSummary; seen: SeenState } {
  if (!seen.baselined) return { summary: NO_REWARD, seen: asSeen(next, seen) };
  const newBadges = next.badges.filter((b) => !seen.badgesSeen.includes(b));
  const newCosmetics = next.cosmetics.filter((c) => !seen.cosmeticsSeen.includes(c));
  const newQuests = next.questsDone.filter((q) => !seen.questsSeen.includes(q));
  const milestone = Math.max(0, ...STREAK_MILESTONES.filter((m) => m <= next.streakCurrent));
  const summary: RewardSummary = {
    xpGained: Math.max(0, next.totalXp - seen.xpSeen),
    levelUp: next.level > seen.levelSeen ? next.level : null,
    badges: newBadges,
    cosmetics: newCosmetics,
    questsDone: newQuests.map((q) => q.split(':')[2] as QuestId),
    streakMilestone: milestone > seen.streakMilestoneSeen ? milestone : null,
    seasonDone: next.seasonDone && seen.seasonDoneSeen !== next.seasonId,
    importedWorkouts: 0,
  };
  const updated: SeenState = {
    ...asSeen(next, seen),
    // Keep what was seen for quests, so a quest that drops out of the window is not announced again.
    questsSeen: [...new Set([...seen.questsSeen, ...next.questsDone])].slice(-200),
    // A milestone is never lowered by a quiet week (it would be celebrated again on the way back up).
    streakMilestoneSeen: Math.max(seen.streakMilestoneSeen, milestone),
    badgesSeen: [...new Set([...seen.badgesSeen, ...next.badges])],
    badgeRecorded: {
      ...seen.badgeRecorded,
      ...(today ? Object.fromEntries(newBadges.map((b) => [b, today])) : {}),
    },
    cosmeticsSeen: [...new Set([...seen.cosmeticsSeen, ...next.cosmetics])],
    levelSeen: Math.max(seen.levelSeen, next.level),
  };
  return { summary, seen: updated };
}

/** Builds the snapshot from either the server's answer or the engine's state (both have the same fields). */
export function snapshotOf(s: {
  totalXp: number;
  level: { level: number };
  streak: { current: number };
  badges: readonly BadgeId[];
  cosmetics: readonly CosmeticId[];
  dailyQuests: readonly Quest[];
  weeklyQuests: readonly Quest[];
  seasonal: { id?: string; season?: { id: string }; done: boolean };
}): ProgressSnapshot {
  return {
    totalXp: s.totalXp,
    level: s.level.level,
    streakCurrent: s.streak.current,
    badges: s.badges,
    cosmetics: s.cosmetics,
    questsDone: [...s.dailyQuests, ...s.weeklyQuests]
      .filter((q) => q.done)
      .map((q) => questEventId(q)),
    seasonId: s.seasonal.id ?? s.seasonal.season?.id ?? '',
    seasonDone: s.seasonal.done,
  };
}

/** Whether another celebration toast is allowed today, and the updated budget. */
export function takeToast(
  seen: SeenState,
  today: string,
  max: number,
): { ok: boolean; seen: SeenState } {
  const count = seen.toastDay === today ? seen.toastCount : 0;
  if (count >= max) return { ok: false, seen: { ...seen, toastDay: today, toastCount: count } };
  return { ok: true, seen: { ...seen, toastDay: today, toastCount: count + 1 } };
}
