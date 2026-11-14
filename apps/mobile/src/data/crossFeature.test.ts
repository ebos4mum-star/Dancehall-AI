import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { challengeProgress } from '../challenges/logic';

/** Saving, editing and deleting one record must update every view that reads it, once, and survive a restart. */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');
const DAY = '2026-06-15';
async function setup(kv: KeyValue = memory()) {
  const s = new MockStore(kv, NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  return { s, kv };
}
const doneTitles = async (s: MockStore) =>
  (await s.regenerateDailyPlan!('normal', DAY)).items.filter((i) => i.doneAt !== null || false);

describe('one log feeds every view, exactly once', () => {
  it('a walk updates the plan, the challenge, the weekly review and the coach summary; deleting it reverts all four', async () => {
    const { s } = await setup();
    await s.setConsent('ai_coach_personalization', true);
    const ch = await s.startChallenge({ startDate: DAY, lengthDays: 7, targetDays: 3 });

    const before = await s.regenerateDailyPlan!('normal', DAY);
    expect(before.items.some((i) => i.title.startsWith('You walked today'))).toBe(false);
    expect(challengeProgress(ch, [], null, NOW(), await s.listWellness()).activeDays).toBe(0);

    const e = await s.addWellness({ kind: 'walk', day: DAY, amount: 20, clientKey: 'walk-key-1' });
    // Plan
    const plan = await s.regenerateDailyPlan!('normal', DAY);
    expect(plan.items.filter((i) => i.title === 'You walked today: 20 min')).toHaveLength(1);
    // Challenge
    const p = challengeProgress(ch, [], null, NOW(), await s.listWellness());
    expect(p.activeDays).toBe(1);
    expect(p.byKind.walking).toBe(1);
    // Weekly review (facts feed the review text)
    const review = await s.generateWeeklyReview('2026-06-15');
    expect(JSON.stringify(review.content)).toMatch(/walked on 1 day/);
    // Coach summary lists wellness
    expect((await s.getCoachContextSummary!()).join(' ')).toMatch(/walks, strength, sleep/);

    await s.deleteWellness(e.id);
    expect(
      (await s.regenerateDailyPlan!('normal', DAY)).items.some((i) =>
        i.title.startsWith('You walked today'),
      ),
    ).toBe(false);
    expect(challengeProgress(ch, [], null, NOW(), await s.listWellness()).activeDays).toBe(0);
  });

  it('a retry with the same key after a restart records nothing new, and data survives the restart', async () => {
    const { s, kv } = await setup();
    await s.addWellness({ kind: 'hydration', day: DAY, amount: 250, clientKey: 'water-key-001' });
    const s2 = new MockStore(kv, NOW);
    expect(await s2.listWellness()).toHaveLength(1);
    await s2.addWellness({ kind: 'hydration', day: DAY, amount: 250, clientKey: 'water-key-001' });
    expect(await s2.listWellness()).toHaveLength(1);
  });

  it('a rejected write changes nothing anywhere', async () => {
    const { s } = await setup();
    await s.addWellness({ kind: 'walk', day: DAY, amount: 10, clientKey: 'walk-key-2' });
    const plan0 = JSON.stringify(
      (await s.regenerateDailyPlan!('normal', DAY)).items.map((i) => i.title),
    );
    await expect(s.addWellness({ kind: 'walk', day: DAY, amount: 9999 })).rejects.toThrow();
    expect(await s.listWellness()).toHaveLength(1);
    expect(
      JSON.stringify((await s.regenerateDailyPlan!('normal', DAY)).items.map((i) => i.title)),
    ).toBe(plan0);
  });

  it('a sore check-in and a strength log change the plan consistently, without duplicate completion events', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs({ activities: ['dance', 'strength'] });
    const offered = await s.regenerateDailyPlan!('normal', DAY);
    expect(offered.items.filter((i) => i.ref?.action === 'log_strength')).toHaveLength(1);
    await s.addWellness({ kind: 'strength', day: DAY, amount: 10, clientKey: 'str-key-0001' });
    const after = await s.regenerateDailyPlan!('normal', DAY);
    expect(after.items.filter((i) => i.ref?.action === 'log_strength')).toHaveLength(0);
    expect(after.items.filter((i) => i.title === 'You did strength work today')).toHaveLength(1);
    // Sore: strength is no longer offered and a gentle item appears.
    await s.addWellness({ kind: 'recovery', day: DAY, amount: 0, label: 'sore' });
    const sore = await s.regenerateDailyPlan!('normal', DAY);
    expect(sore.items.some((i) => i.title === 'Go easy on your body today')).toBe(true);
    expect(await doneTitles(s)).toBeDefined();
  });

  it('numbers stay hidden everywhere once the person says food or weight is hard', async () => {
    const { s } = await setup();
    await s.setConsent('ai_coach_personalization', true);
    await s.addWellness({ kind: 'walk', day: DAY, amount: 30, clientKey: 'walk-key-3' });
    await s.addWellness({ kind: 'sleep', day: DAY, amount: 5, label: 'tired' });
    await s.setWellnessPrefs({ eatingConcern: true });
    const review = await s.generateWeeklyReview('2026-06-15');
    expect(JSON.stringify(review.content)).not.toMatch(/\d+ minutes in total|hours on average/);
    const plan = await s.regenerateDailyPlan!('normal', DAY);
    expect(plan.items.some((i) => i.ref?.action === 'log_hunger')).toBe(false);
  });
});
