/**
 * STAGE 6A: the app's REAL account service, Edge API client and Supabase store run against the live development project, with ONE throwaway account.
 * Skipped unless DH_LIVE_MOBILE=run-one-throwaway-account. Guarded to the project named in DH_LIVE_APPROVED_REF (real project references stay out of this public repo).
 * It records every request the app's code makes and every console call, then proves: no email is needed, the PIN, the security answers and the Recovery Key
 * never leave the device, and nothing sensitive is logged. Nothing secret is printed. The operator deletes the account afterwards (its id is printed).
 *   NODE_USE_ENV_PROXY=1 (only when running behind a proxy) DH_LIVE_MOBILE=run-one-throwaway-account DH_LIVE_APPROVED_REF=<ref> DH_LIVE_URL=https://<ref>.supabase.co
 *   DH_LIVE_PUBLISHABLE_KEY=<publishable key> pnpm --filter @dancehall/mobile exec vitest run src/account/cloud/accountLive.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { createEdgeAccountApi } from './accountApi';
import { createAccountService, type Answers, type SecretStorage } from './accountService';
import { createPinVault } from '../pinVault';
import { createSupabaseStore } from '../../data/supabaseStore';

const ref = process.env.DH_LIVE_APPROVED_REF ?? '';
const url = (process.env.DH_LIVE_URL ?? '').replace(/\/+$/, '');
const key = process.env.DH_LIVE_PUBLISHABLE_KEY ?? '';
const on = process.env.DH_LIVE_MOBILE === 'run-one-throwaway-account';

const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const check = (name: string, ok: boolean, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}\n`);
  expect(ok, name).toBe(true);
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

describe.skipIf(!on)(
  "stage 6A: the app's own account code against the live development project",
  () => {
    it('creates, signs in, reads its profile, refreshes, uses protected actions, and leaks nothing', async () => {
      expect(ref).toMatch(/^[a-z0-9]{20}$/);
      expect(url).toBe(`https://${ref}.supabase.co`);
      expect(key.startsWith('sb_publishable_')).toBe(true);

      // Everything the app's code sends, and everything it prints, is recorded.
      const sent: { url: string; body: string }[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({
          url: String(input instanceof Request ? input.url : input),
          body: typeof init?.body === 'string' ? init.body : '',
        });
        return realFetch(input, init);
      }) as typeof fetch;
      const logged: string[] = [];
      for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
        vi.spyOn(console, m).mockImplementation(
          (...a: unknown[]) => void logged.push(a.map(String).join(' ')),
        );

      const authStorage = memory(); // stands in for the Keychain-backed auth session storage
      const secrets = memory(); // stands in for the Keychain-backed account secret storage
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

      const PIN = '482916';
      const answers: Answers = [
        { id: 'q-first-pet', answer: 'live-' + hexOf(rnd(4)) },
        { id: 'q-family-dish', answer: 'live-' + hexOf(rnd(4)) },
      ];
      let userId = '';
      let recoveryKey = '';
      try {
        // --- state before ---
        check(
          'before setup: no account state on this device',
          (await svc.backupState()) === 'none' &&
            !(await svc.hasDeviceCredential()) &&
            (await svc.pendingSetup()) === null,
        );

        // --- provisioning (no email anywhere) ---
        const created = await svc.createAccount({ answers });
        check("provisioning through the app's own service succeeds", created.ok);
        if (!created.ok) return;
        recoveryKey = created.key;
        check(
          'the Recovery Key is shown once: 36 characters, backup pending',
          recoveryKey.length === 36 &&
            (await svc.backupState()) === 'pending' &&
            (await svc.pendingKey())!.length === 44,
        );
        check(
          'the device credential is stored (secure storage) and the setup draft is gone',
          (await svc.hasDeviceCredential()) && (await svc.pendingSetup()) === null,
        );
        const session = await store.getSession();
        check(
          'the app is signed in with a real session and NO email address was requested',
          !!session && session.mode === 'supabase',
        );
        check(
          "the account's login name is the synthetic identifier, not a personal email",
          /^u[0-9a-f]{32}@accounts\.dancehall\.invalid$/.test(session!.email ?? ''),
        );
        userId = session!.userId;

        // --- the PIN stays local ---
        const vault = createPinVault({ storage: secrets, random: rnd });
        await vault.create(PIN);
        check(
          'the PIN is set in the local vault and verifies',
          (await vault.verify(PIN)).ok === true,
        );

        // --- profile access, protected actions ---
        const profile = await store.getProfile();
        check(
          'the signed-in account reads its own profile (row-level security)',
          !!profile && profile.onboardedAt === null,
        );
        const st = await svc.status();
        check(
          'the protected account action works with the live session',
          st.ok &&
            st.hasRecovery &&
            JSON.stringify(st.questions) === JSON.stringify(['q-family-dish', 'q-first-pet']),
        );
        const early = await api.call('status');
        check('status via the raw API client carries the session automatically', early.ok === true);
        const noToken = await createEdgeAccountApi({
          url,
          publishableKey: key,
          getToken: async () => null,
          fetchImpl: globalThis.fetch,
        }).call('rotate', {});
        check(
          'a protected action without a session is refused by the client before it is sent',
          !noToken.ok && noToken.status === 401,
        );

        // --- session refresh: expire the stored session; a fresh store must refresh it by itself ---
        const sessionKey = [...authStorage.d.keys()].find((k) => /auth-token/.test(k))!;
        const stored = JSON.parse(authStorage.d.get(sessionKey)!);
        const oldRefresh = stored.refresh_token as string;
        stored.expires_at = 1;
        authStorage.d.set(sessionKey, JSON.stringify(stored));
        const store2 = createSupabaseStore({ url, publishableKey: key, storage: authStorage });
        const refreshed = await store2.getSession();
        check(
          "an expired session is refreshed by the app's own client",
          !!refreshed && refreshed.userId === userId,
        );
        const after = JSON.parse(authStorage.d.get(sessionKey)!);
        check(
          'the refresh issued a new access token and refresh token',
          after.refresh_token !== oldRefresh && after.expires_at > Math.floor(Date.now() / 1000),
        );
        check('the refreshed session still reads the profile', !!(await store2.getProfile()));

        // --- device credential restore: signed out, then signed back in from the stored credential ---
        await store2.signOut();
        check('after sign-out there is no session', (await store2.getSession()) === null);
        check(
          'the stored device credential signs the phone back in',
          (await svc.restoreSession()) === 'signed_in',
        );
        const store3 = createSupabaseStore({ url, publishableKey: key, storage: authStorage });
        check('and it is the same account', (await store3.getSession())?.userId === userId);

        // --- recovery key: rotation through the app's service replaces it; the old one stops working ---
        const rotated = await svc.rotateKey(answers);
        check(
          'replacing the Recovery Key with the answers works',
          rotated.ok && rotated.key !== recoveryKey,
        );
        if (!rotated.ok) return;
        check(
          'the replacement is pending until confirmed, then the key is erased from the device',
          (await svc.backupState()) === 'pending',
        );
        await svc.confirmBackup();
        check(
          'confirming the backup erases the key',
          (await svc.backupState()) === 'confirmed' && (await svc.pendingKey()) === null,
        );
        const wrongRot = await svc.rotateKey([answers[0], { id: answers[1].id, answer: 'not-it' }]);
        check('wrong answers cannot replace the key', !wrongRot.ok);
        const oldKeyStart = await svc.recoverBegin(recoveryKey);
        check(
          'a recovery with the OLD key still returns questions (decoy), so it reveals nothing',
          oldKeyStart.ok,
        );
        if (oldKeyStart.ok) {
          const bad = await svc.recoverVerify(oldKeyStart, answers);
          check(
            'but verifying with the old key fails generically',
            !bad.ok && bad.reason === 'failed',
          );
        }
        // the new key starts a real recovery: the normal 24-hour wait, then the owner cancels it from the signed-in phone
        const begin = await svc.recoverBegin(rotated.key);
        check('the new key starts a recovery', begin.ok);
        if (begin.ok) {
          const v = await svc.recoverVerify(begin, answers);
          check('key + answers start the cooling-off', v.ok);
          if (v.ok) {
            const wait = v.readyAt - Date.now();
            check(
              'the wait is the normal 24 hours',
              wait > 23.9 * 3600_000 && wait <= 24.01 * 3600_000,
              `${(wait / 3600_000).toFixed(2)} h`,
            );
            check(
              'recovery state is "in progress" on this device',
              (await svc.recoveryInProgress()) !== null,
            );
            const seen = await svc.status();
            check(
              'the signed-in owner sees the pending recovery',
              seen.ok && !!seen.pendingRecovery,
            );
            const canc = await svc.cancelServerRecovery();
            check('the owner cancels it', canc.ok && canc.cancelled >= 1);
            await svc.cancelRecoveryDraft();
            check('the local recovery draft is cleared', (await svc.recoveryInProgress()) === null);
          }
        }

        // --- what the app sent and printed ---
        const bodies = sent.map((s) => s.body).join('\n');
        const provisionBodies = sent.filter((s) => /\/account\/provision$/.test(s.url));
        check(
          'the provisioning request contains no email field and no personal identifier',
          provisionBodies.length === 1 && !/email|@/.test(provisionBodies[0]!.body),
        );
        check(
          'the PIN never left the device',
          !bodies.includes(PIN) && !sent.some((s) => s.url.includes(PIN)),
        );
        check(
          'the security answers never left the device',
          answers.every((a) => !bodies.toLowerCase().includes(a.answer.toLowerCase())),
        );
        check(
          'the Recovery Keys never left the device (only digests did)',
          ![recoveryKey, rotated.key].some(
            (k) => bodies.includes(k) || bodies.includes(k.toLowerCase()),
          ),
        );
        check(
          'every request went to the approved project only',
          sent.every((s) => s.url.startsWith(url)),
        );
        const secretsDump = JSON.stringify([...secrets.d.entries()]);
        check('the PIN is stored only as a hash', !secretsDump.includes(PIN));
        const sensitive = [
          PIN,
          recoveryKey,
          rotated.key,
          ...answers.map((a) => a.answer),
          JSON.parse(authStorage.d.get(sessionKey)!).access_token as string,
          JSON.parse(authStorage.d.get(sessionKey)!).refresh_token as string,
        ];
        const out = logged.join('\n');
        check(
          'nothing sensitive (PIN, keys, answers, tokens) appears in anything the app logged',
          sensitive.every((s) => !out.includes(s)),
          `${logged.length} console calls`,
        );
        process.stdout.write(`TEMP_USER_ID ${userId}\n`);
      } finally {
        globalThis.fetch = realFetch;
        vi.restoreAllMocks();
        await svc.forgetDevice();
      }
    }, 300_000);
  },
);
