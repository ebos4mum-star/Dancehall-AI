/**
 * In-memory AccountDb: the reference implementation of the port's semantics (the SQL in supabase/migrations must behave identically; one shared contract test runs
 * against both). Every method is synchronous inside, so it is atomic by construction. Also backs the local development simulation. NOT a security boundary: it is
 * not a server.
 */
import type { AccountDb, ProvisionState } from './account-core';

export const COMPLETE_WINDOW_MS = 72 * 3600_000;

interface Prov {
  secretMac: string;
  userId: string | null;
  identifier: string | null;
  state: 'pending' | 'ready' | 'failed';
  at: number;
}
interface Acct {
  userId: string;
  digestMac: string;
  q1: string;
  q2: string;
  salt: string;
  proofMac: string;
  fails: number;
  lockedUntil: number;
  rotatedAt: number;
}
interface Tx {
  userId: string;
  expiresAt: number;
  state: 'open' | 'verified' | 'done' | 'cancelled' | 'burned';
  completionMac?: string;
  readyAt?: number;
  prevDigestMac?: string;
}

export interface MemorySnapshot {
  prov: [string, Prov][];
  accts: [string, Acct][];
  txs: [string, Tx][];
  hits: [string, { start: number; n: number }][];
}

export class MemoryAccountDb implements AccountDb {
  private prov = new Map<string, Prov>();
  private accts = new Map<string, Acct>(); // by userId
  private txs = new Map<string, Tx>();
  private hits = new Map<string, { start: number; n: number }>();
  sessionsRevoked: string[] = [];
  /** Test hook: make the next revokeSessions throw. */
  failRevoke = false;

  snapshot(): MemorySnapshot {
    return {
      prov: [...this.prov],
      accts: [...this.accts],
      txs: [...this.txs],
      hits: [...this.hits],
    };
  }
  static restore(s: MemorySnapshot): MemoryAccountDb {
    const d = new MemoryAccountDb();
    d.prov = new Map(s.prov);
    d.accts = new Map(s.accts);
    d.txs = new Map(s.txs);
    d.hits = new Map(s.hits);
    return d;
  }

  async provisionBegin(a: { requestId: string; secretMac: string; now: number }) {
    const p = this.prov.get(a.requestId);
    if (!p || p.state === 'failed') {
      this.prov.set(a.requestId, {
        secretMac: a.secretMac,
        userId: null,
        identifier: null,
        state: 'pending',
        at: a.now,
      });
      return { state: 'created' as ProvisionState };
    }
    if (p.secretMac !== a.secretMac) return { state: 'conflict' as ProvisionState };
    return {
      state: p.state as ProvisionState,
      ...(p.userId ? { userId: p.userId } : {}),
      ...(p.identifier ? { identifier: p.identifier } : {}),
    };
  }
  async provisionAttach(requestId: string, userId: string, identifier: string) {
    const p = this.prov.get(requestId)!;
    if (!p.userId) {
      p.userId = userId;
      p.identifier = identifier;
    }
    return { userId: p.userId!, identifier: p.identifier! };
  }
  async provisionFinalize(a: Parameters<AccountDb['provisionFinalize']>[0]) {
    const p = this.prov.get(a.requestId);
    if (!p || p.userId !== a.userId) return 'missing' as const;
    for (const x of this.accts.values())
      if (x.digestMac === a.digestMac) return 'digest_taken' as const;
    this.accts.set(a.userId, {
      userId: a.userId,
      digestMac: a.digestMac,
      q1: a.q1,
      q2: a.q2,
      salt: a.salt,
      proofMac: a.proofMac,
      fails: 0,
      lockedUntil: 0,
      rotatedAt: a.now,
    });
    p.state = 'ready';
    return 'ok' as const;
  }
  async provisionAbort(requestId: string) {
    const p = this.prov.get(requestId);
    if (p) {
      if (p.userId) this.accts.delete(p.userId);
      p.state = 'failed';
    }
  }
  async stalePending(beforeMs: number) {
    return [...this.prov]
      .filter(([, p]) => p.state === 'pending' && p.at < beforeMs)
      .map(([requestId, p]) => ({ requestId, userId: p.userId }));
  }
  async hit(bucket: string, now: number, windowMs: number, limit: number) {
    const h = this.hits.get(bucket);
    if (!h || now - h.start >= windowMs) {
      this.hits.set(bucket, { start: now, n: 1 });
      return 1 <= limit;
    }
    h.n += 1;
    return h.n <= limit;
  }
  async accountByDigest(digestMac: string) {
    for (const x of this.accts.values())
      if (x.digestMac === digestMac) return { userId: x.userId, q1: x.q1, q2: x.q2, salt: x.salt };
    return null;
  }
  async txOpen(a: { txId: string; userId: string; now: number; ttlMs: number }) {
    this.txs.set(a.txId, { userId: a.userId, expiresAt: a.now + a.ttlMs, state: 'open' });
  }
  async txVerify(a: Parameters<AccountDb['txVerify']>[0]) {
    const t = this.txs.get(a.txId);
    if (!t) return { result: 'unknown' as const };
    const acct = this.accts.get(t.userId);
    if (!acct || t.state !== 'open') return { result: 'unknown' as const };
    if (a.now >= t.expiresAt) {
      t.state = 'burned';
      return { result: 'expired' as const };
    }
    if (a.now < acct.lockedUntil) return { result: 'locked' as const };
    if (acct.proofMac !== a.proofMac) {
      acct.fails += 1;
      t.state = 'burned'; // one guess per transaction: a new one needs the key again
      if (acct.fails >= a.maxFailures) {
        acct.lockedUntil = a.now + a.lockMs;
        acct.fails = 0;
      }
      return { result: 'wrong' as const };
    }
    acct.fails = 0;
    t.state = 'verified';
    t.completionMac = a.completionMac;
    t.readyAt = a.now + a.cooldownMs;
    t.expiresAt = t.readyAt + COMPLETE_WINDOW_MS; // once verified, the transaction lives until the cooling-off ends plus a window to finish
    // Only one recovery may be pending per account: the newest verified one wins, older ones are cancelled.
    for (const [id, o] of this.txs)
      if (id !== a.txId && o.userId === t.userId && (o.state === 'verified' || o.state === 'open'))
        o.state = 'cancelled';
    return { result: 'cooling' as const, readyAt: t.readyAt };
  }
  async txComplete(a: Parameters<AccountDb['txComplete']>[0]) {
    const t = this.txs.get(a.txId);
    if (!t || t.state !== 'verified' || t.completionMac !== a.completionMac)
      return { result: 'invalid' as const };
    if (a.now >= t.expiresAt) return { result: 'invalid' as const };
    if (a.now < t.readyAt!) return { result: 'early' as const, readyAt: t.readyAt! };
    const acct = this.accts.get(t.userId);
    if (!acct) return { result: 'invalid' as const };
    for (const x of this.accts.values())
      if (x.digestMac === a.newDigestMac && x.userId !== t.userId)
        return { result: 'invalid' as const };
    t.prevDigestMac = acct.digestMac;
    acct.digestMac = a.newDigestMac;
    acct.rotatedAt = a.now;
    t.state = 'done';
    return { result: 'ok' as const, userId: t.userId };
  }
  async txRevert(txId: string) {
    const t = this.txs.get(txId);
    const acct = t && this.accts.get(t.userId);
    if (t && acct && t.state === 'done' && t.prevDigestMac) {
      acct.digestMac = t.prevDigestMac;
      t.state = 'verified';
    }
  }
  async cancelRecoveries(userId: string) {
    let n = 0;
    for (const t of this.txs.values()) {
      if (t.userId === userId && (t.state === 'verified' || t.state === 'open')) {
        t.state = 'cancelled';
        n++;
      }
    }
    return n;
  }
  async rotate(a: Parameters<AccountDb['rotate']>[0]) {
    const acct = this.accts.get(a.userId);
    if (!acct) return 'missing' as const;
    if (a.now < acct.lockedUntil) return 'locked' as const;
    if (acct.proofMac !== a.proofMac) {
      acct.fails += 1;
      if (acct.fails >= a.maxFailures) {
        acct.lockedUntil = a.now + a.lockMs;
        acct.fails = 0;
      }
      return 'wrong' as const;
    }
    acct.fails = 0;
    acct.digestMac = a.newDigestMac;
    acct.rotatedAt = a.now;
    return 'ok' as const;
  }
  async status(userId: string, now: number) {
    const acct = this.accts.get(userId);
    let pending: { readyAt: number } | null = null;
    for (const t of this.txs.values())
      if (t.userId === userId && t.state === 'verified') pending = { readyAt: t.readyAt! };
    void now;
    return {
      hasRecovery: !!acct,
      rotatedAt: acct?.rotatedAt ?? null,
      pendingRecovery: pending,
      questions: acct ? ([acct.q1, acct.q2] as [string, string]) : null,
      salt: acct?.salt ?? null,
    };
  }
  async revokeSessions(userId: string) {
    if (this.failRevoke) {
      this.failRevoke = false;
      throw new Error('revoke failed');
    }
    this.sessionsRevoked.push(userId);
  }
}
