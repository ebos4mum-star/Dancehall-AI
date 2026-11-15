import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseBudgetPort,
  SupabaseQuotaPort,
  SupabaseStaffControls,
  SupabaseUserAiPause,
} from './supabase-ports';
import { SupabaseServerRepo } from './server/supabase-repo';
import { DEFAULT_PREFS, calorieNeedsFromRecords, type GoalIntent } from '@dancehall/shared';

type Call = { op: string; args: unknown[] };
/** Recording fake of the supabase-js query builder: every chained call is logged and the final await yields `result`. */
function fake(result: (calls: Call[]) => { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = [];
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const r = result(calls);
          return (res: (v: unknown) => unknown) => Promise.resolve(r).then(res);
        }
        return (...args: unknown[]) => {
          calls.push({ op: prop, args });
          return chain();
        };
      },
    });
  return {
    db: {
      from: (t: string) => {
        calls.push({ op: 'from', args: [t] });
        return chain();
      },
      rpc: (fn: string, a: unknown) => {
        calls.push({ op: 'rpc', args: [fn, a] });
        return chain();
      },
    } as unknown as SupabaseClient,
    calls,
  };
}

describe('Supabase ports call the atomic SQL functions', () => {
  it('budget reserve/settle', async () => {
    const f = fake((c) => ({
      data: c.at(-1)!.args[0] === 'ai_budget_reserve' ? true : [{ settled: '1.5', ceiling: '50' }],
      error: null,
    }));
    const p = new SupabaseBudgetPort(f.db);
    expect(await p.reserve('2026-06', 0.01, 50)).toBe(true);
    expect(f.calls[0]).toEqual({
      op: 'rpc',
      args: ['ai_budget_reserve', { p_month: '2026-06', p_worst: 0.01, p_ceiling: 50 }],
    });
    f.calls.length = 0;
    expect(await p.settle('2026-06', 0.01, 0.002)).toEqual({ settledUsd: 1.5, ceilingUsd: 50 });
  });
  it('a denied or failed database call never grants budget or quota', async () => {
    expect(
      await new SupabaseBudgetPort(fake(() => ({ data: false, error: null })).db).reserve(
        'm',
        1,
        50,
      ),
    ).toBe(false);
    expect(
      await new SupabaseQuotaPort(fake(() => ({ data: false, error: null })).db).consume(
        'u',
        'm',
        'concierge_chat',
        3,
      ),
    ).toBe(false);
    await expect(
      new SupabaseBudgetPort(fake(() => ({ data: null, error: { message: 'boom' } })).db).reserve(
        'm',
        1,
        50,
      ),
    ).rejects.toThrow('boom');
  });
  it('staff controls come from feature_flags; user pause comes from the person’s own setting', async () => {
    const rows = [
      { key: 'ai.kill_all', enabled: false },
      { key: 'ai.kill.food_photo', enabled: true },
      { key: 'ai.kill.weekly_review', enabled: false },
    ];
    expect(
      await new SupabaseStaffControls(fake(() => ({ data: rows, error: null })).db).load(),
    ).toEqual({ killAll: false, killFeatures: { food_photo: true } });
    const f = fake(() => ({ data: true, error: null }));
    expect(await new SupabaseUserAiPause(f.db).isPaused('u1')).toBe(true);
    expect(f.calls[0]).toEqual({ op: 'rpc', args: ['ai_user_paused', { p_user: 'u1' }] });
    // The user pause adapter never touches feature_flags.
    expect(f.calls.some((c) => c.op === 'from')).toBe(false);
  });
});

describe('SupabaseServerRepo scopes every query to the verified user', () => {
  it('conversation lookups filter by both id and user_id, and a miss returns null', async () => {
    const f = fake(() => ({ data: null, error: null }));
    expect(await new SupabaseServerRepo(f.db).conversationHistory('alice', 'conv-1')).toBeNull();
    const eqs = f.calls.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['user_id', 'alice']);
    expect(eqs).toContainEqual(['id', 'conv-1']);
  });
  it('consent is the LATEST decision', async () => {
    const f = fake(() => ({ data: [{ granted: false }], error: null }));
    expect(await new SupabaseServerRepo(f.db).hasConsent('alice', 'health_data_processing')).toBe(
      false,
    );
    expect(f.calls).toContainEqual({ op: 'order', args: ['id', { ascending: false }] });
  });
  it('un-personalized coach context loads no personal records', async () => {
    const f = fake(() => ({ data: null, error: null }));
    await new SupabaseServerRepo(f.db).coachContext(
      'alice',
      false,
      new Date('2026-06-17T12:00:00Z'),
    );
    expect(f.calls).toHaveLength(0);
  });
});

describe('Supabase repo: deletion and photo queries are scoped to the verified user', () => {
  it('cancel and request filter by user_id; they never delete data themselves', async () => {
    const f = fake(() => ({ data: [], error: null }));
    await new SupabaseServerRepo(f.db).cancelAccountDeletion('alice');
    expect(f.calls.filter((c) => c.op === 'eq').map((c) => c.args)).toContainEqual([
      'user_id',
      'alice',
    ]);
    expect(f.calls.some((c) => c.op === 'delete')).toBe(false);
    expect(f.calls.filter((c) => c.op === 'from').map((c) => c.args[0])).toEqual([
      'account_deletion_requests',
    ]);
  });
  it('maintenance RPCs are only reachable by the service-role client the server constructs, not via any user-facing handler', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('./server/handlers.ts', import.meta.url),
      'utf8',
    );
    const routes = [...src.matchAll(/case '(\/v1\/[^']+)'/g)].map((m) => m[1]);
    expect(routes.sort()).toEqual([
      '/v1/account/deletion',
      '/v1/account/deletion/cancel',
      '/v1/coach/messages',
      '/v1/coach/weekly-review',
      '/v1/food/photo-analysis',
    ]);
  });
});

describe('server coach wellness context (privacy, validity, isolation)', () => {
  const NOW = new Date('2026-06-03T10:00:00Z');
  type Tables = Record<string, { data: unknown; error?: { message: string } | null }>;
  /** A per-table fake that records the filters applied to each query, so isolation can be asserted. */
  function tables(t: Tables) {
    const queries: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
    const db = {
      from: (table: string) => {
        const q = { table, eq: [] as Array<[string, unknown]> };
        queries.push(q);
        const chain: unknown = new Proxy(() => undefined, {
          get(_t, prop: string) {
            if (prop === 'then') {
              const r = t[table] ?? { data: [] };
              return (res: (v: unknown) => unknown) =>
                Promise.resolve({ data: r.data, error: r.error ?? null }).then(res);
            }
            return (...args: unknown[]) => {
              if (prop === 'eq') q.eq.push([String(args[0]), args[1]]);
              return chain;
            };
          },
        });
        return chain;
      },
    } as unknown as SupabaseClient;
    return { db, queries };
  }
  const entry = (kind: string, day: string, amount: number, label: string | null = null) => ({
    id: `${kind}-${day}-${amount}`,
    kind,
    day,
    amount,
    amount2: null,
    label,
    created_at: '2026-06-03T08:00:00Z',
  });
  const base: Tables = {
    profiles: { data: { time_zone: 'UTC', unit_system: 'metric' } },
    workout_sessions: { data: [] },
    food_logs: { data: [] },
    weight_entries: { data: [] },
    goals: { data: [] },
  };

  it('includes only aggregates for the signed-in person, and scopes every wellness query by user', async () => {
    const f = tables({
      ...base,
      wellness_entries: {
        data: [
          entry('walk', '2026-06-02', 20),
          entry('walk', '2026-06-03', 15),
          entry('strength', '2026-06-03', 10, 'bands'),
          entry('sleep', '2026-06-01', 7),
          entry('sleep', '2026-06-02', 6),
          entry('sleep', '2026-06-03', 5),
          entry('recovery', '2026-06-03', 0, 'sore'),
          entry('measurement', '2026-06-03', 80, 'waist'),
        ],
      },
      wellness_prefs: { data: { data: { goalIntent: 'lose', tracking: 'light' } } },
    });
    const ctx = await new SupabaseServerRepo(f.db).coachContext('user-A', true, NOW);
    expect(ctx.wellness).toMatchObject({
      walkMinutesWeek: 35,
      strengthSessionsWeek: 1,
      sleepNightsWeek: 3,
      sleepAvgHours: 6,
      recoveryToday: 'sore',
      intent: 'lose',
      numbersHidden: false,
    });
    // Measurements, labels and ids never reach the context.
    expect(JSON.stringify(ctx)).not.toMatch(/waist|80|bands|walk-2026/);
    for (const q of f.queries.filter((x) => x.table.startsWith('wellness_')))
      expect(q.eq).toContainEqual(['user_id', 'user-A']);
  });
  it('hides numbers when the person has an eating concern, is postpartum, or turned tracking off', async () => {
    for (const prefs of [
      { eatingConcern: true },
      { pregnantOrPostpartum: true },
      { tracking: 'none' },
    ]) {
      const f = tables({
        ...base,
        wellness_entries: {
          data: [entry('hunger', '2026-06-03', 0, 'hungry'), entry('walk', '2026-06-03', 15)],
        },
        wellness_prefs: { data: { data: prefs } },
      });
      const ctx = await new SupabaseServerRepo(f.db).coachContext('u', true, NOW);
      expect(ctx.wellness?.numbersHidden).toBe(true);
      expect(ctx.wellness?.hungerCheckinsWeek).toBe(0);
    }
  });
  it('ignores malformed, out-of-range and future rows instead of failing', async () => {
    const f = tables({
      ...base,
      wellness_entries: {
        data: [
          entry('walk', '2026-06-03', 99999),
          entry('walk', '2026-06-03', -5),
          entry('sleep', '2026-06-03', 7, 'not-a-quality'),
          entry('walk', '2030-01-01', 20),
          { id: 'x', kind: 'nope', day: 'bad', amount: 'NaN' },
          null,
          entry('walk', '2026-06-03', 25),
        ],
      },
      wellness_prefs: { data: { data: { goalIntent: 'banana', tracking: 12 } } },
    });
    const ctx = await new SupabaseServerRepo(f.db).coachContext('u', true, NOW);
    expect(ctx.wellness?.walkMinutesWeek).toBe(25);
    expect(ctx.wellness?.sleepNightsWeek).toBe(0);
    expect(ctx.wellness?.intent).toBe('fitness');
  });
  it('has no wellness section when there is nothing logged and no preferences', async () => {
    const f = tables({ ...base, wellness_entries: { data: [] }, wellness_prefs: { data: null } });
    expect(
      (await new SupabaseServerRepo(f.db).coachContext('u', true, NOW)).wellness,
    ).toBeUndefined();
  });
  it('fails closed (no numbers) when wellness cannot be read', async () => {
    const f = tables({ ...base, wellness_entries: { data: null, error: { message: 'down' } } });
    const ctx = await new SupabaseServerRepo(f.db).coachContext('u', true, NOW);
    expect(ctx.wellness?.numbersHidden).toBe(true);
    expect(ctx.wellness?.walkMinutesWeek).toBe(0);
  });
  describe('calorie guide for the server coach (same engine as the app)', () => {
    const calorieTables = (over: Tables = {}): Tables => ({
      ...base,
      wellness_entries: { data: [] },
      profile_private: {
        data: {
          birth_date: '1990-01-01',
          height_cm: 170,
          sex: 'female',
          activity_level: 'moderate',
        },
      },
      weight_entries: { data: [{ weight_kg: 70, measured_at: '2025-01-01T08:00:00Z' }] },
      goals: { data: [] },
      readiness_screenings: { data: [{ outcome: 'clear' }] },
      ...over,
    });
    const prefsOf = (data: Record<string, unknown>) => ({ wellness_prefs: { data: { data } } });
    const guideFor = async (t: Tables) =>
      (await new SupabaseServerRepo(tables(t).db).coachContext('user-A', true, NOW)).guideKcal;
    const expected = (intent: GoalIntent) => {
      const n = calorieNeedsFromRecords({
        prefs: { ...DEFAULT_PREFS, goalIntent: intent, goalChosen: true },
        readinessOutcome: 'clear',
        priv: { birthDate: '1990-01-01', heightCm: 170, sex: 'female', activityLevel: 'moderate' },
        latestWeightKg: 70,
        goals: [],
        now: NOW,
      });
      return Math.round((n.kcal!.guide ?? n.kcal!.maintenance) / 50) * 50;
    };

    it('quotes the same number the Goals screen would show (to the nearest 50), for all five goals, using the latest weight however old', async () => {
      for (const intent of ['lose', 'maintain', 'gain', 'fitness', 'strength'] as const) {
        const g = await guideFor(
          calorieTables(prefsOf({ goalIntent: intent, goalChosen: true, tracking: 'light' })),
        );
        expect(g, intent).toBe(expected(intent));
      }
    });
    it('quotes the Gain Weight surplus, never more than 10% above maintenance', async () => {
      const gain = (await guideFor(calorieTables(prefsOf({ goalIntent: 'gain' }))))!;
      const maintain = (await guideFor(calorieTables(prefsOf({ goalIntent: 'maintain' }))))!;
      expect(gain).toBeGreaterThan(maintain);
      expect(gain).toBeLessThanOrEqual(Math.round((maintain * 1.1) / 50) * 50 + 50);
    });
    it('gives no calorie guide when the engine withholds it: cautious or unanswered safety questions for loss, hidden numbers, missing facts', async () => {
      const lose = prefsOf({ goalIntent: 'lose' });
      expect(await guideFor(calorieTables(lose))).toBeDefined();
      expect(
        await guideFor(
          calorieTables({
            ...lose,
            readiness_screenings: { data: [{ outcome: 'low_impact_and_check_with_professional' }] },
          }),
        ),
      ).toBeUndefined();
      expect(
        await guideFor(calorieTables({ ...lose, readiness_screenings: { data: [] } })),
      ).toBeUndefined();
      for (const flag of [
        { eatingConcern: true },
        { pregnantOrPostpartum: true },
        { tracking: 'none' },
      ])
        expect(
          await guideFor(calorieTables(prefsOf({ goalIntent: 'maintain', ...flag }))),
        ).toBeUndefined();
      expect(await guideFor(calorieTables({ weight_entries: { data: [] } }))).toBeUndefined();
      expect(await guideFor(calorieTables({ profile_private: { data: null } }))).toBeUndefined();
    });
    it('fails closed: a failed read gives no guide and does not break the rest of the context', async () => {
      const t = calorieTables({ profile_private: { data: null, error: { message: 'down' } } });
      const ctx = await new SupabaseServerRepo(tables(t).db).coachContext('user-A', true, NOW);
      expect(ctx.guideKcal).toBeUndefined();
      expect(ctx.personalized).toBe(true);
    });
    it('scopes every new read by the verified user and reads nothing when personalization is off', async () => {
      const f = tables(calorieTables());
      await new SupabaseServerRepo(f.db).coachContext('user-A', true, NOW);
      for (const q of f.queries.filter((x) =>
        ['profile_private', 'readiness_screenings', 'weight_entries', 'goals'].includes(x.table),
      ))
        expect(q.eq).toContainEqual(['user_id', 'user-A']);
      const off = tables(calorieTables());
      await new SupabaseServerRepo(off.db).coachContext('user-A', false, NOW);
      expect(off.queries).toHaveLength(0);
    });
  });
  it('reads no wellness data at all when personalization is off', async () => {
    const f = tables({ ...base });
    const ctx = await new SupabaseServerRepo(f.db).coachContext('u', false, NOW);
    expect(ctx.wellness).toBeUndefined();
    expect(f.queries).toHaveLength(0);
  });
  it('weekly facts include recorded wellness, and omit its numbers when hidden', async () => {
    const rows = [entry('walk', '2026-06-02', 20), entry('strength', '2026-06-03', 10)];
    const shown = tables({
      ...base,
      wellness_entries: { data: rows },
      wellness_prefs: { data: { data: {} } },
    });
    const a = await new SupabaseServerRepo(shown.db).weekFacts('u', '2026-06-01');
    expect(a.wellness).toMatchObject({ walkMinutes: 20, strengthSessions: 1 });
    expect(a.activeDays).toBe(2);
    const hidden = tables({
      ...base,
      wellness_entries: { data: rows },
      wellness_prefs: { data: { data: { eatingConcern: true } } },
    });
    const b = await new SupabaseServerRepo(hidden.db).weekFacts('u', '2026-06-01');
    expect(b.wellness).toBeUndefined();
    const down = tables({ ...base, wellness_entries: { data: null, error: { message: 'x' } } });
    expect(
      (await new SupabaseServerRepo(down.db).weekFacts('u', '2026-06-01')).wellness,
    ).toBeUndefined();
  });
});
