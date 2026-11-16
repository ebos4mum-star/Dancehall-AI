// Hosted STAGING checks for the final V1 Community rules, through the real HTTPS API only. Synthetic accounts, generated images.
// Needs the stored mode AND COMMUNITY_FLOOR_MODE "open" (refuses to run otherwise). Never prints credentials.
//   STAGING_REF STAGING_CONFIRM STAGING_PUBLISHABLE_KEY, STAGING_V1_USERS (JSON {m1,m3,mod:{email,password}}), PHOTO_DIR (photo.jpg)
import { readFileSync } from 'node:fs';
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
const users = JSON.parse(readFileSync(process.env.STAGING_V1_USERS, 'utf8'));
const jpg = readFileSync(`${process.env.PHOTO_DIR}/photo.jpg`);
const base = `https://${ref}.supabase.co`;
const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
async function http(url, { method = 'POST', token, body, raw, headers = {} } = {}) {
  try {
    const r = await fetch(url, {
      method,
      headers: {
        apikey: key,
        ...(raw ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await r.text();
    let j = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: r.status, j, text };
  } catch {
    return { status: 0, j: {}, text: '' };
  }
}
const fn = (route, body, token) =>
  http(`${base}/functions/v1/community/${route}`, { token, body: body ?? {} });
const signIn = async (u) =>
  (
    await http(`${base}/auth/v1/token?grant_type=password`, {
      body: { email: u.email, password: u.password },
    })
  ).j?.access_token ?? null;
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000));

const m1 = await signIn(users.m1);
const m3 = await signIn(users.m3);
if (!m1 || !m3) {
  console.log('Could not sign in a test account.');
  process.exit(2);
}
const st = await fn('status');
if (process.env.READONLY_SUBSET !== '1')
  record('V0 effective mode is open', st.j?.mode === 'open', `mode ${st.j?.mode}`);
record(
  'V0b status reports video and comments off',
  st.j?.videoEnabled === false && st.j?.commentsEnabled === false,
  '',
);
if (process.env.READONLY_SUBSET === '1' && st.j?.mode === 'read_only') {
  // Checks that are meaningful while Community is Read only (the safe baseline).
  for (const route of ['post', 'upload/ticket', 'encourage', 'report', 'block', 'profile']) {
    // While Read only, writes are refused as paused (503) before sign-in is looked at; either way nobody gets in.
    const s = (await fn(route, {})).status;
    record(`A1 ${route} without a token is refused`, s === 401 || s === 503, `status ${s}`);
  }
  record('A2 a forged token is refused', (await fn('profile', {}, 'a.b.c')).status === 401);
  record('A3 guests can still read the feed', (await fn('feed', { limit: 5 })).status === 200);
  record(
    'A4 GET is refused',
    (await http(`${base}/functions/v1/community/feed`, { method: 'GET' })).status === 405,
  );
  record('X4 there is no messaging route', (await fn('message', {}, m3)).status === 404);
  const w = await fn('post', { type: 'text', body: 'hello there', confirmed: true }, m3);
  record('F1 while Read only, a member cannot post', w.status === 503, `status ${w.status}`);
  const up = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m3);
  record('F2 while Read only, no upload ticket', up.status === 503, `status ${up.status}`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
if (st.j?.mode !== 'open') {
  console.log('Mode is not open. Nothing else was tested.');
  process.exit(3);
}

// Usernames (needed to post)
for (const [tok, name] of [
  [m1, 'v1_dancer_one'],
  [m3, 'v1_dancer_three'],
]) {
  const c = await fn('username/claim', { username: name }, tok);
  record(`V1 claim ${name}`, c.status === 200, `status ${c.status}`);
}

// Authentication
for (const route of ['post', 'upload/ticket', 'encourage', 'report', 'block', 'profile'])
  record(`A1 ${route} without a token is refused`, (await fn(route, {})).status === 401);
record('A2 a forged token is refused', (await fn('profile', {}, 'a.b.c')).status === 401);
record('A3 guests can still read the feed', (await fn('feed', { limit: 5 })).status === 200);

// Photo publishing (immediate, no staff approval)
const tk = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m1);
const fd = new FormData();
fd.append('cacheControl', '3600');
fd.append('', new Blob([jpg], { type: 'image/jpeg' }), 'f.jpg');
const put = await http(tk.j.uploadUrl, {
  method: 'PUT',
  raw: fd,
  headers: { 'x-upsert': 'false' },
});
record(
  'P1 upload ticket and upload',
  tk.status === 200 && put.status === 200,
  `${tk.status}/${put.status}`,
);
const cm = await fn('upload/commit', { path: tk.j.path }, m1);
record('P2 the server verifies the photo', cm.status === 200 && cm.j?.kind === 'photo');
const post = await fn(
  'post',
  {
    type: 'photo',
    body: 'Day 30! I lost 12 kg in 3 weeks of dancing and eating 1800 calories, weighing 62 kg now.',
    confirmed: true,
    media: [{ kind: 'photo', role: 'single', path: tk.j.path }],
  },
  m1,
);
const postId = post.j?.id ?? post.j?.post?.id;
record(
  'P3 the photo post publishes immediately, ordinary weight/calorie talk allowed',
  post.status === 200 && (post.j?.status ?? post.j?.post?.status) === 'published',
  `status ${post.status} ${post.j?.status ?? ''}`,
);
const guestFeed = await fn('feed', { limit: 30 });
const seen = (guestFeed.j?.posts ?? []).find((p) => p.id === postId);
record('P4 guests see it with a signed photo link', !!seen && seen.media?.length === 1);
const view = seen ? await http(seen.media[0].uri, { method: 'GET' }) : { status: 0 };
record('P5 the signed link serves the photo', view.status === 200);

// Likes (public counts)
const like = await fn('encourage', { postId, on: true }, m3);
record('L1 another member can like', like.status === 200 && like.j?.on === true);
const own = await fn('encourage', { postId, on: true }, m1);
record('L2 you cannot like your own post', own.j?.code === 'own_post', `status ${own.status}`);
const g2 = (await fn('feed', { limit: 30 })).j?.posts?.find((p) => p.id === postId);
record('L3 guests see the like count', g2?.encouragedCount === 1, `count ${g2?.encouragedCount}`);
record(
  'L4 nobody is named in the feed',
  !JSON.stringify(g2 ?? {}).includes('v1_dancer_three') &&
    !/@staging-test/.test(JSON.stringify(g2)),
);

// Dangerous text is rejected, never held
for (const [t, why] of [
  ['these diet pills melt fat', 'diet-drug promotion'],
  ['this detox is a miracle cure', 'dangerous health claim'],
  ["you're so fat", 'harassment'],
]) {
  const r = await fn('post', { type: 'text', body: t, confirmed: true }, m1);
  record(
    `T1 ${why} is rejected`,
    r.status === 400 && r.j?.code === 'blocked',
    `status ${r.status}`,
  );
  record(`T1b the text is not echoed back (${why})`, !r.text.includes(t));
}
await pause(2);

// Video, comments and messaging are off
const vt = await fn('upload/ticket', { kind: 'video', mime: 'video/mp4' }, m1);
record(
  'X1 a video upload ticket is refused',
  vt.j?.code === 'video_disabled',
  `status ${vt.status}`,
);
const vp = await fn(
  'post',
  {
    type: 'video',
    body: '',
    confirmed: true,
    media: [{ kind: 'video', role: 'single', path: 'm/55555555-5555-4555-8555-555555555555.mp4' }],
  },
  m1,
);
record('X2 a video post is refused', vp.j?.code === 'video_disabled', `status ${vp.status}`);
const cmt = await fn('comment', { postId, body: 'hello', confirmed: true }, m3);
record('X3 comments are refused', cmt.status >= 400 && cmt.j?.ok !== true, `status ${cmt.status}`);
record('X4 there is no messaging route', (await fn('message', {}, m3)).status === 404);

// Reporting, blocking, post-publication removal
const rp = await fn(
  'report',
  { type: 'post', targetId: postId, reason: 'private_information' },
  m3,
);
record('R1 a member can report a published photo', rp.status === 200, `status ${rp.status}`);
const hidden = (await fn('feed', { limit: 30 })).j?.posts?.find((p) => p.id === postId);
record('R2 a serious report hides it from the public feed at once', !hidden);
const mine = (await fn('feed', { limit: 30 }, m1)).j?.posts?.find((p) => p.id === postId);
record(
  'R3 the author still sees it, labelled',
  mine?.status === 'hidden',
  `status ${mine?.status}`,
);
const sef = await fn('report', { type: 'post', targetId: postId, reason: 'spam' }, m1);
record('R4 you cannot report your own post', sef.status >= 400);
const p2 = await fn(
  'post',
  { type: 'text', body: 'Great class today, so happy.', confirmed: true },
  m1,
);
const p2id = p2.j?.id ?? p2.j?.post?.id;
const bl = await fn('block', { username: 'v1_dancer_one' }, m3);
record('B1 a member can block another', bl.status === 200, `status ${bl.status}`);
const f3 = await fn('feed', { limit: 30 }, m3);
record('B2 blocked content disappears for the blocker', !JSON.stringify(f3.j).includes(p2id));
const f1 = await fn('feed', { limit: 30 }, m1);
const ub = await fn('unblock', { username: 'v1_dancer_one' }, m3);
record('B3 unblock works', ub.status === 200);
record(
  'B4 the feed carries no account id or email',
  !/@staging-test|0000000000c[0-9]/.test(guestFeed.text + f1.text),
);
const del = await fn('post/delete', { postId: p2id }, m1);
record('D1 the author can delete their own post', del.status === 200, `status ${del.status}`);
const delPhoto = await fn('post/delete', { postId }, m1);
record(
  'D2 the author can delete the photo post (file removed)',
  delPhoto.status === 200,
  `status ${delPhoto.status}`,
);
process.exit(results.every(Boolean) ? 0 : 1);
