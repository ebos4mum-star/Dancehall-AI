/**
 * LIVE regression test for the completed-recovery replay fix, on ONE throwaway account. Skipped unless DH_RF=run-replay-fix-one-throwaway-account.
 * Phases (DH_RF_PHASE): rf1 (create, verify recovery, prove the 24 h wait and early refusal) -> [operator moves the pending transaction's ready_at into the past in the
 * database, a fixture that avoids weakening any setting] -> rf2 (complete; identical replays must NOT sign the new device out) -> [operator clears applied_at, simulating
 * the function dying before the follow-up work was recorded] -> rf3 (a replay must finish the work, then further replays change nothing).
 * Guarded to the approved project; state (with secrets) lives only in the private file DH_RF_STATE; nothing secret is printed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { generateRecoveryKey, recoveryDigest } from './recovery-key';
import { answersProof } from './security-questions';

const ref = process.env.DH_LIVE_APPROVED_REF ?? '';
const url = (process.env.DH_LIVE_URL ?? '').replace(/\/+$/, '');
const apikey = process.env.DH_LIVE_PUBLISHABLE_KEY ?? '';
const phase = process.env.DH_RF_PHASE ?? '';
const stateFile = process.env.DH_RF_STATE ?? '';
const on = process.env.DH_RF === 'run-replay-fix-one-throwaway-account';

type QA = { id: string; answer: string };
interface S {
  identifier: string;
  userId: string;
  key: string;
  answers: [QA, QA];
  salt: string;
  secret: string;
  refresh: string;
  access: string;
  comp?: { txId: string; completionSecret: string; deviceSecret: string; newDigest: string };
}
const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  expect(ok, name).toBe(true);
};
const info = (m: string) => console.log('INFO  ' + m);
type R = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function http(u: string, init: RequestInit): Promise<R> {
  const r = await fetch(u, init);
  const t = await r.text();
  try {
    return { status: r.status, body: JSON.parse(t) };
  } catch {
    return { status: r.status, body: t };
  }
}
async function fn(op: string, body: unknown, token?: string): Promise<R> {
  for (let i = 0; i < 40; i++) {
    const r = await http(`${url}/functions/v1/account/${op}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey,
        authorization: `Bearer ${token ?? apikey}`,
      },
      body: JSON.stringify(body),
    });
    if (r.status !== 429) return r;
    await sleep(3000);
  }
  throw new Error('rate limited too long on ' + op);
}
const signIn = (identifier: string, password: string) =>
  http(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey },
    body: JSON.stringify({ email: identifier, password }),
  });
const refreshWith = (refresh_token: string) =>
  http(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey },
    body: JSON.stringify({ refresh_token }),
  });
const sub = (jwt: string) =>
  (JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;
const load = (): S => JSON.parse(readFileSync(stateFile, 'utf8')) as S;
const save = (s: S) => {
  writeFileSync(stateFile, JSON.stringify(s), { mode: 0o600 });
  chmodSync(stateFile, 0o600);
};

describe.skipIf(!on)('replay fix live regression', () => {
  it(`phase: ${phase}`, async () => {
    expect(ref).toMatch(/^[a-z0-9]{20}$/);
    expect(url).toBe(`https://${ref}.supabase.co`);
    expect(apikey.startsWith('sb_publishable_')).toBe(true);

    if (phase === 'rf1') {
      expect(existsSync(stateFile)).toBe(false);
      const key = generateRecoveryKey(rnd);
      const salt = hex(rnd(16));
      const answers: [QA, QA] = [
        { id: 'q-childhood-hero', answer: 'syn-' + hex(rnd(5)) },
        { id: 'q-first-pet', answer: 'syn-' + hex(rnd(5)) },
      ];
      const secret = b64url(rnd(32));
      const p = await fn('provision', {
        requestId: hex(rnd(16)),
        deviceSecret: secret,
        digest: recoveryDigest(key),
        proof: await answersProof(answers, salt),
        salt,
        q1: answers[0].id,
        q2: answers[1].id,
      });
      check('provision', p.status === 200);
      const si = await signIn(p.body.identifier, secret);
      check('sign in', si.status === 200);
      const s: S = {
        identifier: p.body.identifier,
        userId: sub(si.body.access_token),
        key,
        answers,
        salt,
        secret,
        refresh: si.body.refresh_token,
        access: si.body.access_token,
      };
      const st = await fn('recover/start', { digest: recoveryDigest(key) });
      const completionSecret = hex(rnd(32));
      const v = await fn('recover/verify', {
        txId: st.body.txId,
        proof: await answersProof(answers, st.body.salt),
        completionSecret,
      });
      const wait = v.body.readyAt - Date.now();
      check(
        'the recovery wait is the normal 24 hours (no temporary setting in force)',
        v.status === 200 && wait > 23.9 * 3600_000 && wait <= 24.01 * 3600_000,
        `${(wait / 3600_000).toFixed(2)} h`,
      );
      const newKey = generateRecoveryKey(rnd);
      s.comp = {
        txId: st.body.txId,
        completionSecret,
        deviceSecret: b64url(rnd(32)),
        newDigest: recoveryDigest(newKey),
      };
      const early = await fn('recover/complete', s.comp);
      check('completing early is refused (425)', early.status === 425);
      save(s);
      console.log('USER_ID ' + s.userId);
    }

    if (phase === 'rf2') {
      const s = load();
      const comp = s.comp!;
      const done = await fn('recover/complete', comp);
      check(
        'the completion succeeds (after the fixture moved ready_at)',
        done.status === 200 && done.body.identifier === s.identifier,
      );
      const si = await signIn(s.identifier, comp.deviceSecret);
      check(
        'the new device signs in as the same user',
        si.status === 200 && sub(si.body.access_token) === s.userId,
      );
      check('the previous refresh token is revoked', (await refreshWith(s.refresh)).status >= 400);
      let refresh = si.body.refresh_token as string;
      for (let i = 1; i <= 3; i++) {
        const rep = await fn('recover/complete', comp);
        check(
          `identical replay #${i} succeeds with the identifier`,
          rep.status === 200 && rep.body.identifier === s.identifier,
        );
        const rr = await refreshWith(refresh);
        check(
          `after replay #${i} the recovered device's session is STILL valid`,
          rr.status === 200,
          `status ${rr.status}`,
        );
        refresh = rr.body.refresh_token;
      }
      check(
        'a replay with a different device secret is rejected',
        (await fn('recover/complete', { ...comp, deviceSecret: b64url(rnd(32)) })).status === 400,
      );
      check(
        'a replay with a different new key is rejected',
        (
          await fn('recover/complete', {
            ...comp,
            newDigest: recoveryDigest(generateRecoveryKey(rnd)),
          })
        ).status === 400,
      );
      check(
        'the recovered device is still signed in after the rejected replays',
        (await refreshWith(refresh)).status === 200,
      );
      s.secret = comp.deviceSecret;
      save(s);
    }

    if (phase === 'rf3') {
      const s = load();
      const comp = s.comp!;
      const before = await signIn(s.identifier, comp.deviceSecret);
      check('before the interruption fixture the device is signed in', before.status === 200);
      const rep = await fn('recover/complete', comp);
      check(
        'a replay of an UNFINISHED completion succeeds and finishes the work',
        rep.status === 200 && rep.body.identifier === s.identifier,
      );
      const rr = await refreshWith(before.body.refresh_token);
      check(
        'the unfinished-completion replay re-applied the session revocation (the earlier session is gone)',
        rr.status >= 400,
        `status ${rr.status}`,
      );
      const again = await signIn(s.identifier, comp.deviceSecret);
      check(
        'the new device credential still works',
        again.status === 200 && sub(again.body.access_token) === s.userId,
      );
      let refresh = again.body.refresh_token as string;
      for (let i = 1; i <= 2; i++) {
        const rp = await fn('recover/complete', comp);
        check(`afterwards replay #${i} succeeds`, rp.status === 200);
        const r2 = await refreshWith(refresh);
        check(`and leaves the session valid (#${i})`, r2.status === 200, `status ${r2.status}`);
        refresh = r2.body.refresh_token;
      }
      info('rf3 done');
    }
  }, 300_000);
});
