import { describe, expect, it } from 'vitest';
import {
  FOOD_BY_ID,
  estimateStatus,
  itemFromFood,
  manualItem,
  planMeals,
  totals,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const clock = { t: new Date('2026-06-15T12:00:00Z') };
const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );

async function setup(opts: { aiConsent?: boolean } = {}) {
  clock.t = new Date('2026-06-15T12:00:00Z');
  const store = new MockStore(memory(), () => clock.t);
  await store.signInDev();
  await store.setConsent('health_data_processing', true);
  if (opts.aiConsent) await store.setConsent('ai_processing_of_food_photos', true);
  await store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
  await store.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await store.completeOnboarding();
  return store;
}
const rice = (g = 200) => itemFromFood(FOOD_BY_ID.get('white-rice')!, g);

describe('food diary', () => {
  it('manual logging needs only health-data consent (no AI consent)', async () => {
    const s = await setup();
    const log = await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [rice(), manualItem({ name: 'Homemade stew', grams: 250, kcal: 400 })],
    });
    expect(log.items).toHaveLength(2);
    expect((await s.listFoodLogs())[0]!.items[0]!.id).toBeTruthy();
  });
  it('photo-sourced logs and analysis need the separate AI consent', async () => {
    const s = await setup();
    expect(
      await code(s.createFoodLog({ mealType: 'lunch', source: 'photo', items: [rice()] })),
    ).toBe('ai_consent_required');
    expect(await code(s.analyzeMealPhoto({ seed: 0 }))).toBe('ai_consent_required');
    await s.setConsent('ai_processing_of_food_photos', true);
    await s.analyzeMealPhoto({ seed: 0 });
    await s.setConsent('ai_processing_of_food_photos', false);
    expect(await code(s.analyzeMealPhoto({ seed: 1 }))).toBe('ai_consent_required');
    // manual logging keeps working
    await s.createFoodLog({ mealType: 'snack', source: 'manual', items: [rice(100)] });
  });
  it('blocks writes after health consent is withdrawn but keeps reading', async () => {
    const s = await setup();
    await s.createFoodLog({ mealType: 'lunch', source: 'manual', items: [rice()] });
    await s.setConsent('health_data_processing', false);
    expect(
      await code(s.createFoodLog({ mealType: 'lunch', source: 'manual', items: [rice()] })),
    ).toBe('consent_required');
    expect(await s.listFoodLogs()).toHaveLength(1);
  });
  it('validates items like the database', async () => {
    const s = await setup();
    const ok = rice();
    for (const bad of [
      { ...ok, grams: 0 },
      { ...ok, kcal: 20000 },
      { ...ok, kcalLow: ok.kcal + 1 },
      { ...ok, kcalHigh: ok.kcal - 1 },
      { ...ok, name: '' },
      { ...ok, source: 'made_up' as never },
    ]) {
      expect(
        await code(s.createFoodLog({ mealType: 'lunch', source: 'manual', items: [bad] })),
      ).toBe('invalid_input');
    }
    expect(await code(s.createFoodLog({ mealType: 'lunch', source: 'manual', items: [] }))).toBe(
      'invalid_input',
    );
    expect(
      await code(
        s.createFoodLog({
          mealType: 'lunch',
          source: 'manual',
          items: [ok],
          loggedAt: '2027-01-01T00:00:00Z',
        }),
      ),
    ).toBe('invalid_input');
  });
  it('editing marks an estimate as edited, and the source cannot change', async () => {
    const s = await setup({ aiConsent: true });
    const est = { ...rice(), source: 'ai_estimate' as const, confidence: 'low' as const };
    const log = await s.createFoodLog({ mealType: 'lunch', source: 'photo', items: [est] });
    const id = log.items[0]!.id;
    expect(estimateStatus((await s.listFoodLogs())[0]!.items[0]!)).toBe('estimate');
    await s.updateFoodItem(id, {
      ...est,
      source: 'curated',
      grams: 250,
      kcal: 325,
      kcalLow: 280,
      kcalHigh: 370,
    });
    const after = (await s.listFoodLogs())[0]!.items[0]!;
    expect(after.userEdited).toBe(true);
    expect(after.source).toBe('ai_estimate');
    expect(estimateStatus(after)).toBe('edited');
    expect(await code(s.updateFoodItem('missing', est))).toBe('not_found');
  });
  it('deletes items and removes empty meals', async () => {
    const s = await setup();
    const log = await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [rice(), rice(100)],
    });
    await s.deleteFoodItem(log.items[0]!.id);
    expect((await s.listFoodLogs())[0]!.items).toHaveLength(1);
    await s.deleteFoodItem(log.items[1]!.id);
    expect(await s.listFoodLogs()).toHaveLength(0);
  });
  it('filters by date range', async () => {
    const s = await setup();
    await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [rice()],
      loggedAt: '2026-06-14T12:00:00Z',
    });
    await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [rice()],
      loggedAt: '2026-06-15T09:00:00Z',
    });
    expect(
      await s.listFoodLogs({ fromIso: '2026-06-15T00:00:00Z', toIso: '2026-06-16T00:00:00Z' }),
    ).toHaveLength(1);
  });
  it('saves and re-reads meals', async () => {
    const s = await setup();
    const m = await s.saveMeal({
      name: 'Usual lunch',
      mealType: 'lunch',
      items: [rice(), rice(80)],
    });
    expect((await s.listSavedMeals())[0]!.items).toHaveLength(2);
    expect(await code(s.saveMeal({ name: '', mealType: null, items: [rice()] }))).toBe(
      'invalid_input',
    );
    await s.deleteSavedMeal(m.id);
    expect(await s.listSavedMeals()).toHaveLength(0);
  });
});

describe('simulated photo analysis', () => {
  it('returns several grounded, editable estimates labeled as mock and never confirmed', async () => {
    const s = await setup({ aiConsent: true });
    const r = await s.analyzeMealPhoto({ seed: 0 });
    expect(r.provider).toBe('mock');
    expect(r.notes).toMatch(/not real image analysis/i);
    expect(r.items.length).toBeGreaterThanOrEqual(4);
    for (const i of r.items) {
      expect(i.needsMatch).toBe(false);
      expect(estimateStatus(i)).toBe('estimate');
      expect(i.kcalLow).toBeLessThan(i.kcalHigh);
    }
    expect(totals(r.items).unreviewedEstimates).toBe(r.items.length);
  });
  it('reports an unmatched item instead of inventing numbers', async () => {
    const s = await setup({ aiConsent: true });
    const r = await s.analyzeMealPhoto({ seed: 3 });
    const un = r.items.filter((i) => i.needsMatch);
    expect(un).toHaveLength(1);
    expect(un[0]).toMatchObject({ kcal: 0, foodId: null });
  });
  it('meters usage through the gateway: the free allowance is 5 a month, then a clear error', async () => {
    const s = await setup({ aiConsent: true });
    for (let i = 0; i < 5; i++) await s.analyzeMealPhoto({ seed: i });
    expect(await code(s.analyzeMealPhoto({ seed: 9 }))).toBe('quota_exceeded');
    // the next month the allowance resets
    clock.t = new Date('2026-07-02T12:00:00Z');
    expect((await s.analyzeMealPhoto({ seed: 1 })).items.length).toBeGreaterThan(0);
  });
  it('deletes temporary photos 24 hours after a successful analysis, and unsuccessful ones within 24 hours', async () => {
    const s = await setup({ aiConsent: true });
    await s.analyzeMealPhoto({ seed: 0 });
    for (let i = 1; i < 5; i++) await s.analyzeMealPhoto({ seed: i });
    expect(await code(s.analyzeMealPhoto({ seed: 6 }))).toBe('quota_exceeded'); // creates a failed record
    const before = await s.listPhotoAnalyses!();
    expect(before.map((p) => p.status).sort()).toEqual([
      'failed',
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(before.every((p) => p.deleteAfter !== null)).toBe(true);
    clock.t = new Date('2026-06-15T23:00:00Z');
    expect(await s.purgeExpiredPhotos!()).toBe(0);
    clock.t = new Date('2026-06-16T12:30:00Z');
    expect(await s.purgeExpiredPhotos!()).toBe(6);
    const after = await s.listPhotoAnalyses!();
    expect(
      after.every((p) => p.status === 'deleted' && p.deletedAt !== null && p.deleteAfter === null),
    ).toBe(true);
    expect(await s.purgeExpiredPhotos!()).toBe(0);
  });
  it('keeps a photo the user explicitly saves, and cannot save one that is already deleted', async () => {
    const s = await setup({ aiConsent: true });
    const a = await s.analyzeMealPhoto({ seed: 0 });
    const b = await s.analyzeMealPhoto({ seed: 1 });
    await s.setPhotoSaved!(a.analysisId, true);
    clock.t = new Date('2026-06-17T12:00:00Z');
    expect(await s.purgeExpiredPhotos!()).toBe(1);
    const list = await s.listPhotoAnalyses!();
    expect(list.find((p) => p.id === a.analysisId)).toMatchObject({
      saved: true,
      status: 'succeeded',
      deleteAfter: null,
    });
    expect(await code(s.setPhotoSaved!(b.analysisId, true))).toBe('photo_already_deleted');
    await s.setPhotoSaved!(a.analysisId, false);
    expect(
      (await s.listPhotoAnalyses!()).find((p) => p.id === a.analysisId)!.deleteAfter,
    ).not.toBeNull();
  });
});

describe('meal plans', () => {
  it('saves a plan within a budget level and validates the budget fields', async () => {
    const s = await setup();
    const plan = planMeals({ days: 3, targetKcal: 2000, floorKcal: 1400, budgetLevel: 'low' });
    const saved = await s.createMealPlan({
      name: 'Week 1',
      startDate: '2026-06-15',
      budgetLevel: 'low',
      budgetCents: 4000,
      currency: 'USD',
      plan,
    });
    expect(saved.items.length).toBeGreaterThan(10);
    expect((await s.listMealPlans())[0]!.days).toBe(3);
    expect(
      await code(
        s.createMealPlan({
          name: 'x',
          startDate: '2026-06-15',
          budgetLevel: 'low',
          budgetCents: 100,
          plan,
        }),
      ),
    ).toBe('invalid_input');
    expect(
      await code(
        s.createMealPlan({
          name: 'x',
          startDate: '2026-06-15',
          budgetLevel: 'low',
          plan: { ...plan, targetKcal: 500 },
        }),
      ),
    ).toBe('invalid_input');
    await s.deleteMealPlan(saved.id);
    expect(await s.listMealPlans()).toHaveLength(0);
  });
});

describe('repeat and copy through the store', () => {
  it('repeating yesterday adds new entries, leaves the original, and the totals add up', async () => {
    const { copyDay } = await import('../food/copy');
    const store = await setup();
    await store.createFoodLog({
      mealType: 'breakfast',
      source: 'manual',
      loggedAt: '2026-06-14T08:00:00Z',
      items: [rice(150)],
    });
    await store.createFoodLog({
      mealType: 'dinner',
      source: 'manual',
      loggedAt: '2026-06-14T18:00:00Z',
      items: [rice(200)],
    });
    const before = await store.listFoodLogs();
    for (const input of copyDay(before, '2026-06-14', '2026-06-15', 'UTC', clock.t))
      await store.createFoodLog(input);
    const after = await store.listFoodLogs();
    expect(after).toHaveLength(4);
    const today = after.filter((l) => l.loggedAt.startsWith('2026-06-15'));
    const yesterday = after.filter((l) => l.loggedAt.startsWith('2026-06-14'));
    expect(today).toHaveLength(2);
    expect(totals(today.flatMap((l) => l.items)).kcal).toBe(
      totals(yesterday.flatMap((l) => l.items)).kcal,
    );
    // Editing the copy does not change the original.
    await store.deleteFoodLog(today[0]!.id);
    expect(
      (await store.listFoodLogs()).filter((l) => l.loggedAt.startsWith('2026-06-14')),
    ).toHaveLength(2);
  });
});
