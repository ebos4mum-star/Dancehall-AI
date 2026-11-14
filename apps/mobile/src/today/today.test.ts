import { describe, expect, it } from 'vitest';
import type { DailyPlanItem } from '@/data/types';
import { accomplishmentScore, accomplishments } from './accomplishments';
import { nextUp } from './nextUp';
import { takeWelcome, type DayStore } from './welcome';

const item = (p: Partial<DailyPlanItem> & { position: number }): DailyPlanItem => ({
  id: `i${p.position}`,
  kind: 'habit',
  title: 't',
  detail: 'd',
  why: 'w',
  doneAt: null,
  ...p,
});

describe('nextUp', () => {
  it('handles empty, all-done and the first undone item in plan order', () => {
    expect(nextUp(null)).toEqual({ kind: 'empty' });
    expect(nextUp([])).toEqual({ kind: 'empty' });
    expect(nextUp([item({ position: 0, doneAt: 'x' })])).toEqual({ kind: 'allDone' });
    const r = nextUp([item({ position: 2, kind: 'goal' }), item({ position: 1, kind: 'meal' })]);
    expect(r).toMatchObject({ kind: 'item', action: 'log_food' });
  });
  it('maps each kind to one action, and a workout without a ref goes to the Dance tab', () => {
    const a = (k: DailyPlanItem['kind'], ref?: DailyPlanItem['ref']) =>
      (nextUp([item({ position: 0, kind: k, ref })]) as { action: string }).action;
    expect(a('workout', { workoutId: 'w' })).toBe('start');
    expect(a('workout')).toBe('dance');
    expect(a('habit')).toBe('tick');
    expect(a('goal')).toBe('weigh');
  });
  it('skips done items', () => {
    const r = nextUp([item({ position: 0, doneAt: 'x' }), item({ position: 1, kind: 'meal' })]);
    expect(r).toMatchObject({ kind: 'item', action: 'log_food' });
  });
});

describe('accomplishments', () => {
  const none = {
    sessionsDone: [],
    mealsLogged: 0,
    loggedKcal: 0,
    habitsDone: [],
    planItemsDone: 0,
    planItemsTotal: 4,
  };
  it('is empty when nothing is recorded, and lists only what is real', () => {
    expect(accomplishments(none)).toEqual([]);
    expect(accomplishmentScore(none)).toBe(0);
    const r = accomplishments({
      sessionsDone: [{ title: 'Latin Rhythm', minutes: 10 }],
      mealsLogged: 2,
      loggedKcal: 640,
      habitsDone: ['Stretch'],
      planItemsDone: 2,
      planItemsTotal: 4,
    });
    expect(r.map((x) => x.kind)).toEqual(['dance', 'food', 'habit', 'plan']);
    expect(r[1]!.text).toBe('2 meals logged (about 640 kcal)');
    expect(r[3]!.text).toBe('2 of 4 plan ideas done');
  });
  it('never claims calories burned or health outcomes', () => {
    const r = accomplishments({
      ...none,
      sessionsDone: [{ title: 'x', minutes: 5 }],
      mealsLogged: 1,
      loggedKcal: 300,
    });
    expect(JSON.stringify(r)).not.toMatch(/burn|lost|weight loss/i);
  });
});

describe('takeWelcome', () => {
  const mem = (): DayStore => {
    const m = new Map<string, string>();
    return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
  };
  it('welcomes once per day per person', async () => {
    const s = mem();
    expect(await takeWelcome(s, 'u1', '2026-06-15')).toBe(true);
    expect(await takeWelcome(s, 'u1', '2026-06-15')).toBe(false);
    expect(await takeWelcome(s, 'u2', '2026-06-15')).toBe(true);
    expect(await takeWelcome(s, 'u1', '2026-06-16')).toBe(true);
  });
  it('does not welcome when storage fails', async () => {
    const bad: DayStore = {
      get: async () => {
        throw new Error('x');
      },
      set: async () => {},
    };
    expect(await takeWelcome(bad, 'u', 'd')).toBe(false);
  });
});
