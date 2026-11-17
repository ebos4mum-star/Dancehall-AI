// Signed-in checks against the STAGING Community function, run on the owner's machine (this sandbox cannot reach the API).
// Needs two throwaway STAGING test members created in the Supabase dashboard (Auth > Add user, auto-confirm). Secrets come from the environment only and are never printed.
//   STAGING_REF=<staging ref> STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=... \
//   STAGING_MEMBER_EMAIL=... STAGING_MEMBER_PASSWORD=... node scripts/staging/member-checks.mjs
// The project is in Read only mode: every write must be refused. Stops with a non-zero exit if anything that should be refused is accepted.
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
const email = process.env.STAGING_MEMBER_EMAIL;
const password = process.env.STAGING_MEMBER_PASSWORD;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
if (!email || !password)
  throw new Error(
    'Set STAGING_MEMBER_EMAIL and STAGING_MEMBER_PASSWORD (a throwaway staging member).',
  );
const base = `https://${ref}.supabase.co`;
const SEED_POST = '00000000-0000-4000-8000-0000000000b1';
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
};
async function call(path, { method = 'POST', token, body, headers = {} } = {}) {
  try {
    const r = await fetch(base + path, {
      method,
      headers: {
        apikey: key,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* not json */
    }
    return { status: r.status, j };
  } catch {
    return { status: 0, j: null };
  }
}
const fn = (route, body, token) => call(`/functions/v1/community/${route}`, { token, body });
const signIn = async () => {
  const r = await call('/auth/v1/token?grant_type=password', { body: { email, password } });
  return r.j?.access_token ? { token: r.j.access_token, refresh: r.j.refresh_token } : null;
};

const s = await signIn();
if (!s) {
  console.log('Could not sign in the test member. Check the email and password (not printed).');
  process.exit(2);
}

// D: guests
const feed = await fn('feed', { limit: 10 });
record(
  'D1 a guest can browse approved posts',
  feed.status === 200 && JSON.stringify(feed.j).includes('Synthetic staging post'),
  `status ${feed.status}`,
);
record(
  'D1b the feed exposes no account id or email',
  !/(user_?id|author_?id|email|@)/i.test(JSON.stringify(feed.j ?? {})),
  'scanned body',
);
const gp = await fn('post', { type: 'text', body: 'guest post', confirmed: true });
record(
  'D2 a guest cannot post (refused before anything is written)',
  gp.status === 401 || gp.status === 503,
  `status ${gp.status}`,
);

// E: members while Read only
const mp = await fn(
  'post',
  { type: 'text', body: 'member post in read only', confirmed: true },
  s.token,
);
record('E1 a signed-in member cannot post in Read only', mp.status === 503, `status ${mp.status}`);
const mc = await fn('comment', { postId: SEED_POST, body: 'hi' }, s.token);
record('E2 comments are refused', [403, 404, 503].includes(mc.status), `status ${mc.status}`);
const up = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, s.token);
record(
  'E3 photo uploads are refused',
  (up.status >= 400 && up.status < 500) || up.status === 503,
  `status ${up.status}`,
);
const vid = await fn('upload/ticket', { kind: 'video', mime: 'video/mp4' }, s.token);
record('E4 video uploads are refused', vid.status >= 400, `status ${vid.status}`);

// F: tokens
const junk = await fn('profile', {}, 'not-a-token');
record('F1 a garbage token is refused', junk.status === 401, `status ${junk.status}`);
const forged = await fn('profile', {}, s.token.split('.').slice(0, 2).join('.') + '.AAAA');
record(
  'F2 a token with a forged signature is refused',
  forged.status === 401,
  `status ${forged.status}`,
);
const mod = await fn('mod/queue', {}, s.token);
record(
  'F3 a member cannot reach moderator routes',
  mod.status === 401 || mod.status === 403,
  `status ${mod.status}`,
);
const modMode = await fn('mod/mode', { mode: 'open' }, s.token);
record(
  'F3b a member cannot change the mode',
  modMode.status === 401 || modMode.status === 403,
  `status ${modMode.status}`,
);
const ok1 = await fn('profile', {}, s.token);
record(
  'F4 the valid token is accepted',
  ok1.status === 200 || ok1.status === 404,
  `status ${ok1.status}`,
);
await call('/auth/v1/logout?scope=global', { token: s.token });
const revoked = await fn('profile', {}, s.token);
record(
  'F5 a token from a signed-out (revoked) session is refused',
  revoked.status === 401,
  `status ${revoked.status}`,
);
console.log(
  'NOTE F6 (expired token) cannot be forced from here: re-run this script after the 1-hour expiry with a saved old token, or trust F1/F5 which use the same verification.',
);

// G: reporting and blocking (sign in again)
const s2 = await signIn();
const rep = await fn('report', { type: 'post', targetId: SEED_POST, reason: 'spam' }, s2.token);
record('G1 a member can report a post', rep.status === 200, `status ${rep.status}`);
const rep2 = await fn('report', { type: 'post', targetId: SEED_POST, reason: 'spam' }, s2.token);
record(
  'G1b a repeat report looks identical (no probing)',
  rep2.status === rep.status,
  `status ${rep2.status}`,
);
const blk = await fn('block', { username: 'staging_seed' }, s2.token);
record(
  'G2 a member can block a member',
  blk.status === 200 || blk.status === 503,
  `status ${blk.status}`,
);
const unb = await fn('unblock', { username: 'staging_seed' }, s2.token);
record('G2b and unblock', unb.status === 200 || unb.status === 503, `status ${unb.status}`);

// H: errors, size, method
const bad = await call('/functions/v1/community/feed', { body: '{not json' });
record('H1 malformed JSON gives 400, not 500', bad.status === 400, `status ${bad.status}`);
const big = await call('/functions/v1/community/feed', {
  body: JSON.stringify({ x: 'a'.repeat(40000) }),
});
record('H2 an oversized body gives 413', big.status === 413, `status ${big.status}`);
const unk = await fn('does/not/exist', {});
record(
  'H3 an unknown route gives a clean 4xx',
  unk.status >= 400 && unk.status < 500,
  `status ${unk.status}`,
);

// I: rate limits and concurrency (members are limited per account. Guests are limited per network address: from a rotating egress network the guest limit cannot be exercised, run a guest burst from one machine.)
const burst = await Promise.all(
  Array.from({ length: 150 }, () => fn('feed', { limit: 5 }, s2.token)),
);
const codes = burst.map((r) => r.status);
record(
  'I1 a burst of 150 member reads never causes a server error',
  codes.every((c) => c === 200 || c === 429),
  [...new Set(codes)].join(','),
);
record(
  'I2 the burst was rate limited (some 429; the read limit is 90 a minute)',
  codes.includes(429),
  `${codes.filter((c) => c === 429).length} of 150 limited`,
);
const wburst = await Promise.all(
  Array.from({ length: 30 }, () =>
    fn('post', { type: 'text', body: 'x', confirmed: true }, s2.token),
  ),
);
const wc = wburst.map((r) => r.status);
record(
  'I3 30 parallel writes are all refused (never 200) and never 500',
  wc.every((c) => c === 503 || c === 429),
  [...new Set(wc)].join(','),
);

const rburst = await Promise.all(
  Array.from({ length: 25 }, () =>
    fn('report', { type: 'post', targetId: SEED_POST, reason: 'spam' }, s2.token),
  ),
);
const rc = rburst.map((r) => r.status);
record(
  'I4 a burst of 25 reports is rate limited (limit 10 a minute) and never errors',
  rc.every((c) => c === 200 || c === 429) && rc.includes(429),
  [...new Set(rc)].join(','),
);

// J: account deletion through the real API (request only; the 30-day wait is provisional, nothing is purged)
const del = await call('/rest/v1/rpc/request_account_deletion', { token: s2.token, body: {} });
record(
  'J1 a member can request deletion through the API',
  del.status === 200 || del.status === 204,
  `status ${del.status}`,
);
const anon = await call('/rest/v1/rpc/purge_due_account_deletions', { body: {} });
record('J2 nobody but the server can run the purge', anon.status >= 400, `status ${anon.status}`);

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed ? `\n${failed} check(s) FAILED. STOP and send me this output.` : '\nAll checks passed.',
);
process.exit(failed ? 1 : 0);
