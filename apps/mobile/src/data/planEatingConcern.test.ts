import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { nextUp } from '../today/nextUp';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T13:00:00Z');
const DAY = '2026-06-15';

describe('the real store builds the Daily Fit Plan without food prompts for an eating concern', () => {
  it('and the Today "next up" never points at food; food features stay reachable by the person', async () => {
    const s = new MockStore(memory(), NOW);
    await s.signInDev();
    await s.setConsent('health_data_processing', true);
    expect((await s.regenerateDailyPlan!('normal', DAY)).items.some((i) => i.kind === 'meal')).toBe(
      true,
    );
    await s.setWellnessPrefs!({ eatingConcern: true });
    for (const mode of ['normal', 'busy', 'travel', 'comeback'] as const) {
      const plan = await s.regenerateDailyPlan!(mode, DAY);
      expect(
        plan.items.some((i) => i.kind === 'meal'),
        mode,
      ).toBe(false);
      const n = nextUp(plan.items);
      if (n.kind === 'item') expect(n.action, mode).not.toBe('log_food');
    }
    // Voluntary use is untouched: the person can still log a meal themselves.
    const log = await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-15T12:00:00Z',
      items: [
        {
          name: 'Rice',
          foodId: null,
          grams: 100,
          kcal: 130,
          proteinG: 2,
          carbsG: 28,
          fatG: 0,
          kcalLow: 110,
          kcalHigh: 150,
          source: 'user_manual',
          confidence: 'high',
          userEdited: true,
        },
      ],
    });
    expect(log.items).toHaveLength(1);
    expect(await s.listFoodLogs()).toHaveLength(1);
    // Turning the preference off brings the ordinary plan back.
    await s.setWellnessPrefs!({ eatingConcern: false });
    expect((await s.regenerateDailyPlan!('normal', DAY)).items.some((i) => i.kind === 'meal')).toBe(
      true,
    );
  });
});
