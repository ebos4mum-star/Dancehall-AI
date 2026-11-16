import { useSyncExternalStore } from 'react';
import type { BadgeId, CosmeticId, GmState, Quest } from '@dancehall/shared';
import type { GmDevicePrefs } from './prefs';
import { DEFAULT_DEVICE_PREFS } from './prefs';
import { celebrationPolicy, type CelebrationPolicy } from './policy';
import type { RewardSummary } from './rewards';

/** The confirmed progression every screen shows (Home, Workouts, Nutrition, Progress, Friends, Settings). One copy, so they can never disagree. */
export interface ConfirmedState {
  totalXp: number;
  weekXp: number;
  level: GmState['level'];
  streak: GmState['streak'];
  restNudge: boolean;
  dailyQuests: Quest[];
  weeklyQuests: Quest[];
  badges: BadgeId[];
  cosmetics: CosmeticId[];
  seasonal: { id: string; activeDays: number; goalDays: number; done: boolean };
}
export interface RewardEvent {
  id: number;
  at: number;
  summary: RewardSummary;
  /** Free-form label for a reward that did not come from the XP engine (a completed group goal). */
  groupGoal?: string;
}
export type WeekDot = 'active' | 'rest' | 'open' | 'missed' | 'future';
export interface ProgressionView {
  ready: boolean;
  enabled: boolean;
  /** Between a change and its confirmation: the numbers shown are the last confirmed ones. */
  pending: boolean;
  state: ConfirmedState | null;
  fromServer: boolean;
  prefs: GmDevicePrefs;
  /** Accessories Pulse wears now: unlocked and equipped. */
  wearing: CosmeticId[];
  /** Monday to Sunday of this week, from the person's own records (display only; the counts come from the confirmed state). */
  weekDots: WeekDot[];
  reward: RewardEvent | null;
  policy: CelebrationPolicy;
}
export interface ProgressionActions {
  setPrefs(patch: Partial<GmDevicePrefs>): Promise<void>;
  /** The person turned on equip/unequip for one accessory. */
  setEquipped(id: CosmeticId, on: boolean): Promise<void>;
  dismissReward(): void;
  /** A group goal was completed (called by the Friends screen when it sees one for the first time). */
  announceGroupGoal(title: string, key: string): Promise<void>;
  /** Apple Health import brought in this many workouts; the reward summary that follows says so. */
  noteImported(n: number): void;
}

const noop = async () => undefined;
const IDLE: ProgressionView = {
  ready: false,
  enabled: false,
  pending: false,
  state: null,
  fromServer: false,
  prefs: DEFAULT_DEVICE_PREFS,
  wearing: [],
  weekDots: ['future', 'future', 'future', 'future', 'future', 'future', 'future'],
  reward: null,
  policy: celebrationPolicy('full', false),
};
let view: ProgressionView = IDLE;
let actions: ProgressionActions = {
  setPrefs: noop,
  setEquipped: noop,
  dismissReward: () => undefined,
  announceGroupGoal: noop,
  noteImported: () => undefined,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getProgression = (): ProgressionView => view;
export function setProgression(next: Partial<ProgressionView>): void {
  view = { ...view, ...next };
  emit();
}
export function registerProgressionActions(a: ProgressionActions): () => void {
  actions = a;
  return () => {
    actions = {
      setPrefs: noop,
      setEquipped: noop,
      dismissReward: () => undefined,
      announceGroupGoal: noop,
      noteImported: () => undefined,
    };
  };
}
export const progressionActions = (): ProgressionActions => actions;
export function resetProgressionForTest(): void {
  view = IDLE;
  listeners.clear();
}
export function useProgression(): ProgressionView & ProgressionActions {
  const v = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getProgression,
    getProgression,
  );
  return { ...v, ...actions };
}
