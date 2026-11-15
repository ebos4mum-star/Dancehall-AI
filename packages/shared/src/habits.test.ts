import { describe, expect, it } from 'vitest';
import { STARTER_HABITS, habitSignals, starterFor, starterIdeas } from './index';

const base = {
  foodItemsToday: [],
  mealsToday: 0,
  sessionsCompletedToday: 0,
  wellnessToday: [],
  hideFoodSignals: false,
};

describe('starter habits', () => {
  it('are short, fit the 40-character habit limit, are unique, and never use streak or penalty language', () => {
    const names = STARTER_HABITS.map((h) => h.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const h of STARTER_HABITS) {
      expect(h.name.length, h.name).toBeLessThanOrEqual(40);
      expect(`${h.name} ${h.why}`).not.toMatch(
        /streak|miss|fail|guilt|cheat|burn|detox|diet|lose weight|calorie/i,
      );
    }
    expect(STARTER_HABITS.some((h) => h.kind === 'nutrition')).toBe(true);
    expect(STARTER_HABITS.some((h) => h.kind === 'fitness')).toBe(true);
  });
  it('offers up to three ideas the person does not already have, inside the five-habit cap', () => {
    const a = starterIdeas({ existingNames: [], eatingConcern: false, room: 5 });
    expect(a).toHaveLength(3);
    const b = starterIdeas({
      existingNames: [a[0]!.name.toUpperCase()],
      eatingConcern: false,
      room: 5,
    });
    expect(b.map((h) => h.name)).not.toContain(a[0]!.name);
    expect(starterIdeas({ existingNames: [], eatingConcern: false, room: 0 })).toEqual([]);
    expect(starterIdeas({ existingNames: [], eatingConcern: false, room: 1 })).toHaveLength(1);
  });
  it('offers no nutrition ideas to someone with an eating concern', () => {
    const all = starterIdeas({ existingNames: [], eatingConcern: true, room: 5, max: 20 });
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((h) => h.kind !== 'nutrition')).toBe(true);
  });
  it('recognises a starter habit by its name, ignoring case and spaces', () => {
    expect(starterFor('  log one MEAL ')?.signal).toBe('meal_logged');
    expect(starterFor('My own habit')).toBeUndefined();
  });
});

describe('habit hints from today’s logs', () => {
  it('nothing logged means no hints', () => {
    expect([...habitSignals(base)]).toEqual([]);
  });
  it('food hints: a meal, and a vegetable or fruit from the reference table (not guessed for hand-entered food)', () => {
    const s = habitSignals({
      ...base,
      mealsToday: 1,
      foodItemsToday: [{ foodId: 'spinach-cooked' }, { foodId: null }],
    });
    expect(s.has('meal_logged')).toBe(true);
    expect(s.has('veg_fruit_logged')).toBe(true);
    const grain = habitSignals({
      ...base,
      mealsToday: 1,
      foodItemsToday: [{ foodId: 'white-rice' }, { foodId: null }],
    });
    expect(grain.has('veg_fruit_logged')).toBe(false);
  });
  it('movement and water hints come from the person’s own logs', () => {
    const s = habitSignals({
      ...base,
      wellnessToday: [
        { kind: 'hydration', amount: 250 },
        { kind: 'walk', amount: 15 },
      ],
    });
    expect(s.has('water_logged')).toBe(true);
    expect(s.has('walk_logged')).toBe(true);
    expect(s.has('move_done')).toBe(true);
    expect(habitSignals({ ...base, sessionsCompletedToday: 1 }).has('move_done')).toBe(true);
    expect(
      habitSignals({ ...base, wellnessToday: [{ kind: 'walk', amount: 4 }] }).has('move_done'),
    ).toBe(false);
    expect(
      habitSignals({ ...base, wellnessToday: [{ kind: 'strength', amount: 12 }] }).has(
        'strength_logged',
      ),
    ).toBe(true);
  });
  it('produces no food hints at all when food analysis is off (hidden numbers or an eating concern), but movement hints remain', () => {
    const s = habitSignals({
      ...base,
      hideFoodSignals: true,
      mealsToday: 3,
      foodItemsToday: [{ foodId: 'banana' }],
      wellnessToday: [{ kind: 'walk', amount: 20 }],
    });
    expect(s.has('meal_logged')).toBe(false);
    expect(s.has('veg_fruit_logged')).toBe(false);
    expect(s.has('walk_logged')).toBe(true);
  });
  it('ignores impossible amounts', () => {
    expect(
      habitSignals({
        ...base,
        wellnessToday: [
          { kind: 'walk', amount: Number.NaN },
          { kind: 'hydration', amount: 0 },
        ],
      }).size,
    ).toBe(0);
  });
});
