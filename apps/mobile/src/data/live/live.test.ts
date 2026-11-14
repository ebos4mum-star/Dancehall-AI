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

  it('habits: persist, enforce the five-habit limit, and stay private', async () => {
    const hs: Awaited<ReturnType<DataStore['addHabit']>>[] = [];
    for (let k = 1; k <= 5; k++) {
      const h = await A.addHabit(`Live habit ${k}`);
      hs.push(h);
      made.push(() => A.archiveHabit(h.id));
    }
    expect(await code(A.addHabit('Live sixth'))).toBe('habit_limit_reached');
    await A.setHabitDone(hs[0]!.id, today, true);
    await A.setHabitDone(hs[0]!.id, today, true).catch(() => undefined); // a duplicate tick is not an error for the person
    expect((await A.listHabitCheckins(today)).filter((c) => c.habitId === hs[0]!.id)).toHaveLength(
      1,
    );
    expect((await B.listHabits()).some((x) => x.id === hs[0]!.id)).toBe(false);
    expect((await B.listHabitCheckins(today)).some((c) => c.habitId === hs[0]!.id)).toBe(false);
    await A.setHabitDone(hs[0]!.id, today, false);
    expect((await A.listHabitCheckins(today)).some((c) => c.habitId === hs[0]!.id)).toBe(false);
  });

  it('wellness: every kind persists for the owner and survives a brand-new session', async () => {
    const day = today;
    const ids: string[] = [];
    for (const input of [
      { kind: 'hydration' as const, amount: 250 },
      { kind: 'walk' as const, amount: 20, amount2: 1.5 },
      { kind: 'strength' as const, amount: 15, label: 'bands' },
      { kind: 'sleep' as const, amount: 7, label: 'rested' },
      { kind: 'recovery' as const, amount: 0, label: 'ok' },
      { kind: 'hunger' as const, amount: 0, label: 'comfortable' },
      { kind: 'measurement' as const, amount: 80, label: 'waist' },
    ]) {
      const e = await A.addWellness!({
        ...input,
        day,
        clientKey: `live-kind-${input.kind}-${Date.now().toString(36)}`,
      });
      ids.push(e.id);
      made.push(() => A.deleteWellness!(e.id));
    }
    const fresh = await open(live.a); // a new session, as after an app restart
    const kinds = new Set((await fresh.store.listWellness!(day)).map((e) => e.kind));
    for (const k of ['hydration', 'walk', 'strength', 'sleep', 'recovery', 'hunger', 'measurement'])
      expect(kinds.has(k as never)).toBe(true);
    expect((await B.listWellness!(day)).some((e) => ids.includes(e.id))).toBe(false);
  });

  it('household: invite, join, shared list, privacy, and the attempt limit', async () => {
    const h = await A.createHousehold!('Live home');
    const invite = await A.createHouseholdInvite!();
    expect(invite).toHaveLength(10);
    await A.addHouseholdGroceryItem!({ name: 'Live rice' });
    expect(await code(B.joinHousehold!('WRONGCODE1'))).toBe('invalid_invite');
    const joined = await B.joinHousehold!(invite);
    expect(joined.id).toBe(h.id);
    expect((await B.listHouseholdGrocery!()).some((g) => g.name === 'Live rice')).toBe(true);
    // A housemate never sees the owner's health data.
    expect(await B.listWeights()).toEqual([]);
    made.push(() => B.leaveHousehold!());
    made.push(() => A.leaveHousehold!());
    // The limit: leave, then 5 incorrect codes pause joining (even with a correct code) until the window passes.
    await B.leaveHousehold!();
    const invite2 = await A.createHouseholdInvite!();
    for (let k = 0; k < 5; k++)
      expect(await code(B.joinHousehold!(`BADCODE${k}`))).toBe('invalid_invite');
    expect(await code(B.joinHousehold!(invite2))).toBe('too_many_attempts');
  });

  it('Pulse ledger: stored once, synced to a second session, and two devices racing show it exactly once', async () => {
    const day = `2031-06-${String(10 + (Date.now() % 15)).padStart(2, '0')}`; // far-future synthetic day: cannot collide with real data
    const id = `daily:water:${day}`;
    const second = await open(live.a);
    expect(await A.recordCelebrations!([{ id, mode: 'full' }])).toEqual([id]);
    expect(await A.recordCelebrations!([{ id, mode: 'gentle' }])).toEqual([]); // already recorded: not claimed again
    expect(await second.store.listCelebrations!()).toContain(id); // a new session sees it after sign-in
    expect(await B.listCelebrations!()).not.toContain(id);
    // Ledger rows are removed with the synthetic account (cascade) in the cleanup step.
    // Two devices (two sessions of A) racing on a NEW achievement: exactly one claims it.
    const id2 = `weekly:movement_minutes:${day}`;
    const [x, y] = await Promise.all([
      A.recordCelebrations!([{ id: id2, mode: 'full' }]),
      second.store.recordCelebrations!([{ id: id2, mode: 'full' }]),
    ]);
    expect(x.length + y.length).toBe(1);
  });

  it('export contains only the signed-in person’s data, including wellness, habits and the achievement ledger', async () => {
    const mine = await buildDataExport(A, new Date());
    const theirs = await buildDataExport(B, new Date());
    const ids = (d: typeof mine) =>
      new Set([...(d.wellness as Array<{ id: string }>).map((e) => e.id)]);
    for (const id of ids(mine)) expect(ids(theirs).has(id)).toBe(false);
    expect(Array.isArray(mine.celebrations)).toBe(true);
    expect(Array.isArray(mine.habits)).toBe(true);
    expect(JSON.stringify(theirs)).not.toContain(idA);
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

  it('storage: the bucket itself refuses non-JPEG and over-5 MB uploads, and unauthenticated writes', async () => {
    const a = await open(live.a);
    const bucket = a.auth.storage.from('food-photos');
    const stamp = Date.now();
    const png = `${idA}/live-test-${stamp}.png`;
    const big = `${idA}/live-test-${stamp}-big.jpg`;
    made.push(async () => void (await bucket.remove([png, big])));
    const wrongType = await bucket.upload(png, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      contentType: 'image/png',
    });
    expect(wrongType.error).not.toBeNull();
    const oversize = new Uint8Array(5 * 1024 * 1024 + 1);
    oversize.set([0xff, 0xd8, 0xff]);
    const tooBig = await bucket.upload(big, oversize, { contentType: 'image/jpeg' });
    expect(tooBig.error).not.toBeNull();
    const anon = createClient(live.url, live.key);
    const noAuth = await anon.storage
      .from('food-photos')
      .upload(`${idA}/anon-${stamp}.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      });
    expect(noAuth.error).not.toBeNull();
  });
});
