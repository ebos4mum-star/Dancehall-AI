import type { DailyPlanItem } from '@/data/types';

export type NextAction = 'start' | 'dance' | 'log_food' | 'tick' | 'weigh';
export type NextUp =
  | { kind: 'item'; item: DailyPlanItem; action: NextAction }
  | { kind: 'allDone' }
  | { kind: 'empty' };

/** The first plan item not yet done, with the one action that moves it forward. Reads the existing Daily Fit Plan; adds no logic of its own. */
export function nextUp(items: readonly DailyPlanItem[] | null | undefined): NextUp {
  if (!items || items.length === 0) return { kind: 'empty' };
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const item = sorted.find((i) => i.doneAt === null);
  if (!item) return { kind: 'allDone' };
  const action: NextAction =
    item.kind === 'workout'
      ? item.ref?.workoutId
        ? 'start'
        : 'dance'
      : item.kind === 'meal'
        ? 'log_food'
        : item.kind === 'goal'
          ? 'weigh'
          : 'tick';
  return { kind: 'item', item, action };
}
