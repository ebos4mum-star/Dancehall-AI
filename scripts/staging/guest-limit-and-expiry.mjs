// Hosted STAGING checks that need a real network position or real elapsed time, so they cannot run in the sandbox. READ-ONLY: it only calls the public guest routes
// (`feed`, `status`) and refuses nothing on the server. It changes no data and no settings.
//   STAGING_REF STAGING_CONFIRM STAGING_PUBLISHABLE_KEY            (the publishable key only)
//   Mode "guest-burst": send ~100 guest feed requests from THIS machine and expect rate limiting (HTTP 429) to start. Run it from one ordinary connection;
//                       behind a rotating proxy every request looks like a different address and the limit cannot show.
//   Mode "expired":     EXPIRED_TOKEN_FILE = a file holding a member access token that is more than one hour old (save one, wait, then run). Expects 401 on member routes
//                       and normal guest reading.
// Prints PASS/FAIL lines and never prints a token. Exits non-zero on any failure.
import { readFileSync } from 'node:fs';
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
const mode = process.argv[2];
const url = (route) => `https://${ref}.supabase.co/functions/v1/community/${route}`;
const send = async (route, token, body = {}) => {
  try {
    const r = await fetch(url(route), {
      method: 'POST',
      headers: {
        apikey: key,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return r.status;
  } catch {
    return 0;
  }
};
const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

if (mode === 'guest-burst') {
  const counts = {};
  for (let i = 0; i < 100; i++) {
    const s = await send('feed', null, { limit: 5 });
    counts[s] = (counts[s] ?? 0) + 1;
  }
  console.log('status counts', JSON.stringify(counts));
  record(
    'G1 a guest burst from one address is rate limited',
    (counts[429] ?? 0) >= 8,
    `${counts[429] ?? 0} limited`,
  );
  record(
    'G2 no server errors during the burst',
    !Object.keys(counts).some((k) => k === '0' || Number(k) >= 500),
  );
} else if (mode === 'expired') {
  const token = readFileSync(process.env.EXPIRED_TOKEN_FILE, 'utf8').trim();
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const ageMin = (Date.now() / 1000 - payload.exp) / 60;
  record(
    'E0 the saved token has really expired',
    ageMin > 0,
    `${Math.round(ageMin)} min past expiry`,
  );
  for (const route of ['profile', 'blocked', 'post'])
    record(
      `E1 ${route} refuses the expired token`,
      (await send(route, token, { confirmed: true })) === 401,
    );
  record('E2 the public feed still reads for the same caller', (await send('feed', token)) === 200);
} else {
  throw new Error('Usage: guest-limit-and-expiry.mjs guest-burst | expired');
}
process.exit(results.every(Boolean) ? 0 : 1);
