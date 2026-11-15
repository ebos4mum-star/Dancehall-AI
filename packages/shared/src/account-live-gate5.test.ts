/**
 * GATE 5 live verification (two throwaway accounts: isolation, lost-phone recovery, rotation, session revocation, concurrency, restoration of the 24-hour wait).
 * Skipped unless DH_G5=run-gate5-two-throwaway-accounts. Phases (DH_G5_PHASE): setup | recover | final. State (including secrets) lives only in the private file DH_G5_STATE,
 * which the operator deletes afterwards. It refuses any host except https://<DH_LIVE_APPROVED_REF>.supabase.co and never prints a key, secret, token or answer.
 * Run only against the approved development project; the recover phase needs the temporary short cooling-off configuration (see docs/CLOUD_ACCOUNTS_ACTIVATION.md).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { generateRecoveryKey, recoveryDigest } from './recovery-key';
import { answersProof } from './security-questions';

const ref = process.env.DH_LIVE_APPROVED_REF ?? '';
const url = (process.env.DH_LIVE_URL ?? '').replace(/\/+$/, '');
const apikey = process.env.DH_LIVE_PUBLISHABLE_KEY ?? '';
const phase = process.env.DH_G5_PHASE ?? '';
const stateFile = process.env.DH_G5_STATE ?? '';
const on = process.env.DH_G5 === 'run-gate5-two-throwaway-accounts';

type QA = { id: string; answer: string };
interface Acct {
  name: string;
  identifier: string;
  userId: string;
  key: string;
  answers: [QA, QA];
  salt: string;
  secret: string;
  refreshToken: string;
  accessToken: string;
}
interface State {
  A: Acct;
  B: Acct;
  firstCompletion?: {
    txId: string;
    completionSecret: string;
    deviceSecret: string;
    newDigest: string;
  };
}

const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  console.log(results.at(-1));
  expect(ok, name + (detail ? ' ' + detail : '')).toBe(true);
};
const info = (s: string) => console.log('INFO  ' + s);

type R = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function http(u: string, init: RequestInit): Promise<R> {
  const r = await fetch(u, init);
  const t = await r.text();
  let body: any = t; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = JSON.parse(t);
  } catch {
    /* keep text */
  }
  return { status: r.status, body };
}
/** Calls the account function; a 429 comes from a per-network limit before anything is evaluated, so it is retried (this sandbox's address rotates). */
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
  throw new Error(`rate limited too long on ${op}`);
}
const signIn = async (a: { identifier: string }, secret: string) => {
  const r = await http(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey },
    body: JSON.stringify({ email: a.identifier, password: secret }),
  });
  return {
    status: r.status,
    access: r.body?.access_token as string | undefined,
    refresh: r.body?.refresh_token as string | undefined,
  };
};
const refreshWith = (refresh_token: string) =>
  http(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey },
    body: JSON.stringify({ refresh_token }),
  });
const sub = (jwt: string) =>
  (JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;
const rest = (method: string, path: string, token: string, body?: unknown) =>
  http(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey,
      authorization: `Bearer ${token}`,
      prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const proofOf = (a: Acct, answers: [QA, QA], salt = a.salt) => answersProof(answers, salt);
/** A cross-account write counts as stopped when it is refused outright (RLS or a column privilege) or changes zero rows. */
const stopped = (r: R) =>
  r.status === 401 ||
  r.status === 403 ||
  (r.status < 300 && Array.isArray(r.body) && r.body.length === 0);
const wrong = (a: Acct): [QA, QA] => [
  a.answers[0],
  { id: a.answers[1].id, answer: 'wrong-' + hex(rnd(4)) },
];

async function startAndVerify(a: Acct, key: string, answers: [QA, QA]) {
  const s = await fn('recover/start', { digest: recoveryDigest(key) });
  if (s.status !== 200) return { s, v: null as R | null, completionSecret: '' };
  const completionSecret = hex(rnd(32));
  const v = await fn('recover/verify', {
    txId: s.body.txId,
    proof: await proofOf(a, answers, s.body.salt),
    completionSecret,
  });
  return { s, v, completionSecret };
}
const load = (): State => JSON.parse(readFileSync(stateFile, 'utf8')) as State;
const save = (s: State) => {
  writeFileSync(stateFile, JSON.stringify(s), { mode: 0o600 });
  chmodSync(stateFile, 0o600);
};
async function makeAccount(name: string, qs: [string, string]): Promise<Acct> {
  const key = generateRecoveryKey(rnd);
  const salt = hex(rnd(16));
  const answers: [QA, QA] = [
    { id: qs[0], answer: 'syn-' + hex(rnd(5)) },
    { id: qs[1], answer: 'syn-' + hex(rnd(5)) },
  ];
  const secret = b64url(rnd(32));
  const body = {
    requestId: hex(rnd(16)),
    deviceSecret: secret,
    digest: recoveryDigest(key),
    proof: await answersProof(answers, salt),
    salt,
    q1: qs[0],
    q2: qs[1],
  };
  const r = await fn('provision', body);
  check(`provision ${name}`, r.status === 200 && typeof r.body.identifier === 'string');
  const again = await fn('provision', body);
  check(
    `provision ${name} is idempotent`,
    again.status === 200 && again.body.identifier === r.body.identifier,
  );
  const a: Acct = {
    name,
    identifier: r.body.identifier,
    userId: '',
    key,
    answers,
    salt,
    secret,
    refreshToken: '',
    accessToken: '',
  };
  const si = await signIn(a, secret);
  check(
    `sign in ${name} with its device credential`,
    si.status === 200 && !!si.access && !!si.refresh,
  );
  a.accessToken = si.access!;
  a.refreshToken = si.refresh!;
  a.userId = sub(si.access!);
  return a;
}

/** The checks that follow a completed recovery: replays, the identical-retry behaviour, concurrent verifies and completions, a key-only attacker race, and owner cancel. */
/** A key-only attacker racing the owner, then the signed-in owner cancelling a pending recovery. */
async function attackerAndCancel(st: State, A: Acct) {
  // an attacker holding only the key cannot take over concurrently with the owner's real recovery
  const owner = startAndVerify(A, A.key, A.answers);
  const attacker = startAndVerify(A, A.key, wrong(A));
  const [ov, av] = await Promise.all([owner, attacker]);
  check(
    'with the owner and a key-only attacker racing, only the owner verifies',
    ov.v?.status === 200 && av.v?.status === 400,
  );
  // owner cancels from the signed-in session
  const stat = await fn('status', {}, A.accessToken);
  check(
    'the signed-in owner sees the pending recovery',
    stat.status === 200 && !!stat.body.pendingRecovery,
  );
  const canc = await fn('recover/cancel', {}, A.accessToken);
  check('the owner cancels it', canc.status === 200 && canc.body.cancelled >= 1);
  const compCancelled = await fn('recover/complete', {
    txId: ov.s.body.txId,
    completionSecret: ov.completionSecret,
    deviceSecret: b64url(rnd(32)),
    newDigest: recoveryDigest(generateRecoveryKey(rnd)),
  });
  check(
    'a cancelled recovery cannot be completed',
    compCancelled.status === 400 || compCancelled.status === 425,
  );
  save(st);
  info('recover phase done');
}

async function afterCompletion(
  st: State,
  A: Acct,
  comp: { txId: string; completionSecret: string; deviceSecret: string; newDigest: string },
) {
  // replays
  const replayDiffSecret = await fn('recover/complete', {
    ...comp,
    deviceSecret: b64url(rnd(32)),
  });
  check('replay with a different device secret is rejected', replayDiffSecret.status === 400);
  const replayDiffKey = await fn('recover/complete', {
    ...comp,
    newDigest: recoveryDigest(generateRecoveryKey(rnd)),
  });
  check('replay with a different new key is rejected', replayDiffKey.status === 400);
  const replayVerify = await fn('recover/verify', {
    txId: comp.txId,
    proof: await proofOf(A, A.answers),
    completionSecret: hex(rnd(32)),
  });
  check('re-verifying a finished transaction is rejected', replayVerify.status === 400);
  const preReplay = await refreshWith(A.refreshToken);
  info(`new session refresh before identical replay: status ${preReplay.status}`);
  const si2 = await signIn(A, A.secret);
  A.accessToken = si2.access!;
  A.refreshToken = si2.refresh!;
  save(st);
  const replaySame = await fn('recover/complete', comp);
  info(`identical replay (designed as a lost-reply retry): status ${replaySame.status}`);
  const afterReplay = await refreshWith(A.refreshToken);
  info(
    `new session refresh AFTER an identical replay: status ${afterReplay.status} (a non-2xx here means the replay signed the new device out)`,
  );
  const si3 = await signIn(A, A.secret);
  A.accessToken = si3.access!;
  A.refreshToken = si3.refresh!;
  check(
    'after an identical replay the account is still accessible with the same new credential',
    si3.status === 200,
  );
  save(st);

  // concurrent verify on one transaction, then concurrent completions
  const s2 = await fn('recover/start', { digest: recoveryDigest(A.key) });
  const proof2 = await proofOf(A, A.answers, s2.body.salt);
  const cs = [hex(rnd(32)), hex(rnd(32))];
  const vs = await Promise.all(
    cs.map((c) => fn('recover/verify', { txId: s2.body.txId, proof: proof2, completionSecret: c })),
  );
  check(
    'concurrent verifies of one transaction: exactly one succeeds',
    vs.filter((v) => v.status === 200).length === 1,
    vs.map((v) => v.status).join(','),
  );
  const winnerCs = cs[vs.findIndex((v) => v.status === 200)]!;
  const readyAt = vs.find((v) => v.status === 200)!.body.readyAt as number;
  await sleep(Math.max(0, readyAt - Date.now()) + 1500);
  const cands = [0, 1, 2].map(() => ({
    secret: b64url(rnd(32)),
    key: generateRecoveryKey(rnd),
  }));
  const outs = await Promise.all(
    cands.map((c) =>
      fn('recover/complete', {
        txId: s2.body.txId,
        completionSecret: winnerCs,
        deviceSecret: c.secret,
        newDigest: recoveryDigest(c.key),
      }),
    ),
  );
  const winners = outs.map((o, i) => (o.status === 200 ? i : -1)).filter((i) => i >= 0);
  check(
    'three concurrent completions of one transaction: exactly one takes effect',
    winners.length === 1,
    outs.map((o) => o.status).join(','),
  );
  const w = cands[winners[0]!]!;
  const results2 = await Promise.all(cands.map((c) => signIn(A, c.secret)));
  check(
    'only the winning device secret authenticates',
    results2.filter((r) => r.status === 200).length === 1 && results2[winners[0]!]!.status === 200,
  );
  const finalSi = results2[winners[0]!]!;
  A.secret = w.secret;
  A.key = w.key;
  A.accessToken = finalSi.access!;
  A.refreshToken = finalSi.refresh!;
  check('the account is still the same user after the race', sub(A.accessToken) === A.userId);
  save(st);

  await attackerAndCancel(st, A);
}

describe.skipIf(!on)('gate 5 live verification', () => {
  it(`phase: ${phase}`, async () => {
    expect(ref).toMatch(/^[a-z0-9]{20}$/);
    expect(url).toBe(`https://${ref}.supabase.co`);
    expect(apikey.startsWith('sb_publishable_')).toBe(true);
    expect(stateFile.length).toBeGreaterThan(5);

    // ------------------------------------------------------------------------------------------------------------------------------------------------
    if (phase === 'setup') {
      let A: Acct;
      let B: Acct;
      if (existsSync(stateFile)) {
        // Resuming after a harness fix: the two accounts already exist, so sign in again instead of creating more.
        ({ A, B } = load());
        for (const x of [A, B]) {
          const si = await signIn(x, x.secret);
          check(`resume: ${x.name} signs in again`, si.status === 200);
          x.accessToken = si.access!;
          x.refreshToken = si.refresh!;
        }
        save({ A, B });
      } else {
        A = await makeAccount('A', ['q-childhood-hero', 'q-first-pet']);
        B = await makeAccount('B', ['q-family-dish', 'q-first-concert']);
        save({ A, B });
      }
      check('two distinct accounts', A.userId !== B.userId);

      // reads
      const ra = await rest('GET', 'profiles?select=id', A.accessToken);
      const rb = await rest('GET', 'profiles?select=id', B.accessToken);
      check(
        'A reads exactly its own profile',
        JSON.stringify(ra.body) === JSON.stringify([{ id: A.userId }]),
      );
      check(
        'B reads exactly its own profile',
        JSON.stringify(rb.body) === JSON.stringify([{ id: B.userId }]),
      );
      check(
        "A cannot read B's profile",
        (await rest('GET', `profiles?select=id&id=eq.${B.userId}`, A.accessToken)).body?.length ===
          0,
      );
      check(
        "B cannot read A's profile",
        (await rest('GET', `profiles?select=id&id=eq.${A.userId}`, B.accessToken)).body?.length ===
          0,
      );
      // writes to the other account's profile
      const before = await rest(
        'GET',
        `profiles?select=display_name&id=eq.${B.userId}`,
        B.accessToken,
      );
      const ua = await rest('PATCH', `profiles?id=eq.${B.userId}`, A.accessToken, {
        display_name: 'attacker-A',
      });
      check("A cannot modify B's profile", stopped(ua), `status ${ua.status}`);
      const ub = await rest('PATCH', `profiles?id=eq.${A.userId}`, B.accessToken, {
        display_name: 'attacker-B',
      });
      check("B cannot modify A's profile", stopped(ub), `status ${ub.status}`);
      const after = await rest(
        'GET',
        `profiles?select=display_name&id=eq.${B.userId}`,
        B.accessToken,
      );
      check("B's profile is unchanged", JSON.stringify(before.body) === JSON.stringify(after.body));
      // each can write its own data (consent, then a weight entry), the other cannot touch it
      for (const x of [A, B]) {
        const c = await rest('POST', 'consents', x.accessToken, {
          purpose: 'health_data_processing',
          policy_version: 'gate5-test',
          granted: true,
        });
        check(`${x.name} records its own consent`, c.status === 201, `status ${c.status}`);
        const w = await rest('POST', 'weight_entries', x.accessToken, {
          weight_kg: 70 + (x.name === 'A' ? 1 : 2),
          source: 'manual',
          measured_at: new Date().toISOString(),
        });
        check(`${x.name} writes its own weight entry`, w.status === 201, `status ${w.status}`);
      }
      const [wa, wb] = [A, B].map((x) => x);
      const ownA = await rest('GET', 'weight_entries?select=id,weight_kg', wa!.accessToken);
      const ownB = await rest('GET', 'weight_entries?select=id,weight_kg', wb!.accessToken);
      check(
        'A reads only its own weight entry',
        ownA.body.length === 1 && Number(ownA.body[0].weight_kg) === 71,
      );
      check(
        'B reads only its own weight entry',
        ownB.body.length === 1 && Number(ownB.body[0].weight_kg) === 72,
      );
      check(
        "A cannot read B's weight entries",
        (await rest('GET', `weight_entries?select=id&user_id=eq.${B.userId}`, A.accessToken)).body
          .length === 0,
      );
      check(
        "B cannot read A's weight entries",
        (await rest('GET', `weight_entries?select=id&user_id=eq.${A.userId}`, B.accessToken)).body
          .length === 0,
      );
      const insX = await rest('POST', 'weight_entries', A.accessToken, {
        user_id: B.userId,
        weight_kg: 99,
        source: 'manual',
        measured_at: new Date().toISOString(),
      });
      check('A cannot write a weight entry for B', stopped(insX), `status ${insX.status}`);
      const insY = await rest('POST', 'consents', B.accessToken, {
        user_id: A.userId,
        purpose: 'ai_coach_personalization',
        policy_version: 'x',
        granted: true,
      });
      check('B cannot write a consent for A', stopped(insY), `status ${insY.status}`);
      const delA = await rest('DELETE', `weight_entries?user_id=eq.${A.userId}`, B.accessToken);
      check("B cannot delete A's weight entry", stopped(delA), `status ${delA.status}`);
      const updA = await rest('PATCH', `weight_entries?user_id=eq.${A.userId}`, B.accessToken, {
        weight_kg: 33,
      });
      check("B cannot change A's weight entry", stopped(updA), `status ${updA.status}`);
      const stillA = await rest('GET', 'weight_entries?select=weight_kg', A.accessToken);
      check(
        "A's weight entry is intact after every attack",
        stillA.body.length === 1 && Number(stillA.body[0].weight_kg) === 71,
      );
      // private recovery objects
      for (const [who, t] of [
        ['A', A.accessToken],
        ['B', B.accessToken],
        ['anon', apikey],
      ] as const) {
        const d = await http(`${url}/rest/v1/rpc/acct_by_digest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey, authorization: `Bearer ${t}` },
          body: JSON.stringify({ p: { digestMac: 'x' } }),
        });
        check(
          `${who}: direct acct_* function denied`,
          d.status === 401 || d.status === 403 || d.status === 404,
          `status ${d.status}`,
        );
        const tb = await http(`${url}/rest/v1/acct_recovery?select=*`, {
          headers: { apikey, authorization: `Bearer ${t}` },
        });
        check(
          `${who}: recovery table not exposed`,
          tb.status === 404 || tb.status === 401 || tb.status === 403,
          `status ${tb.status}`,
        );
      }
      // protected function actions use the caller's own session, never another's
      const stA = await fn('status', {}, A.accessToken);
      const stB = await fn('status', {}, B.accessToken);
      check(
        "status for A reports A's own questions only",
        stA.status === 200 &&
          JSON.stringify(stA.body.questions) ===
            JSON.stringify(['q-childhood-hero', 'q-first-pet']),
      );
      check(
        "status for B reports B's own questions only",
        stB.status === 200 &&
          JSON.stringify(stB.body.questions) ===
            JSON.stringify(['q-family-dish', 'q-first-concert']),
      );
      info('setup done; accounts saved to the private state file');
    }

    // ------------------------------------------------------------------------------------------------------------------------------------------------
    if (phase === 'recover') {
      const st = load();
      const { A, B } = st;
      const O = {
        oldSecret: A.secret,
        oldRefresh: A.refreshToken,
        oldAccess: A.accessToken,
        oldKey: A.key,
      };

      // wrong answers: generic, same as an unknown key
      const unknown = await startAndVerify(A, generateRecoveryKey(rnd), A.answers);
      const w1 = await startAndVerify(A, A.key, wrong(A));
      check(
        'wrong answers fail with the generic response',
        w1.v?.status === 400 && JSON.stringify(w1.v.body) === JSON.stringify(unknown.v?.body),
      );
      const wB = await startAndVerify(A, A.key, [
        { id: A.answers[0].id, answer: 'nope-' + hex(rnd(3)) },
        A.answers[1],
      ]);
      check('a second wrong attempt also fails (below the lockout)', wB.v?.status === 400);

      // lockout on the bystander account B
      let lastB: R | null = null;
      for (let i = 0; i < 5; i++) lastB = (await startAndVerify(B, B.key, wrong(B))).v;
      check('five wrong answers on B are all refused', lastB?.status === 400);
      const lockedTry = await startAndVerify(B, B.key, B.answers);
      check(
        'B is now locked: even the correct key and answers are refused',
        lockedTry.v?.status === 400 &&
          JSON.stringify(lockedTry.v.body) === JSON.stringify(unknown.v?.body),
      );
      const stillA0 = await startAndVerify(A, A.key, A.answers); // A is not affected by B's lock; this also begins the real recovery
      check(
        "A's recovery is unaffected by B's lock and verifies with the correct key and answers",
        stillA0.v?.status === 200 && stillA0.v.body.status === 'cooling',
      );
      const wait = (stillA0.v!.body.readyAt as number) - Date.now();
      info(`effective cooling-off for this test: ${Math.round(wait / 1000)} s`);
      check(
        'the temporary short cooling-off configuration is in force (between 1 s and 5 min)',
        wait > 1000 && wait < 300_000,
        `${Math.round(wait / 1000)} s`,
      );
      const newKey = generateRecoveryKey(rnd);
      const newSecret = b64url(rnd(32));
      const comp = {
        txId: stillA0.s.body.txId,
        completionSecret: stillA0.completionSecret,
        deviceSecret: newSecret,
        newDigest: recoveryDigest(newKey),
      };
      const early = await fn('recover/complete', comp);
      check(
        'completing before the cooling-off ends is refused (425)',
        early.status === 425,
        `status ${early.status}`,
      );
      const badSecret = await fn('recover/complete', { ...comp, completionSecret: hex(rnd(32)) });
      check(
        'completing with the wrong completion secret is refused',
        badSecret.status === 400 || badSecret.status === 425,
      );
      await sleep(Math.max(0, (stillA0.v!.body.readyAt as number) - Date.now()) + 1500);
      const done = await fn('recover/complete', comp);
      check(
        'recovery completes after the wait with key + answers + completion secret',
        done.status === 200 && done.body.identifier === A.identifier,
      );
      st.firstCompletion = comp;
      save(st);
      // same account, new credential, revoked old sessions
      const si = await signIn(A, newSecret);
      check('the NEW device credential authenticates', si.status === 200 && !!si.access);
      check(
        'the recovered account keeps its ORIGINAL user id',
        !!si.access && sub(si.access) === A.userId,
      );
      check(
        'the OLD device credential no longer authenticates',
        (await signIn(A, O.oldSecret)).status === 400,
      );
      const rr = await refreshWith(O.oldRefresh);
      check(
        'the OLD refresh token is revoked',
        rr.status >= 400 && rr.status < 500,
        `status ${rr.status}`,
      );
      const oldAcc = await rest('GET', 'profiles?select=id', O.oldAccess);
      info(
        `already-issued OLD access token (valid up to 900 s, not instantly revoked): REST status ${oldAcc.status}`,
      );
      const oldAccFn = await fn('status', {}, O.oldAccess);
      info(`already-issued OLD access token on the account function: status ${oldAccFn.status}`);
      A.secret = newSecret;
      A.key = newKey;
      A.accessToken = si.access!;
      A.refreshToken = si.refresh!;
      save(st);
      // previous key dead, replacement key works
      const oldKeyTry = await startAndVerify(A, O.oldKey, A.answers);
      check(
        'the PREVIOUS recovery key is invalid (generic failure)',
        oldKeyTry.v?.status === 400 &&
          JSON.stringify(oldKeyTry.v.body) === JSON.stringify(unknown.v?.body),
      );
      await afterCompletion(st, A, comp);
      info('recover phase done');
    }

    // -------------------------------------------------------------------------
    if (phase === 'recover2') {
      // A fresh recovery cycle on A, then the later checks (used to resume after an interrupted run).
      const st = load();
      const { A } = st;
      const sv = await startAndVerify(A, A.key, A.answers);
      check('A verifies with its current key and answers', sv.v?.status === 200);
      const wait = (sv.v!.body.readyAt as number) - Date.now();
      check(
        'the temporary short cooling-off configuration is still in force',
        wait > 1000 && wait < 300_000,
        `${Math.round(wait / 1000)} s`,
      );
      const newKey = generateRecoveryKey(rnd);
      const newSecret = b64url(rnd(32));
      const comp = {
        txId: sv.s.body.txId,
        completionSecret: sv.completionSecret,
        deviceSecret: newSecret,
        newDigest: recoveryDigest(newKey),
      };
      await sleep(Math.max(0, (sv.v!.body.readyAt as number) - Date.now()) + 1500);
      const done = await fn('recover/complete', comp);
      check(
        'recovery completes again after the wait',
        done.status === 200 && done.body.identifier === A.identifier,
      );
      A.secret = newSecret;
      A.key = newKey;
      const si = await signIn(A, newSecret);
      A.accessToken = si.access!;
      A.refreshToken = si.refresh!;
      check(
        'the recovered account keeps its original user id',
        si.status === 200 && sub(si.access!) === A.userId,
      );
      st.firstCompletion = comp;
      save(st);
      await afterCompletion(st, A, comp);
      info('recover2 phase done');
    }

    // -------------------------------------------------------------------------
    if (phase === 'recover3') {
      const st = load();
      const si = await signIn(st.A, st.A.secret);
      check(
        'A authenticates with its saved credential',
        si.status === 200 && sub(si.access!) === st.A.userId,
      );
      st.A.accessToken = si.access!;
      st.A.refreshToken = si.refresh!;
      await attackerAndCancel(st, st.A);
      info('recover3 phase done');
    }

    // ------------------------------------------------------------------------------------------------------------------------------------------------
    if (phase === 'final') {
      const st = load();
      const { A } = st;
      const si = await signIn(A, A.secret);
      check(
        'A still authenticates with its latest device credential',
        si.status === 200 && sub(si.access!) === A.userId,
      );
      const sv = await startAndVerify(A, A.key, A.answers);
      const wait = (sv.v!.body.readyAt as number) - Date.now();
      info(`effective cooling-off after restoration: ${(wait / 3600_000).toFixed(2)} hours`);
      check(
        'the effective waiting period is back to 24 hours',
        wait > 23.9 * 3600_000 && wait <= 24.01 * 3600_000,
      );
      const early = await fn('recover/complete', {
        txId: sv.s.body.txId,
        completionSecret: sv.completionSecret,
        deviceSecret: b64url(rnd(32)),
        newDigest: recoveryDigest(generateRecoveryKey(rnd)),
      });
      check('completing right away is refused again (425)', early.status === 425);
      const canc = await fn('recover/cancel', {}, si.access!);
      check('the test recovery is cancelled', canc.status === 200);
    }
    console.log('\n' + results.join('\n'));
  }, 900_000);
});
