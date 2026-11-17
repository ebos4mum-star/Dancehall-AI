/**
 * FRIENDS on the isolated STAGING project, driven by the app's REAL code: the real account service (no email, device secret, Recovery Key), the real Supabase store and
 * its social adapter, real sign-in, the deployed `account` and `social` Edge Functions and the real database. Synthetic accounts only; they are deleted afterwards.
 * Skipped unless DH_STAGING_FRIENDS is set. Guarded to the staging project: the development and any other reference are refused.
 *   DH_STAGING_FRIENDS=main|after DH_STAGING_URL=https://<staging ref>.supabase.co DH_STAGING_PUBLISHABLE_KEY=<publishable> DH_STAGING_STATE=<path to a scratch json file>
 *   pnpm --filter @dancehall/mobile exec vitest run src/data/live/friendsStaging.test.ts
 * Phase `main` creates three accounts and runs the whole Friends flow, then requests deletion of account A and saves the other sessions. After the server-side deletion
 * executor has run, phase `after` checks what the other accounts see. Nothing secret is printed.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createEdgeAccountApi } from '../../account/cloud/accountApi';
import {
  createAccountService,
  type Answers,
  type SecretStorage,
} from '../../account/cloud/accountService';
import { createSupabaseStore } from '../supabaseStore';
import type { DataStore } from '../types';

// The public repository does not name the projects: the guard compares SHA-256 digests of the project reference.
const STAGING_REF_SHA256 = 'd746b80bdfbb24b3ec62411f77f4100858df5ff0ff1c3f3925ddc0ea70120ce6';
const DEV_REF_SHA256 = '28b12271d516972144edb9c494362ef7b1bb6fc2fe26a9ee49aa9d404c69bafb';
const digestOf = (ref: string) => createHash('sha256').update(ref).digest('hex');
const phase = process.env.DH_STAGING_FRIENDS ?? '';
const url = (process.env.DH_STAGING_URL ?? '').replace(/\/+$/, '');
const key = process.env.DH_STAGING_PUBLISHABLE_KEY ?? '';
const stateFile = process.env.DH_STAGING_STATE ?? '';
const on = phase === 'main' || phase === 'after';

const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const letters = (n: number) =>
  Array.from(rnd(n), (b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('');
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}\n`);
  if (!ok) failures += 1;
};
const memory = () => {
  const d = new Map<string, string>();
  return {
    d,
    getItem: async (k: string) => d.get(k) ?? null,
    setItem: async (k: string, v: string) => void d.set(k, v),
    removeItem: async (k: string) => void d.delete(k),
    get: async (k: string) => d.get(k) ?? null,
    set: async (k: string, v: string) => void d.set(k, v),
    remove: async (k: string) => void d.delete(k),
  };
};
type Mem = ReturnType<typeof memory>;
const code = (r: unknown) => (r as { code?: string }).code;

async function open(authStorage: Mem, secrets: Mem) {
  const store = createSupabaseStore({ url, publishableKey: key, storage: authStorage });
  const api = createEdgeAccountApi({
    url,
    publishableKey: key,
    getToken: async () => (await store.accessToken?.()) ?? null,
    fetchImpl: globalThis.fetch,
  });
  const svc = createAccountService({
    api,
    secrets: secrets as SecretStorage,
    random: rnd,
    signIn: { signInWithDevice: (id, s) => store.signInWithDevice!(id, s) },
  });
  return { store, svc };
}
const ans = (): Answers => [
  { id: 'q-first-pet', answer: `stg-${letters(6)}` },
  { id: 'q-family-dish', answer: `stg-${letters(6)}` },
];

describe.skipIf(!on)('Friends on staging with the real app code', () => {
  it('guard: only the staging project is ever contacted', () => {
    const ref = /^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url)?.[1] ?? '';
    expect(digestOf(ref)).toBe(STAGING_REF_SHA256);
    expect(digestOf(ref)).not.toBe(DEV_REF_SHA256);
    expect(key.startsWith('sb_publishable_')).toBe(true);
    expect(stateFile.length).toBeGreaterThan(0);
  });

  it.skipIf(phase !== 'main')(
    'main: accounts, names, requests, blocking, consent, groups, privacy, deletion request',
    async () => {
      const mk = async () => {
        const authStorage = memory();
        const secrets = memory();
        const { store, svc } = await open(authStorage, secrets);
        const made = await svc.createAccount({ answers: ans() });
        return { authStorage, secrets, store, svc, made, id: '' };
      };
      const [A, B, C] = [await mk(), await mk(), await mk()];
      check(
        "the app's own account service creates three accounts with no email",
        A.made.ok && B.made.ok && C.made.ok,
      );
      if (!(A.made.ok && B.made.ok && C.made.ok)) throw new Error('account creation failed');
      for (const x of [A, B, C]) x.id = (await x.store.getSession())!.userId;
      check(
        'each phone is signed in with a real session',
        [A, B, C].every((x) => !!x.id),
      );
      const S = (x: { store: DataStore }) => x.store;
      const nameA = `ph_${letters(6)}`;
      const nameB = `ph_${letters(6)}`;
      const nameC = `ph_${letters(6)}`;

      // Private records for A (must never reach anyone else).
      await A.store.setConsent('health_data_processing', true);
      await A.store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
      await A.store.savePrivate({
        birthDate: '1990-01-01',
        heightCm: 170,
        sex: 'female',
        activityLevel: 'light',
      });
      await A.store.completeOnboarding();
      await A.store.addWeight({ weightKg: 71.37 });
      await A.store.createFoodLog({
        mealType: 'lunch',
        source: 'manual',
        items: [
          {
            name: 'SECRETFOODMARKER',
            foodId: null,
            grams: 100,
            kcal: 123,
            proteinG: 1,
            carbsG: 1,
            fatG: 1,
            kcalLow: 100,
            kcalHigh: 150,
            source: 'user_manual',
            confidence: 'medium',
            userEdited: false,
          },
        ],
      });
      const done = await A.store.createSession({
        title: 'Dancehall class',
        workoutId: null,
        style: 'dancehall',
        minutes: 30,
        status: 'completed',
        completedAt: new Date(Date.now() - 3600_000).toISOString(),
        durationS: 1800,
      });
      check(
        'A has private weight, food and workout records',
        !!done.id && (await A.store.listWeights()).length === 1,
      );
      await B.store.setConsent('health_data_processing', true);
      await B.store.updateProfile({ displayName: 'Kofi', country: 'GH', timeZone: 'UTC' });
      await B.store.createSession({
        title: 'Kofi class',
        workoutId: null,
        style: 'dancehall',
        minutes: 40,
        status: 'completed',
        completedAt: new Date(Date.now() - 3600_000).toISOString(),
        durationS: 2400,
      });

      // Names
      check(
        'a person without a public name cannot ask',
        code(await S(C).socialRequest!(nameA)) === 'needs_username',
      );
      check(
        'a staff look-alike name is refused',
        code(await S(A).socialClaimUsername!('adm1n')) === 'invalid_username',
      );
      check('A claims a public name', (await S(A).socialClaimUsername!(nameA)).ok === true);
      check('B claims a public name', (await S(B).socialClaimUsername!(nameB)).ok === true);
      check('C claims a public name', (await S(C).socialClaimUsername!(nameC)).ok === true);
      check('the overview shows the new name', (await S(A).socialOverview!()).username === nameA);

      // Requests
      check('A asks B', (await S(A).socialRequest!(nameB)).ok === true);
      check('B sees the request', (await S(B).socialOverview!()).incoming.includes(nameA));
      check('B accepts', (await S(B).socialRespond!(nameA, true)).ok === true);
      check(
        'both are friends',
        (await S(A).socialOverview!()).friends.includes(nameB) &&
          (await S(B).socialOverview!()).friends.includes(nameA),
      );
      await S(A).socialRequest!(nameC);
      check(
        'C declines',
        (await S(C).socialRespond!(nameA, false)).ok === true &&
          !(await S(A).socialOverview!()).outgoing.includes(nameC),
      );
      await S(A).socialRequest!(nameC);
      await S(C).socialRespond!(nameA, true);
      check(
        'A removes C',
        (await S(A).socialRemove!(nameC)).ok === true &&
          !(await S(A).socialOverview!()).friends.includes(nameC),
      );
      await S(A).socialRequest!(nameC);
      await S(C).socialRespond!(nameA, true);
      check(
        'C blocks A: both lists clear, and A cannot find C afterwards',
        (await S(C).socialBlock!(nameA)).ok === true &&
          !(await S(A).socialOverview!()).friends.includes(nameC),
      );
      const blocked = await S(A).socialRequest!(nameC);
      const unknown = await S(A).socialRequest!(`zz_${letters(6)}`);
      check(
        'a blocked person gets exactly the answer for an unknown name',
        blocked.ok === false && code(blocked) === code(unknown),
      );

      // Consent
      check(
        'nothing is shared by default',
        ((await S(B).socialViewFriend!(nameA)) as { activity: unknown }).activity === null,
      );
      for (const bad of ['food', 'weight', 'health', 'food_diary', 'weight_entries'])
        check(
          `sharing "${bad}" is refused`,
          code(await S(A).socialSetShare!(nameB, bad, true)) === 'invalid_category',
        );
      check(
        'A shares the weekly summary with B only',
        (await S(A).socialSetShare!(nameB, 'activity_summary', true)).ok === true,
      );
      const seen = (await S(B).socialViewFriend!(nameA)) as {
        ok: boolean;
        activity: { minutes: number; sessions: number } | null;
      };
      check(
        'B sees the server-calculated weekly summary (30 minutes)',
        seen.activity?.minutes === 30 && seen.activity?.sessions === 1,
        JSON.stringify(seen.activity),
      );
      check(
        'the view holds no food, weight or health data',
        !/71\.37|SECRETFOODMARKER|kcal|weight/i.test(JSON.stringify(seen)),
      );
      check(
        'withdrawing is immediate',
        (await S(A).socialSetShare!(nameB, 'activity_summary', false)).ok === true &&
          ((await S(B).socialViewFriend!(nameA)) as { activity: unknown }).activity === null,
      );
      await S(A).socialSetShare!(nameB, 'activity_summary', true);

      // Groups
      const start = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
      const end = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
      const ch = await S(A).socialCreateGroup!({
        kind: 'challenge',
        title: 'Staging challenge',
        metric: 'active_minutes',
        startDay: start,
        endDay: end,
        invite: [nameB],
      });
      check('A creates a free challenge', ch.ok === true);
      if (!ch.ok) throw new Error('challenge');
      const gid = (ch as { id: string }).id;
      check('B joins', (await S(B).socialRespondGroup!(gid, true)).ok === true);
      await S(A).socialSyncGroup!(gid);
      await S(B).socialSyncGroup!(gid);
      const view = (await S(B).socialOverview!()).groups.find((g) => g.id === gid)!;
      check(
        'progress is calculated by the server: ama 30, kofi 40',
        JSON.stringify(view.byMember.map((m) => m.total).sort()) === JSON.stringify([30, 40]),
        JSON.stringify(view.byMember.map((m) => m.total)),
      );
      const cp = await S(A).socialCreateGroup!({
        kind: 'couple',
        title: 'Together',
        metric: 'active_days',
        target: 4,
        startDay: start,
        endDay: end,
        invite: [nameB],
      });
      check(
        'a couple goal is created and accepted',
        cp.ok === true &&
          (await S(B).socialRespondGroup!((cp as { id: string }).id, true)).ok === true,
      );
      const fam = await S(A).socialCreateGroup!({
        kind: 'family',
        title: 'Family',
        metric: 'active_days',
        target: 5,
        startDay: start,
        endDay: end,
        invite: [nameB],
      });
      check(
        'a family goal is created and accepted',
        fam.ok === true &&
          (await S(B).socialRespondGroup!((fam as { id: string }).id, true)).ok === true,
      );
      check(
        'a stranger cannot sync a group',
        code(await S(C).socialSyncGroup!(gid)) === 'not_member',
      );

      // Privacy through the real client
      check(
        "B's own records exclude A's weight and food",
        (await B.store.listWeights()).length === 0 && (await B.store.listFoodLogs()).length === 0,
      );
      const bDb = createClient(url, key, {
        auth: { storage: B.authStorage, persistSession: true },
      });
      const w = await bDb.from('weight_entries').select('*').eq('user_id', A.id);
      const f = await bDb.from('food_log_items').select('*').eq('user_id', A.id);
      check(
        "a direct query by B for A's weight and food returns nothing (row-level security)",
        (w.data ?? []).length === 0 && (f.data ?? []).length === 0,
      );
      const sr = await bDb.from('social_friendships').select('*');
      check(
        'the social tables are closed to a signed-in client',
        !!sr.error || (sr.data ?? []).length === 0,
        sr.error?.code ?? 'no rows',
      );

      // Deletion request, then the server-side executor (run outside this test)
      const del = await A.store.requestAccountDeletion?.();
      check('A requests account deletion through the real app code', !!del);
      writeFileSync(
        stateFile,
        JSON.stringify({
          nameA,
          nameB,
          nameC,
          ids: { A: A.id, B: B.id, C: C.id },
          B: [...B.authStorage.d],
          C: [...C.authStorage.d],
          A_auth: [...A.authStorage.d],
        }),
      );
      expect(failures).toBe(0);
    },
    240000,
  );

  it.skipIf(phase !== 'after')(
    'after: what the other accounts see once A was deleted',
    async () => {
      const st = JSON.parse(readFileSync(stateFile, 'utf8'));
      const bStore = memory();
      for (const [k, v] of st.B) bStore.d.set(k, v);
      const aAuth = memory();
      for (const [k, v] of st.A_auth) aAuth.d.set(k, v);
      const B = createSupabaseStore({ url, publishableKey: key, storage: bStore });
      const o = await B.socialOverview!();
      check("the deleted account's friendship is gone", !o.friends.includes(st.nameA));
      check(
        'and it is gone from every group',
        o.groups.every(
          (g) => !g.members.includes(st.nameA) && g.byMember.every((m) => m.username !== st.nameA),
        ),
      );
      check(
        'nobody can still view it',
        code(await B.socialViewFriend!(st.nameA)) === 'not_friends',
      );
      const A = createSupabaseStore({ url, publishableKey: key, storage: aAuth });
      // The phone may still hold the old access token until it expires (that is how tokens work); the server must refuse it, and there is nothing left to read.
      const stale = await A.socialOverview!().then(
        () => 'accepted',
        (e: unknown) => String((e as Error).message),
      );
      check(
        "the deleted account's old token is refused by the social function",
        stale === 'unauthorized',
        stale,
      );
      const aDb = createClient(url, key, { auth: { storage: aAuth, persistSession: true } });
      const left = await aDb.from('weight_entries').select('*');
      check('and nothing of its private records remains', (left.data ?? []).length === 0);
      expect(failures).toBe(0);
    },
    120000,
  );
});
