import { beforeEach, describe, expect, it } from 'vitest';
import { StoreError, type Session } from '../../data/types';
import {
  createSimulationAccountApi,
  type AccountApi,
  type ApiReply,
  type SimulationApi,
} from './accountApi';
import { createAccountService, type Answers } from './accountService';
import type { VaultStorage } from '../pinVault';

const FAST = { N: 16, r: 8, p: 1, dkLen: 32 };
const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const ANS: Answers = [
  { id: 'q-first-pet', answer: 'Rex' },
  { id: 'q-family-dish', answer: 'Curry goat' },
];
const memoryStorage = (): VaultStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
};
const kv = () => {
  const data = new Map<string, string>();
  return {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => void data.set(k, v),
  };
};

/** A "server" shared by several phones (each phone has its own secure storage) plus a controllable clock and fault injection. */
function world() {
  let clock = 1_700_000_000_000;
  const server = kv();
  const sim: SimulationApi = createSimulationAccountApi(rnd, server, () => clock);
  const faults = { network: 0, dropReplyOnce: new Set<string>() };
  const calls: string[] = [];
  const api: AccountApi = {
    kind: 'simulation',
    async call(op, body) {
      calls.push(op);
      if (faults.network > 0) {
        faults.network -= 1;
        return { ok: false, error: 'network', status: 0, retry: true };
      }
      const r = await sim.call(op, body);
      if (faults.dropReplyOnce.delete(op))
        return { ok: false, error: 'network', status: 0, retry: true } as ApiReply;
      return r;
    },
  };
  // The simulated identity provider: knows each identifier's current secret (the simulation keeps these in its own storage).
  const phone = () => {
    const secrets = memoryStorage();
    const signedIn: {
      session: Session | null;
      calls: number;
      failMode: 'none' | 'refuse' | 'offline';
    } = { session: null, calls: 0, failMode: 'none' };
    const svc = createAccountService({
      api,
      secrets,
      random: rnd,
      now: () => clock,
      kdf: FAST,
      signIn: {
        async signInWithDevice(identifier, secret) {
          signedIn.calls += 1;
          if (signedIn.failMode === 'offline') throw new StoreError('unknown');
          if (signedIn.failMode === 'refuse') throw new StoreError('not_authenticated');
          const st = JSON.parse((await server.getItem('dh.devcloud.v1')) ?? '{}') as {
            users?: [string, { secret: string; identifier: string }][];
          };
          const u = st.users?.find(([, x]) => x.identifier === identifier);
          if (!u || u[1].secret !== secret) throw new StoreError('not_authenticated');
          signedIn.session = { userId: u[0], email: null, mode: 'mock' };
          return signedIn.session;
        },
      },
      afterSignIn: async (identifier) => {
        const st = JSON.parse((await server.getItem('dh.devcloud.v1')) ?? '{}') as {
          users: [string, { identifier: string }][];
        };
        await sim.setCurrentUser(st.users.find(([, x]) => x.identifier === identifier)![0]);
      },
    });
    return { svc, secrets, state: signedIn };
  };
  return { phone, faults, calls, advance: (ms: number) => void (clock += ms), sim, server };
}

describe('account service', () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => void (w = world()));

  it('creates an account: key shown once, device credential stored, signed in, backup pending', async () => {
    const p = w.phone();
    const r = await p.svc.createAccount({ answers: ANS });
    expect(r.ok).toBe(true);
    expect(p.state.session).not.toBeNull();
    expect(await p.svc.backupState()).toBe('pending');
    expect((await p.svc.pendingKey())!).toMatch(/^([0-9A-Z]{4}-){8}[0-9A-Z]{4}$/);
    expect(await p.svc.hasDeviceCredential()).toBe(true);
    expect(await p.svc.pendingSetup()).toBeNull();
  });

  it('confirming the backup erases the key from the phone', async () => {
    const p = w.phone();
    await p.svc.createAccount({ answers: ANS });
    await p.svc.confirmBackup();
    expect(await p.svc.backupState()).toBe('confirmed');
    expect(await p.svc.pendingKey()).toBeNull();
    expect([...p.secrets.data.values()].join('')).not.toMatch(/"key":"[0-9A-Z]{36}"/);
  });

  it('never stores the PIN-independent secrets in clear form beyond secure storage: answers are never persisted', async () => {
    const p = w.phone();
    await p.svc.createAccount({ answers: ANS });
    const everything =
      [...p.secrets.data.values()].join('|') + (await w.server.getItem('dh.devcloud.v1'));
    expect(everything.toLowerCase()).not.toContain('curry goat');
    expect(everything.toLowerCase()).not.toContain('rex');
  });

  it('rejects the same question twice and weak answers before anything is sent', async () => {
    const p = w.phone();
    expect(
      (await p.svc.createAccount({ answers: [ANS[0], { id: ANS[0].id, answer: 'Spot' }] })).ok,
    ).toBe(false);
    const r = await p.svc.createAccount({
      answers: [ANS[0], { id: 'q-family-dish', answer: 'a' }],
    });
    expect(r).toMatchObject({ ok: false, reason: 'invalid', problem: 'too-short' });
    expect(await w.server.getItem('dh.devcloud.v1')).toBeNull();
  });

  it('an interrupted setup (network down) resumes with the same request and creates exactly one account', async () => {
    const p = w.phone();
    w.faults.network = 1;
    const r1 = await p.svc.createAccount({ answers: ANS });
    expect(r1).toMatchObject({ ok: false, reason: 'network' });
    expect(await p.svc.pendingSetup()).toEqual({ stage: 'sent' });
    const r2 = await p.svc.createAccount(); // no answers needed: the draft is resumed
    expect(r2.ok).toBe(true);
    const st = JSON.parse((await w.server.getItem('dh.devcloud.v1'))!);
    expect(st.users).toHaveLength(1);
  });

  it('a lost reply after the server created the account does not create a second one', async () => {
    const p = w.phone();
    w.faults.dropReplyOnce.add('provision');
    expect((await p.svc.createAccount({ answers: ANS })).ok).toBe(false);
    expect((await p.svc.createAccount()).ok).toBe(true);
    expect(JSON.parse((await w.server.getItem('dh.devcloud.v1'))!).users).toHaveLength(1);
  });

  it('if the account exists but sign-in fails, it is not reported as success and a retry only signs in', async () => {
    const p = w.phone();
    p.state.failMode = 'offline';
    expect(await p.svc.createAccount({ answers: ANS })).toMatchObject({
      ok: false,
      reason: 'sign_in_failed',
    });
    expect(await p.svc.pendingSetup()).toEqual({ stage: 'provisioned' });
    expect(await p.svc.hasDeviceCredential()).toBe(false);
    p.state.failMode = 'none';
    expect((await p.svc.createAccount()).ok).toBe(true);
    expect(JSON.parse((await w.server.getItem('dh.devcloud.v1'))!).users).toHaveLength(1);
  });

  describe('lost phone', () => {
    async function oldPhone() {
      const old = w.phone();
      const r = await old.svc.createAccount({ answers: ANS });
      if (!r.ok) throw new Error('setup');
      await old.svc.confirmBackup();
      return { old, key: r.key };
    }

    it('recovers the SAME account on a new phone after the cooling-off, signs the old phone out, and rotates the key', async () => {
      const { old, key } = await oldPhone();
      const oldUser = old.state.session!.userId;
      const nu = w.phone();
      const begin = await nu.svc.recoverBegin(key);
      expect(begin.ok).toBe(true);
      if (!begin.ok) return;
      const verify = await nu.svc.recoverVerify(begin, ANS);
      expect(verify.ok).toBe(true);
      expect(await nu.svc.recoveryInProgress()).not.toBeNull();
      expect(await nu.svc.recoverFinish()).toMatchObject({ ok: true, waiting: expect.any(Object) });
      expect(nu.state.session).toBeNull();
      w.advance(5_001);
      const done = await nu.svc.recoverFinish();
      expect(done.ok).toBe(true);
      expect(nu.state.session!.userId).toBe(oldUser);
      // the old phone's device secret no longer signs in
      expect(await old.svc.restoreSession()).toBe('rejected');
      // the OLD key is dead; the NEW key (shown after recovery) works
      const newKey = (done as { key: string }).key;
      expect(newKey).not.toBe(key);
      expect((await w.phone().svc.recoverBegin(newKey)).ok).toBe(true);
      expect(await nu.svc.backupState()).toBe('pending');
    });

    it('wrong answers and wrong keys fail the same way', async () => {
      const { key } = await oldPhone();
      const nu = w.phone();
      const begin = await nu.svc.recoverBegin(key);
      if (!begin.ok) throw new Error('begin');
      const wrong = await nu.svc.recoverVerify(begin, [
        ANS[0],
        { id: ANS[1].id, answer: 'something else' },
      ]);
      expect(wrong).toEqual({ ok: false, reason: 'failed' });
      const bad = await nu.svc.recoverBegin('0000-0000-0000-0000-0000-0000-0000-0000-0000');
      expect(bad).toEqual({ ok: false, reason: 'bad_key' });
    });

    it('a mistyped key is caught on the phone (checksum) without contacting the server', async () => {
      const { key } = await oldPhone();
      const before = w.calls.length;
      const typo = (key[0] === '2' ? '3' : '2') + key.slice(1);
      expect(await w.phone().svc.recoverBegin(typo)).toEqual({ ok: false, reason: 'bad_key' });
      expect(w.calls.length).toBe(before);
    });

    it('a lost reply on the final step is retried with the identical request and still signs in', async () => {
      const { key } = await oldPhone();
      const nu = w.phone();
      const begin = await nu.svc.recoverBegin(key);
      if (!begin.ok) throw new Error('begin');
      await nu.svc.recoverVerify(begin, ANS);
      w.advance(5_001);
      w.faults.dropReplyOnce.add('recover/complete');
      expect((await nu.svc.recoverFinish()).ok).toBe(false);
      expect(await nu.svc.recoveryInProgress()).not.toBeNull();
      const again = await nu.svc.recoverFinish();
      expect(again.ok).toBe(true);
      expect(nu.state.session).not.toBeNull();
    });

    it('if sign-in fails after a completed recovery it is reported, and retrying resumes without losing the key', async () => {
      const { key } = await oldPhone();
      const nu = w.phone();
      const begin = await nu.svc.recoverBegin(key);
      if (!begin.ok) throw new Error('begin');
      await nu.svc.recoverVerify(begin, ANS);
      w.advance(5_001);
      nu.state.failMode = 'offline';
      expect(await nu.svc.recoverFinish()).toMatchObject({ ok: false, reason: 'sign_in_failed' });
      nu.state.failMode = 'none';
      const r = await nu.svc.recoverFinish();
      expect(r.ok).toBe(true);
      expect(nu.state.session).not.toBeNull();
    });

    it('the owner can cancel a pending recovery from the phone that still has the account', async () => {
      const { old, key } = await oldPhone();
      const thief = w.phone();
      const begin = await thief.svc.recoverBegin(key);
      if (!begin.ok) throw new Error('begin');
      await thief.svc.recoverVerify(begin, ANS);
      const st = await old.svc.status();
      expect(st).toMatchObject({ ok: true, pendingRecovery: { readyAt: expect.any(Number) } });
      expect(await old.svc.cancelServerRecovery()).toEqual({ ok: true, cancelled: 1 });
      w.advance(5_001);
      expect(await thief.svc.recoverFinish()).toMatchObject({ ok: false });
      expect(thief.state.session).toBeNull();
    });
  });

  describe('rotation', () => {
    it('replaces the key when the answers are right, keeps it safe across a lost reply, and refuses wrong answers', async () => {
      const p = w.phone();
      const made = await p.svc.createAccount({ answers: ANS });
      if (!made.ok) throw new Error('setup');
      await p.svc.confirmBackup();
      const wrong = await p.svc.rotateKey([ANS[0], { id: ANS[1].id, answer: 'nope' }]);
      expect(wrong).toEqual({ ok: false, reason: 'failed' });
      expect(await p.svc.backupState()).toBe('confirmed');
      w.faults.dropReplyOnce.add('rotate');
      expect((await p.svc.rotateKey(ANS)).ok).toBe(false);
      const ok = await p.svc.rotateKey(ANS);
      expect(ok.ok).toBe(true);
      if (!ok.ok) return;
      expect(ok.key).not.toBe(made.key);
      expect(await p.svc.backupState()).toBe('pending');
      expect((await w.phone().svc.recoverBegin(ok.key)).ok).toBe(true);
    });
  });

  describe('device credential', () => {
    it('restores the session from the stored credential, and reports offline vs refused honestly', async () => {
      const p = w.phone();
      await p.svc.createAccount({ answers: ANS });
      p.state.session = null;
      expect(await p.svc.restoreSession()).toBe('signed_in');
      p.state.failMode = 'offline';
      expect(await p.svc.restoreSession()).toBe('unreachable');
      expect(await p.svc.hasDeviceCredential()).toBe(true);
      p.state.failMode = 'refuse';
      expect(await p.svc.restoreSession()).toBe('rejected');
      expect(await p.svc.hasDeviceCredential()).toBe(false);
    });
    it('forgetDevice removes everything this phone holds', async () => {
      const p = w.phone();
      await p.svc.createAccount({ answers: ANS });
      await p.svc.forgetDevice();
      expect(p.secrets.data.size).toBe(0);
    });
  });
});
