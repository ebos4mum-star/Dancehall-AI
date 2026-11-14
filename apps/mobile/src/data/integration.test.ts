import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MockStore, type KeyValue } from './mockStore';
import { createCoachAdapter } from './supabaseCoach';
import { StoreError } from './types';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );

describe('user AI pause is separate from the staff kill switch (mock)', () => {
  async function setup() {
    const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
    await s.signInDev();
    await s.setConsent('health_data_processing', true);
    return s;
  }
  it('pausing blocks the coach with its own code, and is not reported as the staff switch', async () => {
    const s = await setup();
    expect(await code(s.sendCoachMessage!({ text: 'Give me a 10 minute workout' }))).toBeNull();
    await s.setAiPaused!(true);
    expect(await code(s.sendCoachMessage!({ text: 'Give me a 10 minute workout' }))).toBe(
      'ai_paused',
    );
    const u = await s.getAiUsage!();
    expect(u).toMatchObject({ paused: true, userPaused: true, staffPaused: false });
    await s.setAiPaused!(false);
    expect(await code(s.sendCoachMessage!({ text: 'hello again coach' }))).toBeNull();
  });
  it('the kill switch is independent: it does not set the pause, and un-pausing does not clear it', async () => {
    const s = await setup();
    await s.devSetKillSwitch!(true);
    expect(await s.getAiUsage!()).toMatchObject({ staffPaused: true, userPaused: false });
    expect(await code(s.sendCoachMessage!({ text: 'hello coach' }))).toBe('feature_disabled');
    await s.setAiPaused!(false);
    expect(await code(s.sendCoachMessage!({ text: 'hello coach' }))).toBe('feature_disabled');
  });
  it('account deletion: request is idempotent, 30 days out, and cancellable', async () => {
    const s = await setup();
    const a = await s.requestAccountDeletion!();
    expect((await s.requestAccountDeletion!()).id).toBe(a.id);
    expect(Date.parse(a.scheduledFor) - Date.parse('2026-06-15T12:00:00Z')).toBe(30 * 86_400_000);
    expect(await s.getAccountDeletionRequest!()).toEqual(a);
    expect(await s.cancelAccountDeletion!()).toBe(true);
    expect(await s.getAccountDeletionRequest!()).toBeNull();
  });
});

/** Minimal supabase-js stand-in: records table access and serves a session token. */
function fakeDb(token: string | null) {
  const touched: string[] = [];
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get(_t, p: string) {
        if (p === 'then')
          return (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(res);
        return () => chain();
      },
    });
  return {
    touched,
    db: {
      auth: {
        getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
        getUser: async () => ({ data: { user: token ? { id: 'u1' } : null } }),
      },
      from: (t: string) => (touched.push(t), chain()),
      rpc: (fn: string) => (touched.push(`rpc:${fn}`), chain()),
    } as unknown as SupabaseClient,
  };
}
const base = {} as never;
const reply = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

describe('Supabase coach adapter: server calls', () => {
  it('reports "unavailable" without a gateway URL, and never calls the network', async () => {
    const f = vi.fn();
    const a = createCoachAdapter({
      db: fakeDb('tok').db,
      base,
      fetchImpl: f as never,
      emit: () => undefined,
    });
    expect(await code(a.sendCoachMessage!({ text: 'hello coach' }))).toBe('ai_unavailable');
    expect(f).not.toHaveBeenCalled();
  });
  it('sends the person’s bearer token and nothing else secret', async () => {
    const f = vi.fn(reply(200, { conversationId: 'c1', messageId: 'm1' }));
    const a = createCoachAdapter({
      db: fakeDb('tok-123').db,
      base,
      aiApiUrl: 'https://ai.example.test',
      fetchImpl: f as never,
      emit: () => undefined,
    });
    await a.sendCoachMessage!({ text: 'hello coach' }).catch(() => undefined);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai.example.test/v1/coach/messages');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
  });
  it('refuses to call the server when signed out', async () => {
    const f = vi.fn();
    const a = createCoachAdapter({
      db: fakeDb(null).db,
      base,
      aiApiUrl: 'https://ai.example.test',
      fetchImpl: f as never,
      emit: () => undefined,
    });
    expect(await code(a.generateWeeklyReview!())).toBe('not_authenticated');
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    [429, 'quota_exceeded', 'quota_exceeded'],
    [503, 'budget_exhausted', 'budget_exhausted'],
    [503, 'feature_disabled', 'feature_disabled'],
    [409, 'ai_paused', 'ai_paused'],
    [403, 'forbidden', 'ai_consent_required'],
    [502, 'upstream_failure', 'ai_unavailable'],
  ])('maps server %s %s to %s', async (status, serverCode, expected) => {
    const a = createCoachAdapter({
      db: fakeDb('t').db,
      base,
      aiApiUrl: 'https://ai.example.test',
      fetchImpl: reply(status, { error: { code: serverCode, message: 'm' } }) as never,
      emit: () => undefined,
    });
    expect(await code(a.generateWeeklyReview!())).toBe(expected);
  });
  it('a network failure becomes "unavailable"', async () => {
    const a = createCoachAdapter({
      db: fakeDb('t').db,
      base,
      aiApiUrl: 'https://ai.example.test',
      fetchImpl: (async () => {
        throw new TypeError('offline');
      }) as never,
      emit: () => undefined,
    });
    expect(await code(a.generateWeeklyReview!())).toBe('ai_unavailable');
  });
  it('the person’s pause is written to ai_preferences, never to feature_flags', async () => {
    const f = fakeDb('t');
    const a = createCoachAdapter({ db: f.db, base, emit: () => undefined });
    await a.setAiPaused!(true);
    expect(f.touched).toContain('ai_preferences');
    expect(f.touched).not.toContain('feature_flags');
  });
});
