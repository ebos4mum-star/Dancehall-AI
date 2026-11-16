import type { GoalIntent } from './wellness';

/**
 * One calm "your day" summary that connects dance and other movement, food logging, water, habits and the person's goal. It is a description, not a score:
 * no streaks, no percentages of a day, no "behind", and an empty day is just an empty day.
 *
 * Privacy and safety: with hidden numbers or an eating concern nothing about food is said (not even that meals were logged); movement, water and habits still appear.
 * The goal sentence never promises a result, never mentions calories, and mentions weight only in the goal's own words (the person chose it).
 */
export interface DailyProgressInput {
  /** The goal the numbers follow (the effective goal from the calorie engine). */
  goal: GoalIntent;
  /** Completed movement today, in minutes, from dance sessions and from logged walks and strength. */
  movementMinutes: number;
  plannedSessions: number;
  /** The person's own daily movement goal in minutes, if they set one. */
  movementGoalMinutes: number | null;
  mealsLogged: number;
  /** True when food must not be mentioned (hidden numbers, an eating concern, or tracking turned off). */
  hideFood: boolean;
  /** Water today and the person's goal, when hydration is in use (a goal exists or something was logged). */
  waterMl: number;
  waterGoalMl: number | null;
  habitsDone: number;
  habitsTotal: number;
}

export type DayItemId = 'move' | 'food' | 'water' | 'habits';
export interface DayItem {
  id: DayItemId;
  done: boolean;
  text: string;
  /** 0..1 for a calm bar, only when the person set a target of their own. */
  fraction: number | null;
}
export interface DailyProgress {
  items: DayItem[];
  /** How many of today's parts have something done, out of the parts that apply. A description, never a score. */
  partsDone: number;
  partsTotal: number;
  summary: string;
}

const GOAL_PHRASE: Record<GoalIntent, string> = {
  lose: 'lose weight at a gentle pace',
  maintain: 'keep your weight steady',
  gain: 'gain weight gently',
  fitness: 'improve your fitness',
  strength: 'build strength',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function dailyProgress(i: DailyProgressInput): DailyProgress {
  const items: DayItem[] = [];
  const move: DayItem =
    i.movementMinutes > 0
      ? {
          id: 'move',
          done: true,
          text: `Moved for ${Math.round(i.movementMinutes)} min`,
          fraction: i.movementGoalMinutes
            ? Math.min(1, i.movementMinutes / i.movementGoalMinutes)
            : null,
        }
      : {
          id: 'move',
          done: false,
          text:
            i.plannedSessions > 0
              ? `${plural(i.plannedSessions, 'workout', 'workouts')} planned`
              : 'No movement yet',
          fraction: i.movementGoalMinutes ? 0 : null,
        };
  items.push(move);
  if (!i.hideFood)
    items.push({
      id: 'food',
      done: i.mealsLogged > 0,
      text:
        i.mealsLogged > 0
          ? `${plural(i.mealsLogged, 'meal', 'meals')} logged`
          : 'No food logged yet',
      fraction: null,
    });
  if (i.waterGoalMl || i.waterMl > 0)
    items.push({
      id: 'water',
      done: i.waterMl > 0,
      text: i.waterMl > 0 ? 'Water logged' : 'No water logged yet',
      fraction: i.waterGoalMl ? Math.min(1, i.waterMl / i.waterGoalMl) : null,
    });
  if (i.habitsTotal > 0)
    items.push({
      id: 'habits',
      done: i.habitsDone > 0,
      text: `Habits: ${i.habitsDone} of ${i.habitsTotal} ticked`,
      fraction: null,
    });

  const done = items.filter((x) => x.done);
  const phrase = GOAL_PHRASE[i.goal];
  const did = done.map((x) =>
    x.id === 'move'
      ? `moved for ${Math.round(i.movementMinutes)} min`
      : x.id === 'food'
        ? plural(i.mealsLogged, 'meal', 'meals') + ' logged'
        : x.id === 'water'
          ? 'logged water'
          : 'ticked a habit',
  );
  const summary =
    done.length === 0
      ? `Nothing is expected of you today. One small step toward your goal to ${phrase} is plenty.`
      : `Today so far: ${did.join(', ')}. That all supports your goal to ${phrase}.`;
  return { items, partsDone: done.length, partsTotal: items.length, summary };
}
