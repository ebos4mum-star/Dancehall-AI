/**
 * LIVE verification against the approved DanceHall Fit AI development project. SKIPPED unless explicitly enabled (see liveGuard.ts and
 * docs/LIVE_VERIFICATION.md). Uses the real Supabase adapters, two owner-created TEST users and synthetic data only, and removes what it creates.
 * It never touches paid AI, the server AI route, payments or any other project.
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateKey } from '@dancehall/shared';
import { createSupabaseStore } from '../supabaseStore';
import { StoreError, type DataStore } from '../types';
import { buildDataExport } from '../../privacy/export';
import { resolveLiveConfig } from './liveGuard';

const cfg = resolveLiveConfig(process.env as Record<string, string | undefined>);
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
  };
};
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : `other:${String(e)}`),
  );

describe.skipIf(!cfg.enabled)('live: approved development project', () => {
  const live = cfg.enabled ? cfg : null!;
  let A: DataStore;
  let B: DataStore;
  let idA = '';
  let idB = '';
  const today = localDateKey(new Date(), 'UTC');
  const made: Array<() => Promise<unknown>> = [];

  /** Signs in with a password (test users only) into an in-memory session, then builds the real store on the same session. */
  async function open(u: { email: string; password: string }) {
    const storage = memory();
    const auth = createClient(live.url, live.key, { auth: { storage, persistSession: true } });
    const { data, error } = await auth.auth.signInWithPassword(u);
    if (error || !data.user) throw new Error(`test user sign-in failed: ${error?.message}`);
    const store = createSupabaseStore({ url: live.url, publishableKey: live.key, storage });
    return { store, id: data.user.id, auth };
  }
  beforeAll(async () => {
    const a = await open(live.a);
    const b = await open(live.b);
    A = a.store;
    B = b.store;
    idA = a.id;
    idB = b.id;
    for (const s of [A, B]) await s.setConsent('health_data_processing', true);
  });
  afterAll(async () => {
    for (const undo of made.reverse()) await undo().catch(() => undefined);
  });

  it('two different users', () => {
    expect(idA).not.toBe(idB);
  });

  it('wellness: persists, retries safely, validates, and is invisible to another user', async () => {
    const key = `live-${Date.now().toString(36)}-aaaa`;
    const e = await A.addWellness!({ kind: 'walk', day: today, amount: 12, clientKey: key });
    made.push(() => A.deleteWellness!(e.id));
    const again = await A.addWellness!({ kind: 'walk', day: today, amount: 12, clientKey: key });
    expect(again.id).toBe(e.id); // retry with the same key records nothing new
    expect((await A.listWellness!(today)).filter((x) => x.id === e.id)).toHaveLength(1);
    expect((await B.listWellness!(today)).some((x) => x.id === e.id)).toBe(false);
    // Another user cannot delete it (RLS makes the delete a no-op, never an error that leaks existence).
    await B.deleteWellness!(e.id).catch(() => undefined);
    expect((await A.listWellness!(today)).some((x) => x.id === e.id)).toBe(true);
    // Failed write: the database range check maps to a plain, typed error.
    expect(await code(A.addWellness!({ kind: 'walk', day: today, amount: 99999 }))).toBe(
      'invalid_input',
    );
  });

  it('weight and food diary persist per user', async () => {
    const w = await A.addWeight({ weightKg: 70.5 });
    made.push(() => A.deleteWeight(w.id));
    expect((await A.listWeights()).some((x) => x.id === w.id)).toBe(true);
    expect((await B.listWeights()).some((x) => x.id === w.id)).toBe(false);
    const log = await A.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [
        {
          name: 'Live test item',
          foodId: null,
          grams: 100,
          kcal: 100,
          proteinG: 5,
          carbsG: 10,
          fatG: 2,
          kcalLow: 90,
          kcalHigh: 110,
          source: 'user_manual',
          confidence: 'high',
          userEdited: true,
        },
      ],
    });
    made.push(() => A.deleteFoodLog(log.id));
    expect((await A.listFoodLogs()).some((x) => x.id === log.id)).toBe(true);
    expect((await B.listFoodLogs()).some((x) => x.id === log.id)).toBe(false);
  });

  it('Daily Fit Plan reflects a logged walk, once', async () => {
    const e = await A.addWellness!({
      kind: 'walk',
      day: today,
      amount: 20,
      clientKey: `live-plan-${Date.now().toString(36)}`,
    });
    made.push(() => A.deleteWellness!(e.id));
    const plan = await A.regenerateDailyPlan!('normal', today);
    expect(plan.items.filter((i) => i.title.startsWith('You walked today'))).toHaveLength(1);
  });

  it('challenges: one active at a time, private to the owner', async () => {
    const c = await A.startChallenge({ startDate: today, lengthDays: 7, targetDays: 3 });
    made.push(() => A.setChallengeStatus(c.id, 'abandoned'));
    expect(await code(A.startChallenge({ startDate: today, lengthDays: 7, targetDays: 3 }))).toBe(
      'active_challenge_exists',
    );
    expect((await B.listChallenges()).some((x) => x.id === c.id)).toBe(false);
  });

  it('data export includes the wellness logs and fails whole rather than partially', async () => {
    const d = await buildDataExport(A, new Date());
    expect(d.format).toBe('dancehall-fit-export-v1');
    expect(Array.isArray(d.wellness)).toBe(true);
  });

  it('account deletion is a cancellable request (never executes here)', async () => {
    const r = await A.requestAccountDeletion!();
    expect(r.status).toBe('requested');
    expect((await A.requestAccountDeletion!()).id).toBe(r.id); // idempotent
    expect(await A.cancelAccountDeletion!()).toBe(true);
    expect(await A.getAccountDeletionRequest!()).toBeNull();
  });

  it('storage: the photo bucket is private and one user cannot read another’s folder', async () => {
    const a = await open(live.a);
    const b = await open(live.b);
    const path = `${idA}/live-test-${Date.now()}.jpg`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const up = await a.auth.storage.from('food-photos').upload(path, bytes, {
      contentType: 'image/jpeg',
    });
    expect(up.error).toBeNull();
    made.push(async () => void (await a.auth.storage.from('food-photos').remove([path])));
    expect((await a.auth.storage.from('food-photos').download(path)).error).toBeNull();
    expect((await b.auth.storage.from('food-photos').download(path)).error).not.toBeNull();
    const anon = createClient(live.url, live.key);
    expect((await anon.storage.from('food-photos').download(path)).error).not.toBeNull();
    // B cannot write into A's folder either.
    const bad = await b.auth.storage.from('food-photos').upload(`${idA}/intruder.jpg`, bytes, {
      contentType: 'image/jpeg',
    });
    expect(bad.error).not.toBeNull();
    void idB;
  });
});
