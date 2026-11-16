// Moderator second-factor checks through the real STAGING API, with THROWAWAY synthetic accounts only. Secrets come from the environment and are never printed.
//   STAGING_REF STAGING_CONFIRM STAGING_PUBLISHABLE_KEY, STAGING_MOD_EMAIL/STAGING_MOD_PASSWORD (a staff moderator), STAGING_MEMBER_EMAIL/STAGING_MEMBER_PASSWORD (not staff)
// Enrols a TOTP factor on each account, so use accounts made only for this test.
import { createHmac } from 'node:crypto';
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
const base = `https://${ref}.supabase.co`;
const results = [];
const record = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
};
async function call(path, { token, body } = {}) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: {
      apikey: key,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* none */
  }
  return { status: r.status, j };
}
const b32 = (s) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase())
    bits += A.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
};
const totp = (secret) => {
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', b32(secret)).update(ctr).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};
async function signIn(email, password) {
  const r = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
  return r.j?.access_token ?? null;
}
async function toAal2(token) {
  const en = await call('/auth/v1/factors', {
    token,
    body: { factor_type: 'totp', friendly_name: 'staging-test', issuer: 'staging-test' },
  });
  const secret = en.j?.totp?.secret;
  if (!en.j?.id || !secret) return null;
  const ch = await call(`/auth/v1/factors/${en.j.id}/challenge`, { token });
  const v = await call(`/auth/v1/factors/${en.j.id}/verify`, {
    token,
    body: { challenge_id: ch.j?.id, code: totp(secret) },
  });
  return v.j?.access_token ?? null;
}
const fn = (route, body, token) => call(`/functions/v1/community/${route}`, { token, body });
const jwtAal = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).aal;

for (const [label, e, p, staff] of [
  ['moderator', process.env.STAGING_MOD_EMAIL, process.env.STAGING_MOD_PASSWORD, true],
  [
    'non-staff member',
    process.env.STAGING_MEMBER_EMAIL,
    process.env.STAGING_MEMBER_PASSWORD,
    false,
  ],
]) {
  if (!e || !p) throw new Error(`Set the ${label} email and password variables.`);
  const t1 = await signIn(e, p);
  if (!t1) {
    console.log(`Could not sign in the ${label}.`);
    process.exit(2);
  }
  record(`K ${label}: password-only token is aal1`, jwtAal(t1) === 'aal1', jwtAal(t1));
  const q1 = await fn('mod/queue', {}, t1);
  record(
    `K1 ${label}: mod/queue is refused WITHOUT a second factor`,
    q1.status === 401 || q1.status === 403,
    `status ${q1.status}`,
  );
  const m1 = await fn('mod/mode', { mode: 'open', note: 'x' }, t1);
  record(
    `K1b ${label}: mod/mode is refused WITHOUT a second factor (mode not changed)`,
    m1.status === 401 || m1.status === 403,
    `status ${m1.status}`,
  );
  const t2 = await toAal2(t1);
  if (!t2) {
    record(`K2 ${label}: second factor could be enrolled`, false, 'enrol failed');
    continue;
  }
  record(`K2 ${label}: second-factor token is aal2`, jwtAal(t2) === 'aal2', jwtAal(t2));
  const q2 = await fn('mod/queue', {}, t2);
  const flat = JSON.stringify(q2.j ?? {});
  if (staff) {
    record('K3 moderator at aal2 can read the queue', q2.status === 200, `status ${q2.status}`);
    record(
      'K3b the queue exposes no account id or email',
      !/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-0000000000c[0-9]/i.test(flat) &&
        !/@/.test(flat),
      'scanned',
    );
    const old = await fn('mod/queue', {}, t1);
    record(
      'K4 the earlier password-only token is STILL refused',
      old.status === 401 || old.status === 403,
      `status ${old.status}`,
    );
  } else {
    record(
      'K5 a non-staff member is refused even at aal2',
      q2.status === 401 || q2.status === 403,
      `status ${q2.status}`,
    );
  }
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) FAILED. STOP.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
