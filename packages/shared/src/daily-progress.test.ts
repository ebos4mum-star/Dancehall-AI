import { describe, expect, it } from 'vitest';
import { GOAL_INTENTS, dailyProgress, type DailyProgressInput } from './index';

const base: DailyProgressInput = {
  goal: 'fitness',
  movementMinutes: 0,
  plannedSessions: 0,
  movementGoalMinutes: null,
  mealsLogged: 0,
  hideFood: false,
  waterMl: 0,
  waterGoalMl: null,
  habitsDone: 0,
  habitsTotal: 0,
};

describe('daily progress', () => {
  it('an empty day is neutral: nothing is expected, nothing is "behind", and every goal has its own sentence', () => {
    const phrases = new Set<string>();
    for (const goal of GOAL_INTENTS) {
      const p = dailyProgress({ ...base, goal });
      expect(p.partsDone).toBe(0);
      expect(p.summary).toMatch(/^Nothing is expected of you today/);
      expect(p.summary).not.toMatch(/behind|missed|failed|only|still need/i);
      phrases.add(p.summary);
    }
    expect(phrases.size).toBe(GOAL_INTENTS.length);
  });
  it('connects what was done today to the person’s goal', () => {
    const p = dailyProgress({
      ...base,
      goal: 'strength',
      movementMinutes: 25,
      mealsLogged: 2,
      waterMl: 500,
      waterGoalMl: 2000,
    });
    expect(p.summary).toBe(
      'Today so far: moved for 25 min, 2 meals logged, logged water. That all supports your goal to build strength.',
    );
    expect(p.partsDone).toBe(3);
    expect(p.partsTotal).toBe(3);
    expect(dailyProgress({ ...base, goal: 'gain', movementMinutes: 10 }).summary).toMatch(
      /goal to gain weight gently\.$/,
    );
    expect(dailyProgress({ ...base, goal: 'lose', mealsLogged: 1 }).summary).toMatch(
      /goal to lose weight at a gentle pace\.$/,
    );
    expect(dailyProgress({ ...base, goal: 'maintain', movementMinutes: 10 }).summary).toMatch(
      /keep your weight steady/,
    );
  });
  it('dance workouts, food logging and goal share one picture: planned workouts show when nothing is done yet', () => {
    expect(dailyProgress({ ...base, plannedSessions: 2 }).items[0]!.text).toBe(
      '2 workouts planned',
    );
    expect(dailyProgress({ ...base, plannedSessions: 1 }).items[0]!.text).toBe('1 workout planned');
    expect(dailyProgress({ ...base, movementMinutes: 30 }).items[0]).toMatchObject({
      done: true,
      text: 'Moved for 30 min',
    });
  });
  it('bars appear only against a target the person set themselves, and cap at full', () => {
    expect(dailyProgress({ ...base, movementMinutes: 15 }).items[0]!.fraction).toBeNull();
    expect(
      dailyProgress({ ...base, movementMinutes: 15, movementGoalMinutes: 30 }).items[0]!.fraction,
    ).toBe(0.5);
    expect(
      dailyProgress({ ...base, movementMinutes: 90, movementGoalMinutes: 30 }).items[0]!.fraction,
    ).toBe(1);
    expect(
      dailyProgress({ ...base, waterMl: 1000, waterGoalMl: 2000 }).items.find(
        (x) => x.id === 'water',
      )!.fraction,
    ).toBe(0.5);
  });
  it('says nothing about food when food must be hidden, but keeps movement, water and habits', () => {
    const p = dailyProgress({
      ...base,
      hideFood: true,
      movementMinutes: 20,
      mealsLogged: 3,
      habitsTotal: 2,
      habitsDone: 1,
      waterMl: 250,
      waterGoalMl: 2000,
    });
    expect(p.items.map((x) => x.id)).toEqual(['move', 'water', 'habits']);
    expect(JSON.stringify(p)).not.toMatch(/\b(meals?|food|ate|eat|eating)\b/i);
    expect(p.partsTotal).toBe(3);
  });
  it('never mentions calories, scores, streaks or promises', () => {
    const p = dailyProgress({
      ...base,
      goal: 'lose',
      movementMinutes: 30,
      mealsLogged: 3,
      habitsTotal: 3,
      habitsDone: 3,
      waterMl: 2000,
      waterGoalMl: 2000,
    });
    expect(JSON.stringify(p)).not.toMatch(/kcal|calorie|score|streak|guarantee|will lose|burn/i);
  });
  it('water appears only when the person uses it, and habits only when they have some', () => {
    expect(dailyProgress(base).items.map((x) => x.id)).toEqual(['move', 'food']);
    expect(dailyProgress({ ...base, waterGoalMl: 2000 }).items.map((x) => x.id)).toContain('water');
    expect(dailyProgress({ ...base, habitsTotal: 1 }).items.map((x) => x.id)).toContain('habits');
  });
});
