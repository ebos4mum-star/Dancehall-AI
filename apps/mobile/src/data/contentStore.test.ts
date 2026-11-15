import { afterEach, describe, expect, it } from 'vitest';
import {
  WORKOUT_BY_ID,
  disableInternalFixtures,
  enableInternalFixtures,
  isSeatedSuitable,
  strengthEntryLabel,
  FIXTURE_STRENGTH_WORKOUTS,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';

/** The pipelines through the real mock store: seated plans, Dancehall preference, and strength completion tracking. Fixtures are placeholders, never real content. */
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
async function setup() {
  const s = new MockStore(memory(), NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  return s;
}
const workoutIds = async (s: MockStore, mode: 'normal' | 'busy' = 'normal') =>
  (await s.regenerateDailyPlan!(mode, DAY)).items
    .map((i) => i.ref?.workoutId)
    .filter(Boolean) as string[];

afterEach(() => disableInternalFixtures());

describe('seated preference in the plan the store builds', () => {
  it('without seated sessions the plan stays low impact and says honestly that seated sessions are missing', async () => {
    const s = await setup();
    await s.setWellnessPrefs!({ mobility: ['seated'] });
    const plan = await s.regenerateDailyPlan!('normal', DAY);
    const w = plan.items.find((i) => i.ref?.workoutId)!;
    expect(WORKOUT_BY_ID.get(w.ref!.workoutId!)!.impact).toBe('low');
    expect(w.why).toMatch(/Seated sessions are not in the catalogue yet/);
  });
  it('with seated sessions the plan offers one, low impact, with the reason', async () => {
    enableInternalFixtures();
    const s = await setup();
    await s.setWellnessPrefs!({ mobility: ['seated'] });
    for (const mode of ['normal', 'busy'] as const) {
      const plan = await s.regenerateDailyPlan!(mode, DAY);
      const item = plan.items.find((i) => i.ref?.workoutId)!;
      const w = WORKOUT_BY_ID.get(item.ref!.workoutId!)!;
      expect(isSeatedSuitable(w)).toBe(true);
      expect(w.impact).toBe('low');
      expect(item.why).toMatch(/seated/);
    }
  });
  it('people who did not ask for seated sessions are unaffected by their existence', async () => {
    const before = await workoutIds(await setup());
    enableInternalFixtures();
    const after = await workoutIds(await setup());
    expect(after).toEqual(before);
  });
});

describe('Dancehall and reggae preferences', () => {
  it('are honest when no such sessions exist, and use them when they do', async () => {
    const s = await setup();
    await s.setWellnessPrefs!({ danceStyles: ['dancehall'] });
    const none = (await s.regenerateDailyPlan!('normal', DAY)).items.find((i) => i.ref?.workoutId)!;
    expect(WORKOUT_BY_ID.get(none.ref!.workoutId!)!.style).not.toBe('dancehall');
    expect(none.why).toMatch(/Dancehall sessions are not in the catalogue yet/);
    enableInternalFixtures();
    const yes = (await s.regenerateDailyPlan!('normal', DAY)).items.find((i) => i.ref?.workoutId)!;
    expect(WORKOUT_BY_ID.get(yes.ref!.workoutId!)!.style).toBe('dancehall');
  });
});

describe('strength completion tracking', () => {
  it('a finished strength session is stored as the existing strength entry (minutes and equipment label) and counts for the day', async () => {
    const s = await setup();
    const w = FIXTURE_STRENGTH_WORKOUTS[0]!;
    await s.addWellness({
      kind: 'strength',
      day: DAY,
      amount: 12,
      label: strengthEntryLabel(w),
      clientKey: 'strength-test-0001',
    });
    const entries = await s.listWellness(DAY);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'strength', amount: 12, label: 'bodyweight' });
    const plan = await s.regenerateDailyPlan!('normal', DAY);
    expect(plan.items.some((i) => i.title === 'You did strength work today')).toBe(true);
  });
  it('saving the same session twice with the same key records it once', async () => {
    const s = await setup();
    const input = {
      kind: 'strength' as const,
      day: DAY,
      amount: 10,
      label: 'bodyweight',
      clientKey: 'key-0001-dup',
    };
    await s.addWellness(input);
    await s.addWellness(input);
    expect(await s.listWellness(DAY)).toHaveLength(1);
  });
});
