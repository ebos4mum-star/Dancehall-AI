// Photo security checks through the real STAGING API. Needs the stored mode AND COMMUNITY_FLOOR_MODE both "open" (refuses to run otherwise).
// Synthetic accounts and generated test images only. Secrets from the environment, never printed.
//   STAGING_REF STAGING_CONFIRM STAGING_PUBLISHABLE_KEY
//   STAGING_M1_EMAIL/PASSWORD (uploader), STAGING_M3_EMAIL/PASSWORD (another member), STAGING_MOD_EMAIL/PASSWORD (staff)
//   PHOTO_DIR (folder with photo.jpg photo.png notimage.jpg), optional PHOTO_STATE_FILE (writes a signed link for the later expiry check)
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
const base = `https://${ref}.supabase.co`;
const dir = process.env.PHOTO_DIR;
const jpg = readFileSync(`${dir}/photo.jpg`);
const notimage = readFileSync(`${dir}/notimage.jpg`);
const MARK = Buffer.from('EXIF-GPS-TESTMARKER');
const results = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
};
async function http(url, { method = 'POST', token, body, headers = {}, raw } = {}) {
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
    const buf = Buffer.from(await r.arrayBuffer());
    let j = null;
    try {
      j = JSON.parse(buf.toString());
    } catch {
      /* binary */
    }
    return {
      status: r.status,
      j,
      buf,
      type: r.headers.get('content-type') ?? '',
      hdr: `cache-control=${r.headers.get('cache-control')} cf-cache-status=${r.headers.get('cf-cache-status')} age=${r.headers.get('age')}`,
    };
  } catch {
    return { status: 0, j: null, buf: Buffer.alloc(0), type: '' };
  }
}
const fn = (route, body, token) =>
  http(`${base}/functions/v1/community/${route}`, { token, body: body ?? {} });
const signIn = async (e, p) =>
  (await http(`${base}/auth/v1/token?grant_type=password`, { body: { email: e, password: p } })).j
    ?.access_token ?? null;
const b32 = (s) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
};
const totp = (secret) => {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', b32(secret)).update(c).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
};
async function aal2(token) {
  const en = await http(`${base}/auth/v1/factors`, {
    token,
    body: { factor_type: 'totp', friendly_name: 'photo-test', issuer: 'staging-test' },
  });
  if (!en.j?.id) return null;
  const ch = await http(`${base}/auth/v1/factors/${en.j.id}/challenge`, { token, body: {} });
  return (
    (
      await http(`${base}/auth/v1/factors/${en.j.id}/verify`, {
        token,
        body: { challenge_id: ch.j?.id, code: totp(en.j.totp.secret) },
      })
    ).j?.access_token ?? null
  );
}
async function putToTicket(t, bytes, name = 'f.jpg', type = 'image/jpeg') {
  const fd = new FormData();
  fd.append('cacheControl', '3600');
  fd.append('', new Blob([bytes], { type }), name);
  return http(t.uploadUrl, { method: 'PUT', raw: fd, headers: { 'x-upsert': 'false' } });
}
const idLeak = (s) =>
  /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-0000000000c[0-9]/i.test(s) ||
  /@staging-test/.test(s);

const m1 = await signIn(process.env.STAGING_M1_EMAIL, process.env.STAGING_M1_PASSWORD);
const m3 = await signIn(process.env.STAGING_M3_EMAIL, process.env.STAGING_M3_PASSWORD);
const modPw = await signIn(process.env.STAGING_MOD_EMAIL, process.env.STAGING_MOD_PASSWORD);
if (!m1 || !m3 || !modPw) {
  console.log('Could not sign in a test account.');
  process.exit(2);
}
const mod = await aal2(modPw);

const st = await fn('status');
record(
  'P0 effective mode is open (floor and database both open)',
  st.j?.mode === 'open',
  `mode ${st.j?.mode}`,
);
record(
  'P0b video and comments still report disabled',
  st.j?.videoEnabled === false && st.j?.commentsEnabled === false,
  JSON.stringify({ v: st.j?.videoEnabled, c: st.j?.commentsEnabled }),
);
if (st.j?.mode !== 'open') {
  console.log('Mode is not open. Nothing was tested.');
  process.exit(3);
}
record('P0c moderator second factor obtained', !!mod, '');

// Uploads
const tk = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m1);
const path = tk.j?.path;
record(
  'P1 a member can get an upload ticket',
  tk.status === 200 && /^m\/[0-9a-f-]{36}\.jpg$/.test(path ?? ''),
  `status ${tk.status}`,
);
record(
  'P1b the storage path carries no account id',
  !!path && !path.includes('00000000-0000-4000'),
  'checked',
);
const put = await putToTicket(tk.j, jpg);
record('P2 the file uploads to the signed upload link', put.status === 200, `status ${put.status}`);
const gu = await http(`${base}/storage/v1/object/public/community-media/${path}`, {
  method: 'GET',
});
record(
  'P3 the bucket has no public access',
  gu.status >= 400 && !gu.buf.includes(MARK),
  `status ${gu.status}`,
);
const ga = await http(`${base}/storage/v1/object/authenticated/community-media/${path}`, {
  method: 'GET',
  token: m1,
});
record(
  'P3b even the uploader cannot read the bucket directly',
  ga.status >= 400 && ga.type.indexOf('image') !== 0,
  `status ${ga.status}`,
);
const gb = await http(`${base}/storage/v1/object/authenticated/community-media/${path}`, {
  method: 'GET',
  token: m3,
});
record(
  'P3c another member cannot read it directly',
  gb.status >= 400 && gb.type.indexOf('image') !== 0,
  `status ${gb.status}`,
);
const list = await http(`${base}/storage/v1/object/list/community-media`, {
  token: m3,
  body: { prefix: 'm', limit: 20 },
});
record(
  'P3d another member cannot list the bucket',
  !(Array.isArray(list.j) && list.j.length > 0),
  `status ${list.status}`,
);
const steal = await fn('upload/commit', { path }, m3);
record(
  "P4 another member cannot commit someone else's upload",
  steal.status >= 400,
  `status ${steal.status}`,
);
const early = await fn(
  'post',
  { type: 'photo', body: 'x', confirmed: true, media: [{ kind: 'photo', role: 'single', path }] },
  m1,
);
record(
  'P4b an unverified upload cannot be attached',
  early.status >= 400,
  `status ${early.status}`,
);
const cm = await fn('upload/commit', { path }, m1);
record(
  'P5 the owner can commit; the server verifies it',
  cm.status === 200 && cm.j?.kind === 'photo',
  `status ${cm.status}`,
);
const theft = await fn(
  'post',
  {
    type: 'photo',
    body: 'stolen',
    confirmed: true,
    media: [{ kind: 'photo', role: 'single', path }],
  },
  m3,
);
record(
  "P5b another member cannot attach the first member's verified upload",
  theft.status >= 400,
  `status ${theft.status}`,
);

// Post, hold, visibility
const post = await fn(
  'post',
  {
    type: 'photo',
    body: 'Synthetic photo post A',
    confirmed: true,
    media: [{ kind: 'photo', role: 'single', path }],
  },
  m1,
);
// PHOTO_MODE=published checks the V1 behaviour (photos publish at once; a report then pulls one down).
// The default, held, matches the staging function until community.patch2_photo_immediate.sql is approved and applied.
const IMMEDIATE = process.env.PHOTO_MODE === 'published';
const expectStatus = IMMEDIATE ? 'published' : 'held';
record(
  `P6 a photo post is ${expectStatus}`,
  post.status === 200 && (post.j?.status === expectStatus || post.j?.post?.status === expectStatus),
  `status ${post.status} ${post.j?.status ?? ''}`,
);
const postId = post.j?.id ?? post.j?.post?.id;
const hasPost = (feed, id) => JSON.stringify(feed.j ?? {}).includes(id);
const fg = await fn('feed', { limit: 30 });
const f3 = await fn('feed', { limit: 30 }, m3);
const f1 = await fn('feed', { limit: 30 }, m1);
record(
  'P6b guests see the post only if photos publish at once',
  !!postId && hasPost(fg, postId) === IMMEDIATE,
  '',
);
record(
  'P6c another member sees it only if photos publish at once',
  hasPost(f3, postId) === IMMEDIATE,
  '',
);
const mine = (f1.j?.posts ?? []).find((p) => p.id === postId);
record(
  'P6d the author sees it, labelled held, with a signed photo link',
  mine?.status === expectStatus && mine.media?.length === 1,
  '',
);
record(
  'P6e no account id or email in any feed',
  ![fg, f3, f1].some((f) => idLeak(JSON.stringify(f.j ?? {}))),
  '',
);

// Signed URL
const url = mine?.media?.[0]?.uri;
const view = url ? await http(url, { method: 'GET', headers: { apikey: '' } }) : null;
record(
  'P7 the signed link serves the photo',
  view?.status === 200 && view.type.startsWith('image/'),
  `status ${view?.status}`,
);
record(
  'P7b the served photo has its hidden metadata stripped',
  !!view && !view.buf.includes(MARK),
  `${view?.buf.length} bytes`,
);
const token = url ? new URL(url).searchParams.get('token') : null;
if (token) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  record(
    'P7c the link lifetime is 600 seconds',
    claims.exp - claims.iat === 600,
    `${claims.exp - claims.iat}s`,
  );
  const bad = await http(url.replace(token, token.slice(0, -4) + 'AAAA'), { method: 'GET' });
  record('P7d a tampered link is refused', bad.status >= 400, `status ${bad.status}`);
  const other = await http(
    url.replace(path, path.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')).replace('.jpg', '.jpg')),
    { method: 'GET' },
  );
  record(
    'P7e the link does not open any other file',
    other.status >= 400,
    `status ${other.status}`,
  );
}

// Moderation
if (IMMEDIATE) {
  const rp = await fn(
    'report',
    { type: 'post', targetId: postId, reason: 'private_information' },
    m3,
  );
  record('P7f a report on a published photo is accepted', rp.status === 200, `status ${rp.status}`);
  const afterReport = await fn('feed', { limit: 30 });
  record('P7g a serious report hides the photo at once', !hasPost(afterReport, postId), '');
}
const q = await fn('mod/queue', {}, mod);
const qi = (q.j?.items ?? []).find((i) => i.id === postId);
record(
  'P8 the moderator sees the held photo post with a signed link and no account id',
  q.status === 200 && !!qi && qi.media?.length === 1 && !idLeak(JSON.stringify(q.j)),
  `status ${q.status}`,
);
const qm = await fn('mod/queue', {}, m1);
record(
  'P8b a member cannot use the queue',
  qm.status === 403 || qm.status === 401,
  `status ${qm.status}`,
);
const selfApprove = await fn('mod/act', { type: 'post', targetId: postId, action: 'approve' }, m1);
record(
  'P8c a member cannot approve their own post (moderation bypass)',
  selfApprove.status === 403 || selfApprove.status === 401,
  `status ${selfApprove.status}`,
);
const aalOnly = await fn('mod/act', { type: 'post', targetId: postId, action: 'approve' }, modPw);
record(
  'P8d a moderator WITHOUT a second factor cannot approve (MFA bypass)',
  aalOnly.status === 403 || aalOnly.status === 401,
  `status ${aalOnly.status}`,
);
const stillHeld = await fn('feed', { limit: 30 });
record('P8e the post is still not public after those attempts', !hasPost(stillHeld, postId), '');
const ap = await fn(
  'mod/act',
  { type: 'post', targetId: postId, action: 'approve', note: 'synthetic' },
  mod,
);
record('P9 the moderator (aal2) approves the photo post', ap.status === 200, `status ${ap.status}`);
const fg2 = await fn('feed', { limit: 30 });
const pub = (fg2.j?.posts ?? []).find((p) => p.id === postId);
record('P9b guests now see it with a signed photo link', !!pub && pub.media?.length === 1, '');
const pubView = pub ? await http(pub.media[0].uri, { method: 'GET' }) : null;
record(
  'P9c the public signed link serves the cleaned photo',
  pubView?.status === 200 && !pubView.buf.includes(MARK),
  `status ${pubView?.status}`,
);
if (process.env.PHOTO_STATE_FILE && pub)
  writeFileSync(
    process.env.PHOTO_STATE_FILE,
    JSON.stringify({ url: pub.media[0].uri, at: Date.now() }),
    { mode: 0o600 },
  );

// Deletion and cleanup (second post)
const tk2 = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m1);
await putToTicket(tk2.j, jpg);
await fn('upload/commit', { path: tk2.j?.path }, m1);
const post2 = await fn(
  'post',
  {
    type: 'photo',
    body: 'Synthetic photo post B',
    confirmed: true,
    media: [{ kind: 'photo', role: 'single', path: tk2.j?.path }],
  },
  m1,
);
const id2 = post2.j?.id ?? post2.j?.post?.id;
await fn('mod/act', { type: 'post', targetId: id2, action: 'approve' }, mod);
const pub2 = ((await fn('feed', { limit: 30 })).j?.posts ?? []).find((p) => p.id === id2);
const link2 = pub2?.media?.[0]?.uri;
const first = link2 ? await http(link2, { method: 'GET' }) : null;
const second = link2 ? await http(link2, { method: 'GET' }) : null;
record(
  'P10 a second published photo exists with a working link',
  first?.status === 200,
  `1st: ${first?.hdr}; 2nd: ${second?.hdr}`,
);
const delOther = await fn('post/delete', { postId: id2 }, m3);
const stillThere = ((await fn('feed', { limit: 30 })).j?.posts ?? []).some((p) => p.id === id2);
record("P10b another member cannot delete someone's post", stillThere, `status ${delOther.status}`);
const del = await fn('post/delete', { postId: id2 }, m1);
record('P10c the owner can delete their post', del.status === 200, `status ${del.status}`);
const gone = !((await fn('feed', { limit: 30 })).j?.posts ?? []).some((p) => p.id === id2);
record('P10d it disappears from the feed', gone, '');
const afterDel = link2 ? await http(link2, { method: 'GET' }) : null;
record(
  'P10e its photo file is removed (the old signed link no longer serves it)',
  !!afterDel && afterDel.status >= 400,
  `status ${afterDel?.status}; ${afterDel?.hdr}`,
);

// Refusals
const nt = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m3);
await putToTicket(nt.j, notimage);
const nc = await fn('upload/commit', { path: nt.j?.path }, m3);
record(
  'P11 a text file renamed .jpg is refused at commit',
  nc.status >= 400,
  `status ${nc.status} ${nc.j?.code ?? ''}`,
);
const big = Buffer.concat([jpg, Buffer.alloc(9 * 1024 * 1024)]);
const bt = await fn('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, m3);
await putToTicket(bt.j, big);
const bc = await fn('upload/commit', { path: bt.j?.path }, m3);
record(
  'P11b an oversized photo (over 8 MB) is refused',
  bc.status >= 400,
  `status ${bc.status} ${bc.j?.code ?? ''}`,
);
const vt = await fn('upload/ticket', { kind: 'video', mime: 'video/mp4' }, m1);
record(
  'P12 a video upload ticket is refused',
  vt.status >= 400,
  `status ${vt.status} ${vt.j?.code ?? ''}`,
);
const cmt = await fn('comment', { postId, body: 'hello' }, m1);
record('P12b comments are refused', cmt.status === 403, `status ${cmt.status}`);
const st2 = await fn('status');
record(
  'P12c video and comments still disabled at the end',
  st2.j?.videoEnabled === false && st2.j?.commentsEnabled === false,
  '',
);

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
