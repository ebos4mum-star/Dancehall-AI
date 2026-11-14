import { describe, expect, it } from 'vitest';
import { proposeGoal } from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';

const memory = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
};
const NOW = new Date('2026-06-15T12:00:00Z');
const mk = (kv = memory()) => ({ kv, store: new MockStore(kv, () => NOW) });
const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );

async function onboarded() {
  const ctx = mk();
  const { store } = ctx;
  await store.signInDev();
  await store.setConsent('health_data_processing', true);
  await store.updateProfile({
    displayName: 'Ama',
    country: 'GH',
    timeZone: 'Africa/Accra',
    unitSystem: 'metric',
  });
  await store.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await store.completeOnboarding();
  return ctx;
}

describe('MockStore mirrors the database rules', () => {
  it('requires sign-in', async () => {
    const { store } = mk();
    expect(await code(store.getProfile())).toBe('not_authenticated');
    expect(await store.getSession()).toBeNull();
    expect((await store.signInDev()).mode).toBe('mock');
  });
  it('blocks health writes without consent and after withdrawal', async () => {
    const { store } = mk();
    await store.signInDev();
    expect(
      await code(
        store.savePrivate({
          birthDate: '1990-01-01',
          heightCm: 170,
          sex: 'female',
          activityLevel: 'light',
        }),
      ),
    ).toBe('consent_required');
    expect(await code(store.addWeight({ weightKg: 70 }))).toBe('consent_required');
    await store.setConsent('health_data_processing', true);
    await store.addWeight({ weightKg: 70 });
    await store.setConsent('health_data_processing', false);
    expect(await code(store.addWeight({ weightKg: 71 }))).toBe('consent_required');
    expect(await store.listWeights()).toHaveLength(1);
  });
  it('enforces adults only and valid input', async () => {
    const { store } = mk();
    await store.signInDev();
    await store.setConsent('health_data_processing', true);
    expect(
      await code(
        store.savePrivate({
          birthDate: '2010-01-01',
          heightCm: 170,
          sex: 'female',
          activityLevel: 'light',
        }),
      ),
    ).toBe('adults_only');
    expect(
      await code(
        store.savePrivate({
          birthDate: '1990-01-01',
          heightCm: 20,
          sex: 'female',
          activityLevel: 'light',
        }),
      ),
    ).toBe('invalid_input');
    expect(
      await code(
        store.savePrivate({
          birthDate: 'nope',
          heightCm: 170,
          sex: 'female',
          activityLevel: 'light',
        }),
      ),
    ).toBe('invalid_birth_date');
    expect(await code(store.updateProfile({ country: 'gh' }))).toBe('invalid_input');
  });
  it('completes onboarding only when everything is present', async () => {
    const { store } = mk();
    await store.signInDev();
    expect(await code(store.completeOnboarding())).toBe('profile_incomplete');
    const ctx = await onboarded();
    expect((await ctx.store.getProfile()).onboardedAt).not.toBeNull();
  });
  it('validates weights and keeps history newest first', async () => {
    const { store } = await onboarded();
    expect(await code(store.addWeight({ weightKg: 10 }))).toBe('invalid_input');
    expect(await code(store.addWeight({ weightKg: 70, measuredAt: '2026-08-01T00:00:00Z' }))).toBe(
      'invalid_input',
    );
    await store.addWeight({ weightKg: 71.234, measuredAt: '2026-06-01T08:00:00Z' });
    const e = await store.addWeight({ weightKg: 70.5, measuredAt: '2026-06-10T08:00:00Z' });
    const list = await store.listWeights();
    expect(list.map((w) => w.weightKg)).toEqual([70.5, 71.23]);
    await store.deleteWeight(e.id);
    expect(await store.listWeights()).toHaveLength(1);
  });
  it('creates goals for each period, one active per period, and applies the safety limits', async () => {
    const { store } = await onboarded();
    const base = { heightCm: 170, ageYears: 36, startDate: '2026-06-15', startKg: 80 };
    const week = proposeGoal({ ...base, type: 'lose', period: 'weekly' }).goal!;
    const month = proposeGoal({ ...base, type: 'lose', period: 'monthly', targetKg: 77 }).goal!;
    const year = proposeGoal({ ...base, type: 'lose', period: 'yearly', targetKg: 72 }).goal!;
    for (const g of [week, month, year]) await store.createGoal(g);
    expect((await store.listGoals()).map((g) => g.period).sort()).toEqual([
      'monthly',
      'weekly',
      'yearly',
    ]);
    expect(await code(store.createGoal(week))).toBe('active_goal_exists');
    const first = (await store.listGoals()).find((g) => g.period === 'weekly')!;
    await store.setGoalStatus(first.id, 'completed');
    await store.createGoal(week);
    expect(
      await code(
        store.createGoal({ ...week, period: 'monthly', endDate: '2026-07-15', targetKg: 77 }),
      ),
    ).toBe('active_goal_exists');
    const bad = {
      type: 'lose' as const,
      period: 'weekly' as const,
      startDate: '2026-06-15',
      endDate: '2026-06-22',
      startKg: 80,
      targetKg: 70,
    };
    await store.setGoalStatus(
      (await store.listGoals()).find((g) => g.period === 'weekly' && g.status === 'active')!.id,
      'abandoned',
    );
    expect(await code(store.createGoal(bad))).toBe('goal_pace_too_fast');
    expect(await code(store.setGoalStatus('missing', 'completed'))).toBe('not_found');
  });
  it('stores readiness privately and routes to low impact on any yes', async () => {
    const { store } = await onboarded();
    expect((await store.saveReadiness({ dizziness_or_loss_of_balance: true })).outcome).toBe(
      'low_impact_and_check_with_professional',
    );
    expect((await store.latestReadiness())?.outcome).toBe('low_impact_and_check_with_professional');
  });
  it('persists to the key-value store and notifies subscribers', async () => {
    const kv = memory();
    const a = new MockStore(kv, () => NOW);
    let calls = 0;
    a.subscribe(() => calls++);
    await a.signInDev();
    await a.setConsent('health_data_processing', true);
    await a.addWeight({ weightKg: 70 });
    expect(calls).toBe(3);
    const b = new MockStore(kv, () => NOW);
    expect(await b.listWeights()).toHaveLength(1);
    await b.resetDevData();
    expect(await b.listWeights()).toHaveLength(0);
    expect(await b.getSession()).not.toBeNull();
  });
  it('survives corrupted persisted data', async () => {
    const kv = memory();
    kv.data.set('dh.mock.v1', '{not json');
    expect(await new MockStore(kv, () => NOW).getSession()).toBeNull();
  });
});
