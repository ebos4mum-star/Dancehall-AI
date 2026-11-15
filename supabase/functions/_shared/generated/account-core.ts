// GENERATED from packages/shared/src/account-core.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
/**
 * The cloud-account state machine, behind two ports (a database and an auth admin) so the SAME logic runs in the Supabase Edge Function, in the local
 * development simulation, and in tests. It never sees a PIN, a Recovery Key or a security answer: the client sends a one-way digest of the key and a slow-hash
 * proof of the answers, and this code stores only keyed hashes (HMAC with a server pepper) of those.
 *
 * Operations: provision (create an account, idempotently), recoverStart / recoverVerify / recoverComplete (lost-phone recovery with a cooling-off),
 * recoverCancel, rotate (new Recovery Key while signed in), status.
 *
 * Every failure on the unauthenticated recovery path returns the SAME generic response whether or not the account exists, and decoy transactions are
 * indistinguishable from real ones.
 */
import { hmac } from 'npm:@noble/hashes@2.4.0/hmac.js';
import { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js';
import { bytesToHex, utf8ToBytes } from 'npm:@noble/hashes@2.4.0/utils.js';
import { QUESTION_IDS, isQuestionId } from './security-questions.ts';

export interface AccountPolicy {
  /** How long a verified recovery must wait before it can be completed, giving a real owner time to notice and cancel. */
  coolingOffMs: number;
  txTtlMs: number;
  /** Wrong-answer attempts (across all transactions for one account) before recovery locks. */
  maxFailures: number;
  lockMs: number;
  ipWindowMs: number;
  ipLimits: { provision: number; start: number; verify: number; complete: number };
  /** A provisioning that has not finished after this long is abandoned and its user is removed. */
  staleProvisionMs: number;
}

export const DEFAULT_POLICY: AccountPolicy = {
  coolingOffMs: 24 * 3600_000,
  txTtlMs: 15 * 60_000,
  maxFailures: 5,
  lockMs: 3600_000,
  ipWindowMs: 3600_000,
  ipLimits: { provision: 20, start: 10, verify: 20, complete: 20 },
  staleProvisionMs: 10 * 60_000,
};

export type ProvisionState = 'created' | 'pending' | 'ready' | 'conflict';
export interface Row {
  userId: string;
  q1: string;
  q2: string;
  salt: string;
}

/** Each method is ONE atomic operation (a single SQL function / a synchronous block), so concurrent callers cannot interleave inside it. */
export interface AccountDb {
  provisionBegin(a: {
    requestId: string;
    secretMac: string;
    now: number;
  }): Promise<{ state: ProvisionState; userId?: string; identifier?: string }>;
  /** Records the created user unless another attempt already did; returns the winning user either way. */
  provisionAttach(requestId: string, userId: string, identifier: string): Promise<{ userId: string; identifier: string }>;
  provisionFinalize(a: {
    requestId: string;
    userId: string;
    digestMac: string;
    q1: string;
    q2: string;
    salt: string;
    proofMac: string;
    now: number;
  }): Promise<'ok' | 'digest_taken' | 'missing'>;
  provisionAbort(requestId: string): Promise<void>;
  stalePending(beforeMs: number): Promise<{ requestId: string; userId: string | null }[]>;
  /** Counts one hit in the bucket's window and returns whether it is still within `limit`. */
  hit(bucket: string, now: number, windowMs: number, limit: number): Promise<boolean>;
  accountByDigest(digestMac: string): Promise<Row | null>;
  txOpen(a: { txId: string; userId: string; now: number; ttlMs: number }): Promise<void>;
  txVerify(a: {
    txId: string;
    proofMac: string;
    completionMac: string;
    now: number;
    cooldownMs: number;
    maxFailures: number;
    lockMs: number;
  }): Promise<{ result: 'cooling' | 'wrong' | 'locked' | 'expired' | 'unknown'; readyAt?: number }>;
  txComplete(a: {
    txId: string;
    completionMac: string;
    newDigestMac: string;
    now: number;
  }): Promise<{ result: 'ok' | 'early' | 'invalid'; userId?: string; readyAt?: number }>;
  /** Undoes a txComplete whose follow-up failed, so the person can try again. */
  txRevert(txId: string): Promise<void>;
  /** Cancels every open recovery for the account (used by the signed-in owner). Returns how many were cancelled. */
  cancelRecoveries(userId: string): Promise<number>;
  rotate(a: {
    userId: string;
    proofMac: string;
    newDigestMac: string;
    now: number;
    maxFailures: number;
    lockMs: number;
  }): Promise<'ok' | 'wrong' | 'locked' | 'missing'>;
  status(
    userId: string,
    now: number,
  ): Promise<{
    hasRecovery: boolean;
    rotatedAt: number | null;
    pendingRecovery: { readyAt: number } | null;
    questions: [string, string] | null;
    salt: string | null;
  }>;
  /** Deletes all of the user's auth sessions and refresh tokens. */
  revokeSessions(userId: string): Promise<void>;
}

export interface AuthAdmin {
  createUser(a: { identifier: string; secret: string }): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  setSecret(userId: string, secret: string): Promise<void>;
}

export interface CoreDeps {
  db: AccountDb;
  auth: AuthAdmin;
  random: (n: number) => Uint8Array;
  now: () => number;
  /** Server-side secret, at least 32 bytes. Never leaves the server. */
  pepper: Uint8Array;
  policy?: Partial<AccountPolicy>;
}

export interface Ctx {
  /** A hashed network bucket for rate limiting (never a raw address). */
  ipBucket: string;
  /** Present only for operations that need a signed-in user; set by the wrapper after verifying the JWT. */
  userId?: string;
}

export type Reply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
export const GENERIC_FAILURE: Reply = reply(400, { ok: false, error: 'recovery_failed' });
const RATE_LIMITED: Reply = reply(429, { ok: false, error: 'rate_limited' });
const INVALID: Reply = reply(400, { ok: false, error: 'invalid_request' });
const UNAUTHENTICATED: Reply = reply(401, { ok: false, error: 'unauthenticated' });

const HEX64 = /^[0-9a-f]{64}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const SECRET = /^[A-Za-z0-9_-]{43,128}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function createAccountCore(deps: CoreDeps) {
  const policy: AccountPolicy = {
    ...DEFAULT_POLICY,
    ...deps.policy,
    ipLimits: { ...DEFAULT_POLICY.ipLimits, ...deps.policy?.ipLimits },
  };
  if (deps.pepper.length < 32) throw new Error('pepper must be at least 32 bytes');
  const { db, auth } = deps;
  const mac = (domain: string, value: string): string =>
    bytesToHex(hmac(sha256, deps.pepper, utf8ToBytes(`${domain}:${value}`)));
  const hex = (n: number): string => bytesToHex(deps.random(n));
  const limited = async (kind: keyof AccountPolicy['ipLimits'], ctx: Ctx): Promise<boolean> =>
    !(await db.hit(
      `${kind}:${ctx.ipBucket}`,
      deps.now(),
      policy.ipWindowMs,
      policy.ipLimits[kind],
    ));

  /** Decoy questions/salt: a pure function of the digest and the pepper, so asking twice gives the same answer, exactly like a real account. */
  function decoyFor(digest: string): { q1: string; q2: string; salt: string } {
    const m = hmac(sha256, deps.pepper, utf8ToBytes(`decoy:${digest}`));
    const i = m[0]! % QUESTION_IDS.length;
    const j = (i + 1 + (m[1]! % (QUESTION_IDS.length - 1))) % QUESTION_IDS.length;
    const [a, b] = [QUESTION_IDS[i]!, QUESTION_IDS[j]!].sort();
    return { q1: a!, q2: b!, salt: bytesToHex(m.subarray(2, 18)) };
  }

  async function provision(input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    const requestId = str(input.requestId);
    const secret = str(input.deviceSecret);
    const digest = str(input.digest);
    const proof = str(input.proof);
    const salt = str(input.salt);
    const [q1, q2] = [str(input.q1), str(input.q2)];
    if (
      !HEX32.test(requestId) ||
      !SECRET.test(secret) ||
      !HEX64.test(digest) ||
      !HEX64.test(proof) ||
      !HEX32.test(salt)
    )
      return INVALID;
    if (!isQuestionId(q1) || !isQuestionId(q2) || q1 >= q2) return INVALID;
    if (await limited('provision', ctx)) return RATE_LIMITED;

    const begin = await db.provisionBegin({
      requestId,
      secretMac: mac('secret', secret),
      now: deps.now(),
    });
    if (begin.state === 'conflict') return reply(409, { ok: false, error: 'request_conflict' });
    if (begin.state === 'ready')
      return reply(200, { ok: true, identifier: begin.identifier, resumed: true });
    if (begin.state === 'pending' && begin.userId) {
      // A previous attempt created the user but did not finish: finish it now rather than create a second account.
      return finishProvision(
        requestId,
        begin.userId,
        begin.identifier!,
        digest,
        q1,
        q2,
        salt,
        proof,
        false,
      );
    }
    const identifier = `u${hex(16)}@accounts.dancehall.invalid`;
    let userId: string;
    let winner: { userId: string; identifier: string };
    try {
      userId = await auth.createUser({ identifier, secret });
    } catch {
      return reply(503, { ok: false, error: 'unavailable', retry: true });
    }
    try {
      winner = await db.provisionAttach(requestId, userId, identifier);
    } catch {
      await auth.deleteUser(userId).catch(() => undefined);
      return reply(503, { ok: false, error: 'unavailable', retry: true });
    }
    // Two simultaneous attempts with one request id both created a user: keep exactly one (they hold the same device secret, so either works).
    if (winner.userId !== userId) await auth.deleteUser(userId).catch(() => undefined);
    return finishProvision(requestId, winner.userId, winner.identifier, digest, q1, q2, salt, proof, true);
  }

  async function finishProvision(
    requestId: string,
    userId: string,
    identifier: string,
    digest: string,
    q1: string,
    q2: string,
    salt: string,
    proof: string,
    fresh: boolean,
  ): Promise<Reply> {
    let fin: 'ok' | 'digest_taken' | 'missing';
    try {
      fin = await db.provisionFinalize({
        requestId,
        userId,
        digestMac: mac('digest', digest),
        q1,
        q2,
        salt,
        proofMac: mac('proof', proof),
        now: deps.now(),
      });
    } catch {
      // Leave it pending: the retry (same requestId) finishes it; the reaper removes it if nobody does.
      return reply(503, { ok: false, error: 'unavailable', retry: true });
    }
    if (fin === 'ok') return reply(200, { ok: true, identifier, resumed: !fresh });
    // The key was already used by another account (cryptographically impossible unless a client reused one): remove ours and tell the client to make a new key.
    await abandon(requestId, userId);
    return reply(409, { ok: false, error: 'key_unavailable' });
  }

  async function abandon(requestId: string, userId: string | null): Promise<void> {
    try {
      if (userId) await auth.deleteUser(userId);
      await db.provisionAbort(requestId);
    } catch {
      /* the reaper retries */
    }
  }

  /** Removes provisioning attempts nobody finished. Run on a schedule. */
  async function reap(): Promise<number> {
    const stale = await db.stalePending(deps.now() - policy.staleProvisionMs);
    for (const s of stale) await abandon(s.requestId, s.userId);
    return stale.length;
  }

  async function recoverStart(input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    const digest = str(input.digest);
    if (!HEX64.test(digest)) return INVALID;
    if (await limited('start', ctx)) return RATE_LIMITED;
    const row = await db.accountByDigest(mac('digest', digest));
    const txId = hex(16);
    let view: { q1: string; q2: string; salt: string };
    if (row) {
      await db.txOpen({ txId, userId: row.userId, now: deps.now(), ttlMs: policy.txTtlMs });
      view = row;
    } else {
      view = decoyFor(digest);
    }
    return reply(200, {
      ok: true,
      txId,
      questions: [view.q1, view.q2],
      salt: view.salt,
      ttlSec: Math.floor(policy.txTtlMs / 1000),
    });
  }

  async function recoverVerify(input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    const [txId, proof, completionSecret] = [
      str(input.txId),
      str(input.proof),
      str(input.completionSecret),
    ];
    if (!HEX32.test(txId) || !HEX64.test(proof) || !HEX64.test(completionSecret)) return INVALID;
    if (await limited('verify', ctx)) return RATE_LIMITED;
    const r = await db.txVerify({
      txId,
      proofMac: mac('proof', proof),
      completionMac: mac('completion', completionSecret),
      now: deps.now(),
      cooldownMs: policy.coolingOffMs,
      maxFailures: policy.maxFailures,
      lockMs: policy.lockMs,
    });
    if (r.result !== 'cooling') return GENERIC_FAILURE;
    return reply(200, { ok: true, status: 'cooling', readyAt: r.readyAt });
  }

  async function recoverComplete(input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    const [txId, completionSecret, newSecret, newDigest] = [
      str(input.txId),
      str(input.completionSecret),
      str(input.deviceSecret),
      str(input.newDigest),
    ];
    if (
      !HEX32.test(txId) ||
      !HEX64.test(completionSecret) ||
      !SECRET.test(newSecret) ||
      !HEX64.test(newDigest)
    )
      return INVALID;
    if (await limited('complete', ctx)) return RATE_LIMITED;
    const done = await db.txComplete({
      txId,
      completionMac: mac('completion', completionSecret),
      newDigestMac: mac('digest', newDigest),
      now: deps.now(),
    });
    if (done.result === 'early')
      return reply(425, { ok: false, error: 'cooling_off', readyAt: done.readyAt });
    if (done.result !== 'ok' || !done.userId) return GENERIC_FAILURE;
    try {
      // Secure default: the new device secret replaces the old one, then EVERY existing session is revoked, so a thief's device is signed out.
      await auth.setSecret(done.userId, newSecret);
      await db.revokeSessions(done.userId);
    } catch {
      await db.txRevert(txId);
      return reply(503, { ok: false, error: 'unavailable', retry: true });
    }
    return reply(200, { ok: true });
  }

  async function recoverCancel(ctx: Ctx): Promise<Reply> {
    if (!ctx.userId) return UNAUTHENTICATED;
    const n = await db.cancelRecoveries(ctx.userId);
    return reply(200, { ok: true, cancelled: n });
  }

  async function rotate(input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    if (!ctx.userId) return UNAUTHENTICATED;
    const [proof, newDigest] = [str(input.proof), str(input.newDigest)];
    if (!HEX64.test(proof) || !HEX64.test(newDigest)) return INVALID;
    const r = await db.rotate({
      userId: ctx.userId,
      proofMac: mac('proof', proof),
      newDigestMac: mac('digest', newDigest),
      now: deps.now(),
      maxFailures: policy.maxFailures,
      lockMs: policy.lockMs,
    });
    if (r === 'ok') return reply(200, { ok: true });
    if (r === 'missing') return reply(404, { ok: false, error: 'no_recovery' });
    return reply(403, { ok: false, error: 'answers_incorrect' });
  }

  async function status(ctx: Ctx): Promise<Reply> {
    if (!ctx.userId) return UNAUTHENTICATED;
    const s = await db.status(ctx.userId, deps.now());
    return reply(200, { ok: true, ...s });
  }

  async function handle(op: string, input: Record<string, unknown>, ctx: Ctx): Promise<Reply> {
    switch (op) {
      case 'provision':
        return provision(input, ctx);
      case 'recover/start':
        return recoverStart(input, ctx);
      case 'recover/verify':
        return recoverVerify(input, ctx);
      case 'recover/complete':
        return recoverComplete(input, ctx);
      case 'recover/cancel':
        return recoverCancel(ctx);
      case 'rotate':
        return rotate(input, ctx);
      case 'status':
        return status(ctx);
      default:
        return reply(404, { ok: false, error: 'unknown_operation' });
    }
  }

  return { handle, reap, policy };
}
export type AccountCore = ReturnType<typeof createAccountCore>;
