import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { buildDataExport } from '../privacy/export';
import { itemFromFood, FOOD_BY_ID } from '@dancehall/shared';

/** Journey and hostile-input probes against the real mock store (mock level: no network, no backend). */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');
async function fresh(kv: KeyValue = memory()) {
  const s = new MockStore(kv, NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  return { s, kv };
}
const item = (grams = 100) => itemFromFood([...FOOD_BY_ID.values()][0]!, grams);
const rejects = async (p: Promise<unknown>) => {
  try {
    await p;
    return false;
  } catch {
    return true;
  }
};

describe('hostile inputs are refused and change nothing', () => {
  it('weights', async () => {
    const { s } = await fresh();
    for (const w of [0, -5, Number.NaN, Infinity, 1000])
      expect(await rejects(s.addWeight({ weightKg: w })), `weight ${w}`).toBe(true);
    expect(await s.listWeights()).toHaveLength(0);
  });
  it('food logs: empty, negative grams, NaN, absurd values', async () => {
    const { s } = await fresh();
    const bad = [
      { mealType: 'lunch' as const, source: 'manual' as const, items: [] },
      { mealType: 'lunch' as const, source: 'manual' as const, items: [{ ...item(), grams: -50 }] },
      {
        mealType: 'lunch' as const,
        source: 'manual' as const,
        items: [{ ...item(), kcal: Number.NaN }],
      },
      {
        mealType: 'lunch' as const,
        source: 'manual' as const,
        items: [{ ...item(), kcal: 9_999_999 }],
      },
      { mealType: 'lunch' as const, source: 'manual' as const, items: [{ ...item(), name: '' }] },
    ];
    for (const [i, b] of bad.entries())
      expect(await rejects(s.createFoodLog(b)), `bad log ${i}`).toBe(true);
    expect(await s.listFoodLogs()).toHaveLength(0);
  });
  it('sessions: zero, negative and absurd durations; exertion out of range', async () => {
    const { s } = await fresh();
    for (const m of [0, -10, Number.NaN, 100000])
      expect(
        await rejects(s.createSession({ title: 'x', minutes: m, status: 'completed' })),
        `minutes ${m}`,
      ).toBe(true);
    expect(
      await rejects(
        s.createSession({ title: 'x', minutes: 20, status: 'completed', perceivedExertion: 11 }),
      ),
    ).toBe(true);
    expect(await s.listSessions()).toHaveLength(0);
  });
  it('private profile: future birth date, absurd height', async () => {
    const { s } = await fresh();
    expect(
      await rejects(
        s.savePrivate({
          birthDate: '2999-01-01',
          heightCm: 170,
          sex: 'female',
          activityLevel: 'moderate',
        }),
      ),
    ).toBe(true);
    expect(
      await rejects(
        s.savePrivate({
          birthDate: '1990-01-01',
          heightCm: 5,
          sex: 'female',
          activityLevel: 'moderate',
        }),
      ),
    ).toBe(true);
  });
  it('under-18 birth date is refused (adults only)', async () => {
    const { s } = await fresh();
    expect(
      await rejects(
        s.savePrivate({
          birthDate: '2015-01-01',
          heightCm: 150,
          sex: 'female',
          activityLevel: 'moderate',
        }),
      ),
    ).toBe(true);
  });
});

describe('journey A: onboarding, meal, workout, export, deletion', () => {
  it('data persists across restart, edits recalculate, deletes cascade, export is complete', async () => {
    const { s, kv } = await fresh();
    await s.savePrivate({
      birthDate: '1990-01-01',
      heightCm: 170,
      sex: 'female',
      activityLevel: 'moderate',
    });
    await s.addWeight({ weightKg: 70 });
    const log = await s.createFoodLog({
      mealType: 'breakfast',
      loggedAt: '2026-06-15T08:00:00Z',
      source: 'manual',
      items: [item(100), item(50)],
    });
    const w = await s.createSession({ title: 'Dance', minutes: 30, status: 'completed' });

    const s2 = new MockStore(kv, NOW); // restart
    expect((await s2.listFoodLogs())[0]!.items).toHaveLength(2);
    expect(await s2.listSessions()).toHaveLength(1);

    const first = (await s2.listFoodLogs())[0]!.items[0]!;
    const { id: _id, logId: _l, ...vals } = first as typeof first & { logId: string };
    await s2.updateFoodItem(first.id, {
      ...vals,
      grams: 200,
      kcal: first.kcal * 2,
      kcalLow: first.kcalLow * 2,
      kcalHigh: first.kcalHigh * 2,
    });
    const after = (await s2.listFoodLogs())[0]!.items.find((i) => i.id === first.id)!;
    expect(after.grams).toBe(200);
    expect(after.kcal).toBe(first.kcal * 2);
    expect(after.userEdited).toBe(true);

    const ex = await buildDataExport(s2, NOW());
    expect(ex.foodLogs).toHaveLength(1);
    expect(ex.workoutSessions).toHaveLength(1);
    expect(ex.weights).toHaveLength(1);

    await s2.deleteFoodItem(first.id);
    expect((await s2.listFoodLogs())[0]!.items).toHaveLength(1);
    await s2.deleteFoodLog(log.id);
    expect(await s2.listFoodLogs()).toHaveLength(0);
    await s2.deleteSession(w.id);
    expect(await s2.listSessions()).toHaveLength(0);
  });
  it('sign out then in: guest sees nothing of the account; deletion request is recorded and cancellable', async () => {
    const { s } = await fresh();
    await s.createFoodLog({ mealType: 'lunch', source: 'manual', items: [item()] });
    await s.requestAccountDeletion!();
    expect(await s.getAccountDeletionRequest!()).toBeTruthy();
    await s.cancelAccountDeletion!();
    expect(await s.getAccountDeletionRequest!()).toBeFalsy();
    await s.signOut();
    expect(await s.getSession()).toBeNull();
    expect(await rejects(s.listFoodLogs())).toBe(true);
  });
});
