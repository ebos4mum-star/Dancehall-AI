/**
 * The behaviour every AccountDb must have, written once and run against the in-memory reference (always) and against the real Postgres functions (when a test
 * database is available). Time is injected, so cooling-off and lockouts are tested without waiting. Nothing here touches Supabase.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createAccountCore,
  type AccountDb,
  type AuthAdmin,
  type AccountPolicy,
  type Reply,
} from './account-core';
import { generateRecoveryKey, parseRecoveryKey, recoveryDigest } from './recovery-key';
import { answersProof } from './security-questions';

export interface SuiteEnv {
  db: AccountDb;
  auth: AuthAdmin & {
    users: Map<string, string>;
    failCreate?: boolean;
    failSetSecret?: boolean;
    failDelete?: boolean;
  };
  revoked: string[];
  failRevoke(): void;
}

const FAST = { N: 16, r: 8, p: 1, dkLen: 32 };
let ctr = 0;
const seeded = (): ((n: number) => Uint8Array) => {
  let s = ++ctr * 7919;
  return (n) =>
    Uint8Array.from(
      { length: n },
      () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), (s >>> 16) & 255),
    );
};
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const csprng = (n: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(n));

export function defineAccountSuite(
  label: string,
  makeEnv: () => Promise<SuiteEnv>,
  opts: { policy?: Partial<AccountPolicy> } = {},
): void {
  describe(`account core (${label})`, () => {
    let env: SuiteEnv;
    let clock = 1_000_000_000;
    let ip = 'ip-a';
    const pepper = new Uint8Array(32).fill(7);
    const answers: [{ id: string; answer: string }, { id: string; answer: string }] = [
      { id: 'q-childhood-hero', answer: 'Mama Joyce' },
      { id: 'q-first-pet', answer: "Rex's Pup" },
    ];
    const core = () =>
      createAccountCore({
        db: env.db,
        auth: env.auth,
        random: csprng,
        now: () => clock,
        pepper,
        policy: { staleProvisionMs: 60_000, ...opts.policy },
      });
    const call = (op: string, body: Record<string, unknown>, userId?: string): Promise<Reply> =>
      core().handle(op, body, { ipBucket: ip, ...(userId ? { userId } : {}) });

    async function newAccount(secret = hexOf(csprng(32)) + 'abc', ans = answers) {
      const key = generateRecoveryKey(csprng);
      const digest = recoveryDigest(key);
      const salt = hexOf(csprng(16));
      const proof = await answersProof(ans, salt, FAST);
      const requestId = hexOf(csprng(16));
      const [a, b] = [...ans].sort((x, y) => (x.id < y.id ? -1 : 1));
      const body = {
        requestId,
        deviceSecret: secret.replace(/[^A-Za-z0-9]/g, 'x').padEnd(43, 'x'),
        digest,
        proof,
        salt,
        q1: a!.id,
        q2: b!.id,
      };
      return { key, digest, salt, proof, requestId, body, secret: body.deviceSecret };
    }
    async function recoverTo(key: string, ans = answers, salt?: string) {
      const start = await call('recover/start', { digest: recoveryDigest(key) });
      const b = start.body as { txId: string; salt: string };
      const proof = await answersProof(ans, salt ?? b.salt, FAST);
      const completionSecret = hexOf(csprng(32));
      const verify = await call('recover/verify', { txId: b.txId, proof, completionSecret });
      return { txId: b.txId, proof, completionSecret, verify };
    }

    beforeEach(async () => {
      env = await makeEnv();
      clock = 1_000_000_000;
      ip = 'ip-a';
    });

    describe('provisioning', () => {
      it('creates one account, stores only keyed hashes, and reports the identifier', async () => {
        const a = await newAccount();
        const r = await call('provision', a.body);
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
        expect(String(r.body.identifier)).toMatch(/^u[0-9a-f]{32}@accounts\.dancehall\.invalid$/);
        expect(env.auth.users.size).toBe(1);
        const row = await env.db.accountByDigest('not-the-digest');
        expect(row).toBeNull();
      });
      it('is idempotent: a retry with the same request id returns the same account and creates no duplicate', async () => {
        const a = await newAccount();
        const r1 = await call('provision', a.body);
        const r2 = await call('provision', a.body);
        expect(r2.body.identifier).toBe(r1.body.identifier);
        expect(r2.body.resumed).toBe(true);
        expect(env.auth.users.size).toBe(1);
      });
      it('refuses the same request id with a different device secret (no takeover of an interrupted setup)', async () => {
        const a = await newAccount();
        await call('provision', a.body);
        const r = await call('provision', { ...a.body, deviceSecret: 'z'.repeat(50) });
        expect(r.status).toBe(409);
        expect(env.auth.users.size).toBe(1);
      });
      it('finishes an interrupted provisioning on retry instead of creating a second user', async () => {
        const a = await newAccount();
        const realFinalize = env.db.provisionFinalize.bind(env.db);
        let fail = true;
        env.db.provisionFinalize = async (x) => {
          if (fail) throw new Error('db down');
          return realFinalize(x);
        };
        const r1 = await call('provision', a.body);
        expect(r1.status).toBe(503);
        expect(r1.body.retry).toBe(true);
        fail = false;
        const r2 = await call('provision', a.body);
        expect(r2.status).toBe(200);
        expect(env.auth.users.size).toBe(1);
      });
      it('does not report success when the auth user could not be created', async () => {
        env.auth.failCreate = true;
        const a = await newAccount();
        const r = await call('provision', a.body);
        expect(r.status).toBe(503);
        expect(r.body.ok).toBe(false);
        expect(env.auth.users.size).toBe(0);
        env.auth.failCreate = false;
        expect((await call('provision', a.body)).status).toBe(200);
        expect(env.auth.users.size).toBe(1);
      });
      it('the reaper removes an abandoned half-made account', async () => {
        const a = await newAccount();
        env.db.provisionFinalize = async () => {
          throw new Error('db down');
        };
        await call('provision', a.body);
        expect(env.auth.users.size).toBe(1);
        clock += 120_000;
        expect(await core().reap()).toBe(1);
        expect(env.auth.users.size).toBe(0);
      });
      it('rejects malformed input before touching anything', async () => {
        const a = await newAccount();
        for (const bad of [
          { ...a.body, deviceSecret: 'short' },
          { ...a.body, digest: 'zz' },
          { ...a.body, q1: 'q-first-pet', q2: 'q-first-pet' },
          { ...a.body, q1: 'nope' },
          { ...a.body, requestId: 'x' },
        ]) {
          expect((await call('provision', bad)).status).toBe(400);
        }
        expect(env.auth.users.size).toBe(0);
      });
      it('rate limits provisioning per network bucket', async () => {
        let last = 0;
        for (let i = 0; i < 25; i++)
          last = (await call('provision', { ...(await newAccount()).body })).status;
        expect(last).toBe(429);
      });
    });

    describe('credentials', () => {
      it('recovery keys are 160 bits, checksummed, grouped, and unique', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 500; i++) {
          const k = generateRecoveryKey(csprng);
          expect(k).toHaveLength(36);
          expect(parseRecoveryKey(k)).toBe(k);
          seen.add(k);
        }
        expect(seen.size).toBe(500);
        void seeded;
      });
    });

    describe('recovery', () => {
      async function ready() {
        const a = await newAccount();
        const r = await call('provision', a.body);
        expect(r.status).toBe(200);
        return a;
      }
      it('needs key AND both answers; completes only after the cooling-off; then the old sessions are revoked', async () => {
        const a = await ready();
        const rec = await recoverTo(a.key);
        expect(rec.verify.status).toBe(200);
        expect(rec.verify.body.status).toBe('cooling');
        const newKey = generateRecoveryKey(csprng);
        const newSecret = 'n'.repeat(50);
        const early = await call('recover/complete', {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: newSecret,
          newDigest: recoveryDigest(newKey),
        });
        expect(early.status).toBe(425);
        clock += core().policy.coolingOffMs + 1;
        const done = await call('recover/complete', {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: newSecret,
          newDigest: recoveryDigest(newKey),
        });
        expect(done.status).toBe(200);
        expect(env.revoked).toHaveLength(1);
        const [uid] = [...env.auth.users.keys()];
        expect(env.auth.users.get(uid!)).toBe(newSecret);
        // the OLD key no longer finds the account; the NEW key does, as the same user
        const oldTry = await call('recover/start', { digest: recoveryDigest(a.key) });
        const oldVerify = await call('recover/verify', {
          txId: (oldTry.body as { txId: string }).txId,
          proof: await answersProof(answers, (oldTry.body as { salt: string }).salt, FAST),
          completionSecret: hexOf(csprng(32)),
        });
        expect(oldVerify.status).toBe(400);
        const again = await recoverTo(newKey);
        expect(again.verify.status).toBe(200);
      });
      it('wrong answers fail generically, burn the transaction, and count toward a lockout', async () => {
        const a = await ready();
        const wrong: [{ id: string; answer: string }, { id: string; answer: string }] = [
          answers[0],
          { id: answers[1].id, answer: 'nope' },
        ];
        for (let i = 0; i < core().policy.maxFailures; i++) {
          const r = await recoverTo(a.key, wrong);
          expect(r.verify).toEqual({ status: 400, body: { ok: false, error: 'recovery_failed' } });
          // the burned transaction cannot be retried with the right answers
          const retry = await call('recover/verify', {
            txId: r.txId,
            proof: await answersProof(
              answers,
              (await env.db.accountByDigest(await macFor(a.digest)))!.salt,
              FAST,
            ),
            completionSecret: hexOf(csprng(32)),
          });
          expect(retry.status).toBe(400);
        }
        // locked now: even the right answers fail until the lock ends
        const locked = await recoverTo(a.key);
        expect(locked.verify.status).toBe(400);
        clock += core().policy.lockMs + 1;
        ip = 'ip-b';
        expect((await recoverTo(a.key)).verify.status).toBe(200);
      });
      async function macFor(digest: string): Promise<string> {
        const { hmac } = await import('@noble/hashes/hmac.js');
        const { sha256 } = await import('@noble/hashes/sha2.js');
        const { bytesToHex, utf8ToBytes } = await import('@noble/hashes/utils.js');
        return bytesToHex(hmac(sha256, pepper, utf8ToBytes(`digest:${digest}`)));
      }
      it('answers without the key grant nothing: the account cannot even be found', async () => {
        await ready();
        const r = await recoverTo(generateRecoveryKey(csprng));
        expect(r.verify).toEqual({ status: 400, body: { ok: false, error: 'recovery_failed' } });
      });
      it('a made-up key looks exactly like a real one (decoy questions and salt are stable, same shape)', async () => {
        const a = await ready();
        const fake = recoveryDigest(generateRecoveryKey(csprng));
        const s1 = (await call('recover/start', { digest: fake })).body as Record<string, unknown>;
        const s2 = (await call('recover/start', { digest: fake })).body as Record<string, unknown>;
        const real = (await call('recover/start', { digest: a.digest })).body as Record<
          string,
          unknown
        >;
        expect(s1.questions).toEqual(s2.questions);
        expect(s1.salt).toEqual(s2.salt);
        expect(Object.keys(s1).sort()).toEqual(Object.keys(real).sort());
        expect(String(s1.txId)).toMatch(/^[0-9a-f]{32}$/);
        expect(String(s1.salt)).toHaveLength(32);
        expect(real.questions).toEqual([answers[1].id, answers[0].id].sort());
      });
      it('a completion secret is required and single use (replay fails)', async () => {
        const a = await ready();
        const rec = await recoverTo(a.key);
        clock += core().policy.coolingOffMs + 1;
        const body = {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: 'n'.repeat(50),
          newDigest: recoveryDigest(generateRecoveryKey(csprng)),
        };
        expect(
          (await call('recover/complete', { ...body, completionSecret: hexOf(csprng(32)) })).status,
        ).toBe(400);
        expect((await call('recover/complete', body)).status).toBe(200);
        // A different secret or key on a finished transaction is refused...
        expect(
          (await call('recover/complete', { ...body, deviceSecret: 'q'.repeat(50) })).status,
        ).toBe(400);
        expect(
          (
            await call('recover/complete', {
              ...body,
              newDigest: recoveryDigest(generateRecoveryKey(csprng)),
            })
          ).status,
        ).toBe(400);
        // ...while an identical retry (a lost reply) returns the same success and names the account.
        const again = await call('recover/complete', body);
        expect(again.status).toBe(200);
        expect(String(again.body.identifier)).toContain('@');
        expect(
          (
            await call('recover/verify', {
              txId: rec.txId,
              proof: rec.proof,
              completionSecret: rec.completionSecret,
            })
          ).status,
        ).toBe(400);
      });
      it('concurrent completions: exactly one wins', async () => {
        const a = await ready();
        const rec = await recoverTo(a.key);
        clock += core().policy.coolingOffMs + 1;
        const attempt = (n: string) =>
          call('recover/complete', {
            txId: rec.txId,
            completionSecret: rec.completionSecret,
            deviceSecret: n.repeat(50),
            newDigest: recoveryDigest(generateRecoveryKey(csprng)),
          });
        const results = await Promise.all([attempt('a'), attempt('b'), attempt('c')]);
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      });
      it('concurrent verifies of one transaction: at most one succeeds', async () => {
        const a = await ready();
        const start = (await call('recover/start', { digest: a.digest })).body as {
          txId: string;
          salt: string;
        };
        const proof = await answersProof(answers, start.salt, FAST);
        const rs = await Promise.all(
          [1, 2, 3].map(() =>
            call('recover/verify', {
              txId: start.txId,
              proof,
              completionSecret: hexOf(csprng(32)),
            }),
          ),
        );
        expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
      });
      it('an expired transaction cannot be verified', async () => {
        const a = await ready();
        const start = (await call('recover/start', { digest: a.digest })).body as {
          txId: string;
          salt: string;
        };
        clock += core().policy.txTtlMs + 1;
        const r = await call('recover/verify', {
          txId: start.txId,
          proof: await answersProof(answers, start.salt, FAST),
          completionSecret: hexOf(csprng(32)),
        });
        expect(r.status).toBe(400);
      });
      it('the signed-in owner can see and cancel a pending recovery', async () => {
        const a = await ready();
        const uid = [...env.auth.users.keys()][0]!;
        const rec = await recoverTo(a.key);
        const st = await call('status', {}, uid);
        expect((st.body.pendingRecovery as { readyAt: number }).readyAt).toBeGreaterThan(clock);
        expect((await call('recover/cancel', {}, uid)).body.cancelled).toBe(1);
        clock += core().policy.coolingOffMs + 1;
        const r = await call('recover/complete', {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: 'n'.repeat(50),
          newDigest: recoveryDigest(generateRecoveryKey(csprng)),
        });
        expect(r.status).toBe(400);
        expect((await call('recover/cancel', {})).status).toBe(401);
      });
      it('a failed session revocation leaves recovery retryable and the old key valid', async () => {
        const a = await ready();
        const rec = await recoverTo(a.key);
        clock += core().policy.coolingOffMs + 1;
        env.failRevoke();
        const body = {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: 'n'.repeat(50),
          newDigest: recoveryDigest(generateRecoveryKey(csprng)),
        };
        expect((await call('recover/complete', body)).status).toBe(503);
        expect((await call('recover/start', { digest: a.digest })).status).toBe(200);
        expect((await call('recover/complete', body)).status).toBe(200);
      });
      it('a failed device-secret update also reverts, so nothing is half done', async () => {
        const a = await ready();
        const rec = await recoverTo(a.key);
        clock += core().policy.coolingOffMs + 1;
        env.auth.failSetSecret = true;
        const body = {
          txId: rec.txId,
          completionSecret: rec.completionSecret,
          deviceSecret: 'n'.repeat(50),
          newDigest: recoveryDigest(generateRecoveryKey(csprng)),
        };
        expect((await call('recover/complete', body)).status).toBe(503);
        env.auth.failSetSecret = false;
        expect((await call('recover/complete', body)).status).toBe(200);
      });
      it('rate limits recovery starts per network bucket, independent of whether the key exists', async () => {
        let last = 0;
        for (let i = 0; i < 12; i++)
          last = (
            await call('recover/start', { digest: recoveryDigest(generateRecoveryKey(csprng)) })
          ).status;
        expect(last).toBe(429);
        ip = 'ip-other';
        expect(
          (await call('recover/start', { digest: recoveryDigest(generateRecoveryKey(csprng)) }))
            .status,
        ).toBe(200);
      });
    });

    describe('rotation, status, isolation', () => {
      it('rotation needs the right answers, replaces the key, and the old key stops working', async () => {
        const a = await newAccount();
        await call('provision', a.body);
        const uid = [...env.auth.users.keys()][0]!;
        const newKey = generateRecoveryKey(csprng);
        const bad = await call(
          'rotate',
          {
            proof: await answersProof(
              [answers[0], { id: answers[1].id, answer: 'x y z' }],
              a.salt,
              FAST,
            ),
            newDigest: recoveryDigest(newKey),
          },
          uid,
        );
        expect(bad.status).toBe(403);
        expect(bad.body).toEqual({ ok: false, error: 'answers_incorrect' });
        const ok = await call('rotate', { proof: a.proof, newDigest: recoveryDigest(newKey) }, uid);
        expect(ok.status).toBe(200);
        expect((await recoverTo(a.key)).verify.status).toBe(400);
        ip = 'ip-c';
        expect((await recoverTo(newKey)).verify.status).toBe(200);
        expect(
          (await call('rotate', { proof: a.proof, newDigest: recoveryDigest(newKey) })).status,
        ).toBe(401);
      });
      it('repeated wrong answers on rotation lock it', async () => {
        const a = await newAccount();
        await call('provision', a.body);
        const uid = [...env.auth.users.keys()][0]!;
        const badProof = await answersProof(
          [answers[0], { id: answers[1].id, answer: 'zzz' }],
          a.salt,
          FAST,
        );
        for (let i = 0; i < core().policy.maxFailures; i++)
          await call(
            'rotate',
            { proof: badProof, newDigest: recoveryDigest(generateRecoveryKey(csprng)) },
            uid,
          );
        const r = await call(
          'rotate',
          { proof: a.proof, newDigest: recoveryDigest(generateRecoveryKey(csprng)) },
          uid,
        );
        expect(r.status).toBe(403);
      });
      it('status exposes the questions and salt (not secret) and only for the signed-in user', async () => {
        const a = await newAccount();
        await call('provision', a.body);
        const [u1] = [...env.auth.users.keys()];
        const b = await newAccount(undefined, [
          { id: 'q-family-dish', answer: 'rice and peas' },
          { id: 'q-first-concert', answer: 'sting' },
        ]);
        await call('provision', b.body);
        const s = await call('status', {}, u1!);
        expect(s.body.hasRecovery).toBe(true);
        expect(s.body.salt).toBe(a.salt);
        expect(s.body.questions).toEqual([answers[1].id, answers[0].id].sort());
        const other = await call('status', {}, '00000000-0000-4000-8000-000000000099');
        expect(other.body.hasRecovery).toBe(false);
        expect(other.body.salt).toBeNull();
      });
      it('unknown operations are refused', async () => {
        expect((await call('nope', {})).status).toBe(404);
      });
    });
  });
}
