import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseBudgetPort,
  SupabaseQuotaPort,
  SupabaseStaffControls,
  SupabaseUserAiPause,
} from './supabase-ports';
import { SupabaseServerRepo } from './server/supabase-repo';

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
