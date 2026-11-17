// READ-ONLY boundary probe of the gamification routes on the STAGING `social` function, through the real HTTPS API. It uses only the PUBLISHABLE key, signs in as nobody,
// creates and changes nothing, and reads no data: it checks that every gamification route refuses callers who are not signed in.
//   STAGING_REF=<staging ref> STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<publishable key> node scripts/staging/gm-boundary-checks.mjs [before|after]
// "before" (default) is informational: run it BEFORE deploying the new `social` function to record how the old one answers. "after" must pass in full.
// The functional checks (what a signed-in person's XP, league and deletion look like) are the 17 social-integration tests locally and the app checklist on staging.
import { assertStagingRef } from './guard.mjs';

export const GM_ROUTES = ['gm/state', 'gm/sync', 'gm/league', 'gm/league/optin'];

export async function runChecks({ baseUrl, publishableKey, phase = 'before', fetchImpl = fetch }) {
  const out = [];
  const record = (name, ok, detail) => out.push({ name, ok, detail });
  const call = async (method, path, { token, body } = {}) => {
    try {
      const r = await fetchImpl(baseUrl + path, {
        method,
        headers: {
          apikey: publishableKey,
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
      return { status: r.status, text: await r.text() };
    } catch {
      return { status: 0, text: '' };
    }
  };
  const after = phase === 'after';
  const texts = [];
  for (const route of GM_ROUTES) {
    const r = await call('POST', `/functions/v1/social/${route}`);
    texts.push(r.text);
    record(
      `G1 ${route} refuses a caller who is not signed in`,
      after ? r.status === 401 : true,
      `status ${r.status}${after ? '' : ' (recorded, not judged before the deploy)'}`,
    );
  }
  const forged = await call('POST', '/functions/v1/social/gm/state', { token: 'abc.def.ghi' });
  texts.push(forged.text);
  record(
    'G2 a forged token is refused on gm/state',
    after ? forged.status === 401 : true,
    `status ${forged.status}`,
  );
  const get = await call('GET', '/functions/v1/social/gm/state');
  texts.push(get.text);
  record('G3 only POST is served', get.status === 405, `status ${get.status}`);
  const all = texts.join('\n');
  record(
    'G4 no key, user id or service identifier appears in these responses',
    !all.includes(publishableKey) && !/user_id|service_role|sb_secret_/.test(all),
    'checked',
  );
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const phase = process.argv[2] === 'after' ? 'after' : 'before';
  const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
  const publishableKey = process.env.STAGING_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey.startsWith('sb_secret_'))
    throw new Error(
      'Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key. Never use a secret or service-role key here.',
    );
  const results = await runChecks({ baseUrl: `https://${ref}.supabase.co`, publishableKey, phase });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed ? `\n${failed} check(s) FAILED. STOP: do not continue.` : '\nAll checks passed.',
  );
  process.exit(failed ? 1 : 0);
}
