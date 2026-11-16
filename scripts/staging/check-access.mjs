// Run by the person who owns the STAGING project, on their own machine. Prints PASS or FAIL for each access boundary and never prints a key.
//   STAGING_REF=<ref> STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<publishable key> node scripts/staging/check-access.mjs db
//   ... same ... node scripts/staging/check-access.mjs function        (after the function is deployed, still in Read only)
// The publishable key is public by design (it ships in the app). Do NOT give this script, or anyone, a secret / service-role key.
import { assertStagingRef } from './guard.mjs';

export async function runChecks({ ref, publishableKey, phase, fetchImpl = fetch }) {
  const base = `https://${ref}.supabase.co`;
  const key = { apikey: publishableKey, authorization: `Bearer ${publishableKey}` };
  const out = [];
  const record = (name, ok, detail) => out.push({ name, ok, detail });
  const call = async (method, path, { headers = {}, body } = {}) => {
    try {
      const r = await fetchImpl(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let text = '';
      try {
        text = await r.text();
      } catch {
        /* ignore */
      }
      return { status: r.status, text };
    } catch {
      return { status: 0, text: '' };
    }
  };
  const refused = (r) => r.status >= 400 && r.status < 500;

  if (phase === 'db') {
    const door = await call('POST', '/rest/v1/rpc/community_rpc', {
      headers: key,
      body: {
        fn: 'community_feed',
        args: { p_viewer: null, p_cursor_at: null, p_cursor_id: null, p_limit: 5 },
      },
    });
    record(
      'B1 the publishable key cannot call the community database door',
      refused(door),
      `status ${door.status}`,
    );
    for (const t of [
      'community_posts',
      'community_members',
      'community_uploads',
      'community_settings',
      'community_reports',
      'community_comments',
    ]) {
      const r = await call('GET', `/rest/v1/${t}?select=*&limit=1`, { headers: key });
      record(`B2 the publishable key cannot read ${t}`, refused(r), `status ${r.status}`);
    }
    const app = await call('POST', '/rest/v1/rpc/community_feed', {
      headers: { ...key, 'Content-Profile': 'app' },
      body: { p_viewer: null, p_cursor_at: null, p_cursor_id: null, p_limit: 5 },
    });
    record('B3 the app schema is not exposed', refused(app), `status ${app.status}`);
    const purge = await call('POST', '/rest/v1/rpc/purge_due_account_deletions', {
      headers: key,
      body: {},
    });
    record(
      'B4 the publishable key cannot run the account-deletion executor',
      refused(purge),
      `status ${purge.status}`,
    );
    const bucket = await call('GET', '/storage/v1/object/community-media/anything.jpg', {
      headers: key,
    });
    record(
      'B5 the photo bucket refuses the publishable key',
      refused(bucket),
      `status ${bucket.status}`,
    );
    const pub = await call('GET', '/storage/v1/object/public/community-media/anything.jpg');
    record('B5b the photo bucket has no public access', refused(pub), `status ${pub.status}`);
    const signup = await call('POST', '/auth/v1/signup', {
      headers: { apikey: publishableKey },
      body: { email: 'staging-check@example.invalid', password: 'x'.repeat(24) },
    });
    record('A3 public sign-up is off', refused(signup), `status ${signup.status}`);
  } else if (phase === 'function') {
    const fn = (route, body, headers = key) =>
      call('POST', `/functions/v1/community/${route}`, { headers, body });
    const st = await fn('status', {});
    let j = {};
    try {
      j = JSON.parse(st.text);
    } catch {
      /* ignore */
    }
    record(
      'C1 a guest can reach the function',
      st.status === 200 && j.ok === true,
      `status ${st.status}`,
    );
    record('C1b it starts in Read only', j.mode === 'read_only', `mode ${j.mode}`);
    record(
      'C1c comments report as disabled',
      j.commentsEnabled === false,
      `commentsEnabled ${j.commentsEnabled}`,
    );
    record(
      'C1d video reports as disabled',
      j.videoEnabled === false,
      `videoEnabled ${j.videoEnabled}`,
    );
    for (const route of [
      'post',
      'comment',
      'upload/ticket',
      'profile',
      'mod/queue',
      'mod/mode',
      'leave',
    ]) {
      const r = await fn(route, {});
      record(
        `C2 ${route} is refused without a member token`,
        r.status === 401,
        `status ${r.status}`,
      );
    }
    const noKey = await call('POST', '/functions/v1/community/feed', { body: {} });
    record(
      'C2b the function does not serve callers with no project key',
      noKey.status !== 500,
      `status ${noKey.status}`,
    );
    const m = await call('POST', '/functions/v1/community/maintenance/prune', {
      headers: key,
      body: {},
    });
    record('C2c maintenance needs its own key', m.status === 403, `status ${m.status}`);
    const g = await call('GET', '/functions/v1/community/status', { headers: key });
    record('C2d only POST is served', g.status === 405, `status ${g.status}`);
    const body = JSON.stringify([st.text, m.text, g.text]);
    record(
      'C3 no key or internal identifier appears in these responses',
      !body.includes(publishableKey) && !/user_id|author_id|service_role/.test(body),
      'checked',
    );
  } else throw new Error('phase must be "db" or "function"');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const phase = process.argv[2];
  const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
  const publishableKey = process.env.STAGING_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey.startsWith('sb_secret_'))
    throw new Error(
      'Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key. Never use a secret or service-role key here.',
    );
  const results = await runChecks({ ref, publishableKey, phase });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed
      ? `\n${failed} check(s) FAILED. STOP: do not continue to the next step.`
      : '\nAll checks passed.',
  );
  process.exit(failed ? 1 : 0);
}
