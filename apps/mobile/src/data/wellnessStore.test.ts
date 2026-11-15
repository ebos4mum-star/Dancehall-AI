import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';
import { buildDataExport } from '../privacy/export';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );
async function setup(consent = true) {
  const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  if (consent) await s.setConsent('health_data_processing', true);
  return s;
}
const DAY = '2026-06-15';

describe('mock wellness logs', () => {
  it('records each kind and lists newest first', async () => {
    const s = await setup();
    await s.addWellness({ kind: 'hydration', day: DAY, amount: 250 });
    await s.addWellness({ kind: 'walk', day: '2026-06-14', amount: 30, amount2: 2.1 });
    const list = await s.listWellness();
    expect(list.map((e) => e.kind)).toEqual(['hydration', 'walk']);
    expect(list[1]).toMatchObject({ amount: 30, amount2: 2.1, label: null });
    expect(await s.listWellness('2026-06-15')).toHaveLength(1);
  });
  it('needs health-data consent, like the database', async () => {
    const s = await setup(false);
    expect(await code(s.addWellness({ kind: 'hydration', day: DAY, amount: 250 }))).toBe(
      'consent_required',
    );
    expect(await code(s.setWellnessPrefs({ goalIntent: 'lose' }))).toBe('consent_required');
  });
  it('rejects invalid entries with the same rules as the database', async () => {
    const s = await setup();
    expect(await code(s.addWellness({ kind: 'hydration', day: DAY, amount: 0 }))).toBe(
      'invalid_input',
    );
    expect(await code(s.addWellness({ kind: 'sleep', day: DAY, amount: 30 }))).toBe(
      'invalid_input',
    );
    expect(await code(s.addWellness({ kind: 'measurement', day: DAY, amount: 80 }))).toBe(
      'invalid_input',
    );
    expect(await code(s.addWellness({ kind: 'walk', day: '2026-12-31', amount: 20 }))).toBe(
      'invalid_input',
    );
  });
  it('a repeated client key never records a second entry (double tap / retry)', async () => {
    const s = await setup();
    const a = await s.addWellness({
      kind: 'strength',
      day: DAY,
      amount: 20,
      label: 'bodyweight',
      clientKey: 'tap-key-0001',
    });
    const b = await s.addWellness({
      kind: 'strength',
      day: DAY,
      amount: 20,
      label: 'bodyweight',
      clientKey: 'tap-key-0001',
    });
    expect(b.id).toBe(a.id);
    expect(await s.listWellness()).toHaveLength(1);
  });
  it('allows one sleep entry per night; correct by deleting and re-adding', async () => {
    const s = await setup();
    const e = await s.addWellness({ kind: 'sleep', day: DAY, amount: 7, label: 'ok' });
    expect(await code(s.addWellness({ kind: 'sleep', day: DAY, amount: 6 }))).toBe('invalid_input');
    await s.deleteWellness(e.id);
    await s.addWellness({ kind: 'sleep', day: DAY, amount: 6 });
    expect((await s.listWellness())[0]!.amount).toBe(6);
  });
  it('deleting an entry removes it, and deleting a missing one is harmless', async () => {
    const s = await setup();
    const e = await s.addWellness({ kind: 'hydration', day: DAY, amount: 500 });
    await s.deleteWellness(e.id);
    await s.deleteWellness(e.id);
    expect(await s.listWellness()).toEqual([]);
  });
});

describe('mock wellness preferences', () => {
  it('defaults to fitness (weight loss is never the default) and merges patches', async () => {
    const s = await setup();
    expect((await s.getWellnessPrefs()).goalIntent).toBe('fitness');
    await s.setWellnessPrefs({ goalIntent: 'lose', activities: ['dance', 'walking'] });
    await s.setWellnessPrefs({ tracking: 'none' });
    const p = await s.getWellnessPrefs();
    expect(p).toMatchObject({
      goalIntent: 'lose',
      tracking: 'none',
      activities: ['dance', 'walking'],
    });
  });
  it('the goal can be changed later', async () => {
    const s = await setup();
    await s.setWellnessPrefs({ goalIntent: 'lose' });
    await s.setWellnessPrefs({ goalIntent: 'maintain' });
    expect((await s.getWellnessPrefs()).goalIntent).toBe('maintain');
  });
  it('is included in the data export, together with the logs', async () => {
    const s = await setup();
    await s.addWellness({ kind: 'hydration', day: DAY, amount: 250 });
    await s.setWellnessPrefs({ diet: ['vegan'] });
    const x = await buildDataExport(s);
    expect(x.wellness).toHaveLength(1);
    expect((x.wellnessPrefs as { diet: string[] }).diet).toEqual(['vegan']);
  });
  it('resetting development data clears them', async () => {
    const s = await setup();
    await s.addWellness({ kind: 'hydration', day: DAY, amount: 250 });
    await s.resetDevData();
    await s.signInDev();
    expect(await s.listWellness()).toEqual([]);
  });
});

describe('weight-management engine preferences (storage compatibility)', () => {
  it('saves and reloads the new preferences without dropping them, and an unrelated save keeps them', async () => {
    const s = await setup();
    await s.setWellnessPrefs({
      goalIntent: 'strength',
      pathways: ['strength_training', 'cultural_eating'],
      danceStyles: ['dancehall', 'afrobeats'],
      cuisines: ['caribbean'],
      mobility: ['seated'],
      experience: 'some',
      schedule: 'evening',
    });
    await s.setWellnessPrefs({ waterGoalMl: 2000 });
    expect(await s.getWellnessPrefs()).toMatchObject({
      goalIntent: 'strength',
      pathways: ['strength_training', 'cultural_eating'],
      danceStyles: ['dancehall', 'afrobeats'],
      cuisines: ['caribbean'],
      mobility: ['seated'],
      experience: 'some',
      schedule: 'evening',
      waterGoalMl: 2000,
    });
  });
  it('an existing person’s goal is never reset by saving other preferences', async () => {
    const s = await setup();
    await s.setWellnessPrefs({ goalIntent: 'maintain', tracking: 'detailed' });
    await s.setWellnessPrefs({ cuisines: ['west_african'] });
    await s.setWellnessPrefs({ experience: 'new' });
    expect(await s.getWellnessPrefs()).toMatchObject({
      goalIntent: 'maintain',
      tracking: 'detailed',
      cuisines: ['west_african'],
      experience: 'new',
    });
  });
});
