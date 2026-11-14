/**
 * Persistence wiring of the Supabase adapter, tested against a recording fake of supabase-js.
 * No network, no real project: synthetic data only. Proves which tables/functions the app calls,
 * what it writes, and how database errors become the app's StoreError codes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table?: string;
  rpc?: string;
  op?: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
}
const calls: Call[] = [];
let respond: (c: Call) => { data: unknown; error: unknown } = () => ({ data: null, error: null });
const USER = { id: 'u-synthetic-1', email: 'dancer@example.test' };

function builder(c: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'gte', 'lt']) b[m] = () => b;
  for (const m of ['insert', 'update', 'delete', 'upsert'])
    b[m] = (payload?: unknown) => {
      c.op = m;
      c.payload = payload;
      return b;
    };
  b.eq = (k: string, v: unknown) => (c.filters.push([k, v]), b);
  b.single = b.maybeSingle = () => b;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(respond(c)).then(res, rej);
  return b;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: USER } }),
      getSession: async () => ({ data: { session: { user: USER } } }),
    },
    from: (table: string) => {
      const c: Call = { table, filters: [] };
      calls.push(c);
      return builder(c);
    },
    rpc: (rpc: string) => {
      const c: Call = { rpc, filters: [] };
      calls.push(c);
      return builder(c);
    },
  }),
}));

const { createSupabaseStore } = await import('./supabaseStore');
const { StoreError } = await import('./types');

const store = () =>
  createSupabaseStore({
    url: 'https://placeholder.supabase.example.test',
    publishableKey: 'sb_publishable_placeholder',
    storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
  });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );
const last = () => calls[calls.length - 1]!;

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ data: null, error: null });
});

describe('onboarding persistence', () => {
  const priv = {
    birthDate: '1990-05-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  } as const;
  it('inserts the private profile for the signed-in user when none exists', async () => {
    await store().savePrivate(priv);
    const w = calls.find((c) => c.op === 'insert')!;
    expect(w.table).toBe('profile_private');
    expect(w.payload).toMatchObject({ user_id: USER.id, birth_date: '1990-05-01', height_cm: 170 });
  });
  it('updates (never duplicates) an existing private profile, scoped to the user', async () => {
    respond = (c) => ({ data: c.op ? null : { user_id: USER.id }, error: null });
    await store().savePrivate(priv);
    const w = calls.find((c) => c.op === 'update')!;
    expect(w.table).toBe('profile_private');
    expect(w.filters).toContainEqual(['user_id', USER.id]);
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });
  it('records consent as an append-only insert with a policy version', async () => {
    await store().setConsent('health_data_processing', true);
    expect(last()).toMatchObject({ table: 'consents', op: 'insert' });
    expect(last().payload).toMatchObject({ purpose: 'health_data_processing', granted: true });
    expect((last().payload as { policy_version: unknown }).policy_version).toBeTruthy();
  });
  it('completes onboarding through the database function, not a client-side flag', async () => {
    await store().completeOnboarding();
    expect(last().rpc).toBe('complete_onboarding');
  });
  it.each([
    ['adults_only', 'adults_only'],
    ['consent_required: health data', 'consent_required'],
    ['profile_incomplete', 'profile_incomplete'],
  ])('maps database error %s to the app code', async (message, expected) => {
    respond = () => ({ data: null, error: { message } });
    expect(await codeOf(store().completeOnboarding())).toBe(expected);
  });
});

describe('goals persistence', () => {
  const goal = {
    type: 'lose',
    period: 'weekly',
    startDate: '2026-06-01',
    endDate: '2026-06-08',
    startKg: 80,
    targetKg: 79.5,
  } as const;
  it('writes snake_case columns and maps the returned row', async () => {
    respond = () => ({
      data: {
        id: 'g1',
        type: 'lose',
        period: 'weekly',
        start_date: '2026-06-01',
        end_date: '2026-06-08',
        start_kg: '80',
        target_kg: '79.5',
        planned_weekly_change_kg: '-0.5',
        status: 'active',
        created_at: '2026-06-01T00:00:00Z',
      },
      error: null,
    });
    const g = await store().createGoal(goal);
    expect(last()).toMatchObject({ table: 'goals', op: 'insert' });
    expect(last().payload).toMatchObject({ start_kg: 80, target_kg: 79.5, period: 'weekly' });
    expect(g).toMatchObject({ id: 'g1', startKg: 80, targetKg: 79.5, plannedWeeklyChangeKg: -0.5 });
  });
  it.each([
    [{ code: '23505', message: 'duplicate' }, 'active_goal_exists'],
    [{ message: 'goal_pace_too_fast' }, 'goal_pace_too_fast'],
    [{ message: 'goal_unsafe_underweight' }, 'goal_unsafe_underweight'],
  ])('maps database rejection %j to %s', async (error, expected) => {
    respond = () => ({ data: null, error });
    expect(await codeOf(store().createGoal(goal))).toBe(expected);
  });
  it('changes status only for the targeted goal', async () => {
    await store().setGoalStatus('g1', 'abandoned');
    expect(last()).toMatchObject({
      table: 'goals',
      op: 'update',
      payload: { status: 'abandoned' },
    });
    expect(last().filters).toContainEqual(['id', 'g1']);
  });
});

describe('nutrition persistence', () => {
  const item = {
    foodId: null,
    name: 'Synthetic rice',
    grams: 150,
    kcal: 195,
    proteinG: 4,
    carbsG: 42,
    fatG: 0.5,
    kcalLow: 180,
    kcalHigh: 210,
    source: 'manual',
    confidence: 'high',
    userEdited: false,
  } as never;
  it('inserts the meal, then its items linked to the new log id', async () => {
    respond = (c) =>
      c.table === 'food_logs'
        ? {
            data: { id: 'log1', logged_at: 't', meal_type: 'lunch', source: 'manual' },
            error: null,
          }
        : {
            data: [
              {
                id: 'i1',
                log_id: 'log1',
                name: 'Synthetic rice',
                grams: '150',
                kcal: '195',
                protein_g: '4',
                carbs_g: '42',
                fat_g: '0.5',
                kcal_low: '180',
                kcal_high: '210',
                source: 'manual',
                confidence: 'high',
                user_edited: false,
              },
            ],
            error: null,
          };
    const log = await store().createFoodLog({ mealType: 'lunch', source: 'manual', items: [item] });
    const items = calls.find((c) => c.table === 'food_log_items')!;
    expect((items.payload as Array<{ log_id: string }>)[0]!.log_id).toBe('log1');
    expect(log.items[0]).toMatchObject({ logId: 'log1', kcal: 195, kcalLow: 180, kcalHigh: 210 });
  });
  it('removes the empty meal when saving its items fails', async () => {
    respond = (c) =>
      c.table === 'food_logs' && c.op !== 'delete'
        ? { data: { id: 'log2' }, error: null }
        : c.table === 'food_log_items'
          ? { data: null, error: { message: 'row-level security' } }
          : { data: null, error: null };
    expect(
      await codeOf(store().createFoodLog({ mealType: 'lunch', source: 'manual', items: [item] })),
    ).toBe('consent_required');
    const del = calls.find((c) => c.table === 'food_logs' && c.op === 'delete')!;
    expect(del.filters).toContainEqual(['id', 'log2']);
  });
  it('never trusts the client to set ownership: no user_id is sent for logs', async () => {
    respond = (c) => ({ data: c.table === 'food_logs' ? { id: 'l' } : [], error: null });
    await store().createFoodLog({ mealType: 'snack', source: 'manual', items: [item] });
    expect(calls.find((c) => c.table === 'food_logs')!.payload).not.toHaveProperty('user_id');
  });
});

describe('workout history persistence', () => {
  it('records a completed session with defaults and trims the title', async () => {
    respond = () => ({
      data: {
        id: 's1',
        title: 'Afro Dancehall Basics',
        minutes: '20',
        status: 'completed',
        low_impact: false,
        source: 'manual',
        created_at: 't',
        duration_s: '1200',
        perceived_exertion: '6',
      },
      error: null,
    });
    const s = await store().createSession({
      title: '  Afro Dancehall Basics  ',
      minutes: 20,
      status: 'completed',
      durationS: 1200,
      perceivedExertion: 6,
    });
    expect(last()).toMatchObject({ table: 'workout_sessions', op: 'insert' });
    expect(last().payload).toMatchObject({
      title: 'Afro Dancehall Basics',
      status: 'completed',
      source: 'manual',
      low_impact: false,
    });
    expect(s).toMatchObject({ id: 's1', minutes: 20, durationS: 1200, perceivedExertion: 6 });
  });
  it('maps a database constraint violation to invalid_input', async () => {
    respond = () => ({ data: null, error: { code: '23514', message: 'check constraint' } });
    expect(await codeOf(store().createSession({ title: 'x', minutes: -1 }))).toBe('invalid_input');
  });
  it('only sends fields that were patched, scoped to the session id', async () => {
    respond = () => ({
      data: {
        id: 's1',
        title: 't',
        minutes: 10,
        status: 'completed',
        low_impact: true,
        source: 'manual',
        created_at: 't',
      },
      error: null,
    });
    await store().updateSession('s1', { status: 'completed', lowImpact: true });
    expect(last().payload).toEqual({ status: 'completed', low_impact: true });
    expect(last().filters).toContainEqual(['id', 's1']);
  });
});
