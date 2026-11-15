/**
 * THE FIRST CONTROLLED LIVE PROBE (Gate 4). Skipped unless DH_LIVE_PROBE=1. It creates exactly ONE throwaway account on the approved development project through the
 * deployed `account` function, signs in, checks row-level isolation and the privilege lockdown, then prints the user id to delete. It sends nothing unless
 * DH_LIVE_CONFIRM=create-one-throwaway-account is also set (otherwise it prints the plan only), refuses any host except https://<DH_LIVE_APPROVED_REF>.supabase.co, and never prints a key,
 * secret, token or answer. Nothing here runs in CI.
 *   DH_LIVE_PROBE=1 DH_LIVE_APPROVED_REF=<project ref> DH_LIVE_URL=https://<project ref>.supabase.co DH_LIVE_PUBLISHABLE_KEY=<publishable key> [DH_LIVE_CONFIRM=create-one-throwaway-account]
 *   pnpm --filter @dancehall/shared exec vitest run src/account-live-probe.test.ts
 */
import { describe, expect, it } from 'vitest';
import { generateRecoveryKey, recoveryDigest } from './recovery-key';
import { answersProof } from './security-questions';

// The approved project is named by the operator (real project references stay out of this public repository).
const ref = process.env.DH_LIVE_APPROVED_REF ?? '';
const on = process.env.DH_LIVE_PROBE === '1';
const url = (process.env.DH_LIVE_URL ?? '').replace(/\/+$/, '');
const apikey = process.env.DH_LIVE_PUBLISHABLE_KEY ?? '';
const send = process.env.DH_LIVE_CONFIRM === 'create-one-throwaway-account';
const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

describe.skipIf(!on)(
  'live probe: one throwaway account on the approved development project',
  () => {
    it('provisions, signs in, is isolated, cannot call the account functions directly, and prints what to delete', async () => {
      expect(ref, 'set DH_LIVE_APPROVED_REF to the approved project reference').toMatch(
        /^[a-z0-9]{20}$/,
      );
      expect(url, 'only the approved project may be probed').toBe(`https://${ref}.supabase.co`);
      expect(
        apikey.startsWith('sb_publishable_'),
        'use the publishable key, never a secret or service key',
      ).toBe(true);
      const fn = (op: string, body: unknown, token?: string) =>
        fetch(`${url}/functions/v1/account/${op}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey,
            authorization: `Bearer ${token ?? apikey}`,
          },
          body: JSON.stringify(body),
        });
      const key = generateRecoveryKey(rnd);
      const salt = hex(rnd(16));
      const answers: [{ id: string; answer: string }, { id: string; answer: string }] = [
        { id: 'q-first-pet', answer: 'probe-' + hex(rnd(4)) },
        { id: 'q-family-dish', answer: 'probe-' + hex(rnd(4)) },
      ];
      const secret = b64url(rnd(32));
      const body = {
        requestId: hex(rnd(16)),
        deviceSecret: secret,
        digest: recoveryDigest(key),
        proof: await answersProof(answers, salt),
        salt,
        q1: 'q-family-dish',
        q2: 'q-first-pet',
      };
      if (!send) {
        console.log(
          'DRY RUN: would create ONE throwaway account at',
          url,
          '(set DH_LIVE_CONFIRM=create-one-throwaway-account to send).',
        );
        console.log(
          'Steps: provision, repeat provision, provision with a different secret, password sign-in, read own profile, read others, status, direct acct_* calls, wrong-secret sign-in.',
        );
        return;
      }
      // 1. create, and the same request again returns the same account
      const r1 = await fn('provision', body);
      expect(r1.status, 'provision').toBe(200);
      const j1 = (await r1.json()) as { identifier: string };
      expect(j1.identifier).toMatch(/@/);
      const r2 = await fn('provision', body);
      expect(r2.status).toBe(200);
      expect(((await r2.json()) as { identifier: string }).identifier).toBe(j1.identifier);
      expect(
        (await fn('provision', { ...body, deviceSecret: b64url(rnd(32)) })).status,
        'same request, different secret',
      ).toBe(409);
      // 2. a normal Auth session from the device secret
      const signIn = (password: string) =>
        fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey },
          body: JSON.stringify({ email: j1.identifier, password }),
        });
      const ok = await signIn(secret);
      expect(ok.status, 'password sign-in with the device secret').toBe(200);
      const { access_token: token } = (await ok.json()) as { access_token: string };
      const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
        sub: string;
        role: string;
        exp: number;
        iat: number;
      };
      expect(claims.role).toBe('authenticated');
      console.log(
        `token lifetime (exp - iat): ${claims.exp - claims.iat} s (expected 900 after Gate 2)`,
      );
      // 3. row-level isolation
      const rest = (path: string, t = token) =>
        fetch(`${url}/rest/v1/${path}`, { headers: { apikey, authorization: `Bearer ${t}` } });
      expect((await (await rest('profiles?select=id')).json()) as unknown[]).toEqual([
        { id: claims.sub },
      ]);
      expect(
        (await (await rest(`profiles?select=id&id=neq.${claims.sub}`)).json()) as unknown[],
      ).toEqual([]);
      // 4. the function's signed-in action, and the privilege lockdown
      const st = (await (await fn('status', {}, token)).json()) as { hasRecovery: boolean };
      expect(st.hasRecovery).toBe(true);
      for (const t of [token, apikey]) {
        const direct = await fetch(`${url}/rest/v1/rpc/acct_status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey, authorization: `Bearer ${t}` },
          body: JSON.stringify({ p: { userId: claims.sub } }),
        });
        expect([401, 403, 404], 'acct_* functions must not be callable by clients').toContain(
          direct.status,
        );
      }
      // 5. a wrong secret is refused
      expect((await signIn(b64url(rnd(32)))).status).toBe(400);
      console.log(`PROBE OK. Throwaway user id: ${claims.sub}`);
      console.log(
        `DELETE IT (owner, dashboard SQL editor):  delete from auth.users where id = '${claims.sub}';   -- cascades to app.acct_* rows and profiles`,
      );
    }, 120_000);
  },
);
