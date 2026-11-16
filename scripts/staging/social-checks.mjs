// Hosted checks of Friends and Group Goals against the STAGING project, through the real HTTPS API only (the `social` Edge Function and PostgREST). Synthetic accounts only.
//   STAGING_REF STAGING_CONFIRM STAGING_PUBLISHABLE_KEY, STAGING_SOCIAL_USERS (path to a JSON file {name:{id,email,password}}), phase "main" or "after-delete".
// Passwords come from the file and are never printed. Exits non-zero on any failure.
import { readFileSync } from 'node:fs';
import { assertStagingRef } from './guard.mjs';

const ref = assertStagingRef(process.env.STAGING_REF, process.env.STAGING_CONFIRM);
const key = process.env.STAGING_PUBLISHABLE_KEY;
if (!key || key.startsWith('sb_secret_'))
  throw new Error('Set STAGING_PUBLISHABLE_KEY to the PUBLISHABLE key only.');
const users = JSON.parse(readFileSync(process.env.STAGING_SOCIAL_USERS, 'utf8'));
const phase = process.argv[2] ?? 'main';
const base = `https://${ref}.supabase.co`;
const results = [];
const seen = [];
const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
async function http(path, { method = 'POST', token, body, raw } = {}) {
  try {
    const r = await fetch(base + path, {
      method,
      headers: {
        apikey: key,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
    return { status: r.status, j, text, headers: r.headers };
  } catch {
    return { status: 0, j: {}, text: '', headers: new Headers() };
  }
}
const tokens = {};
async function signIn(n) {
  const r = await http('/auth/v1/token?grant_type=password', {
    body: { email: users[n].email, password: users[n].password },
  });
  return r.j?.access_token ?? null;
}
const call = async (route, body, token) => {
  const r = await http(`/functions/v1/social/${route}`, { token, body: body ?? {} });
  seen.push(r.text);
  return r;
};
const as = (n) => (route, body) => call(route, body, tokens[n]);
const code = (r) => r.j?.code;
const ov = async (n) => (await as(n)('overview')).j.overview;

for (const n of Object.keys(users))
  tokens[n] = phase === 'after-delete' && n === 'kwame' ? 'deleted' : await signIn(n);
if (Object.values(tokens).some((t) => !t)) {
  console.log('Could not sign in a synthetic account.');
  process.exit(2);
}
// Limits are per minute and per person, so a long suite pauses between sections instead of tripping them by accident (the limits themselves are tested in section R).
const pause = async () => {
  console.log('...waiting for the one-minute rate-limit window to reset');
  await new Promise((r) => setTimeout(r, 62000));
};
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

if (phase === 'main') {
  // ---------- boundary ----------
  const fnGet = await http('/functions/v1/social/overview', { method: 'GET' });
  record('S1 only POST is served', fnGet.status === 405, `status ${fnGet.status}`);
  record(
    'S1b malformed JSON is a 400',
    (await http('/functions/v1/social/overview', { raw: '{nope', token: tokens.ama })).status ===
      400,
  );
  record(
    'S1c an oversized body is a 413',
    (
      await http('/functions/v1/social/overview', {
        raw: JSON.stringify({ x: 'a'.repeat(12000) }),
        token: tokens.ama,
      })
    ).status === 413,
  );
  record(
    'S1d an unknown route is a 404',
    (await call('no/such/route', {}, tokens.ama)).status === 404,
  );
  record('S2 no token is refused', (await call('overview', {}, null)).status === 401);
  record('S2b a garbage token is refused', (await call('overview', {}, 'garbage')).status === 401);
  record(
    'S2c a forged signature is refused',
    (await call('overview', {}, tokens.ama.split('.').slice(0, 2).join('.') + '.AAAA')).status ===
      401,
  );
  record(
    'S2d the publishable key alone is refused',
    (await call('overview', {}, key)).status === 401,
  );
  // The social tables and door are closed to clients over the data API too.
  for (const t of [
    'social_friendships',
    'social_shares',
    'social_blocks',
    'social_groups',
    'social_group_members',
    'social_contributions',
  ]) {
    const r = await http(`/rest/v1/${t}?select=*`, { method: 'GET', token: tokens.ama });
    record(
      `S3 a signed-in member cannot read ${t} directly`,
      r.status >= 400 || (Array.isArray(r.j) && r.j.length === 0 && false),
      `status ${r.status}`,
    );
  }
  const door = await http('/rest/v1/rpc/social_rpc', {
    token: tokens.ama,
    body: { fn: 'social_overview', args: {} },
  });
  record(
    'S3b a signed-in member cannot call the database door',
    door.status >= 400,
    `status ${door.status}`,
  );
  const direct = await http('/rest/v1/rpc/social_overview', { token: tokens.ama, body: {} });
  record('S3c the app functions are not exposed', direct.status >= 400, `status ${direct.status}`);
  const status = await http('/functions/v1/community/status', { body: {} });
  record(
    'S4 the public Community feed is untouched and still Read only',
    status.j?.mode === 'read_only' &&
      status.j?.commentsEnabled === false &&
      status.j?.videoEnabled === false,
    `mode ${status.j?.mode}`,
  );

  // ---------- names ----------
  record(
    'F1 a person without a public name cannot ask',
    code(await as('noname')('friend/request', { username: 'kofi_moves' })) === 'needs_username',
  );
  record(
    'F1b a staff look-alike name is refused',
    code(await as('noname')('username/claim', { username: 'adm1n' })) === 'invalid_username',
  );
  record(
    'F1c an invalid name is refused before the database',
    code(await as('noname')('username/claim', { username: 'x' })) === 'invalid_input',
  );
  for (const [n, name] of [
    ['ama', 'ama_dances'],
    ['kofi', 'kofi_moves'],
    ['efua', 'efua_fit'],
    ['yaw', 'yaw_beats'],
    ['kwame', 'kwame_flow'],
    ['esi', 'esi_steps'],
  ]) {
    const r = await as(n)('username/claim', { username: name });
    record(
      `F2 ${n} claims a public name through the social function`,
      r.status === 200,
      `status ${r.status}`,
    );
  }
  record(
    'F2b a second claim is refused',
    code(await as('ama')('username/claim', { username: 'another_name' })) === 'already_set',
  );
  record(
    'F2c a taken name is refused',
    ['taken', 'too_similar'].includes(
      code(await as('noname')('username/claim', { username: 'ama_dances' })),
    ),
  );
  record('F2d the overview shows the new name', (await ov('ama')).username === 'ama_dances');

  // ---------- requests ----------
  record(
    'F3 a request to yourself is refused',
    code(await as('ama')('friend/request', { username: 'ama_dances' })) === 'self',
  );
  record(
    'F3b a request to an unknown name is "not found"',
    code(await as('ama')('friend/request', { username: 'nobody_here' })) === 'not_found',
  );
  record(
    'F3c a valid request is made',
    (await as('ama')('friend/request', { username: 'kofi_moves' })).j.status === 'requested',
  );
  record(
    'F3d a repeat is refused',
    code(await as('ama')('friend/request', { username: 'kofi_moves' })) === 'already_requested',
  );
  record(
    'F3e the other side sees it as incoming',
    (await ov('kofi')).incoming.join() === 'ama_dances',
  );
  record(
    'F3f only the person asked can answer',
    code(await as('ama')('friend/respond', { username: 'kofi_moves', accept: true })) ===
      'no_request',
  );
  record(
    'F3g the asker can withdraw',
    (await as('ama')('friend/cancel', { username: 'kofi_moves' })).status === 200 &&
      (await ov('kofi')).incoming.length === 0,
  );
  await as('ama')('friend/request', { username: 'kofi_moves' });
  record(
    'F3h declining leaves no trace',
    (await as('kofi')('friend/respond', { username: 'ama_dances', accept: false })).status ===
      200 && (await ov('ama')).outgoing.length === 0,
  );
  await as('ama')('friend/request', { username: 'kofi_moves' });
  record(
    'F3i accepting makes both friends',
    (await as('kofi')('friend/respond', { username: 'ama_dances', accept: true })).status === 200 &&
      (await ov('ama')).friends.join() === 'kofi_moves' &&
      (await ov('kofi')).friends.join() === 'ama_dances',
  );
  record('F3j a stranger sees nothing of it', (await ov('efua')).friends.length === 0);
  for (const [a, b] of [
    ['ama', 'efua_fit'],
    ['ama', 'yaw_beats'],
    ['ama', 'kwame_flow'],
    ['ama', 'esi_steps'],
  ])
    await as(a)('friend/request', { username: b });
  for (const [n, from] of [
    ['efua', 'ama_dances'],
    ['yaw', 'ama_dances'],
    ['kwame', 'ama_dances'],
    ['esi', 'ama_dances'],
  ])
    await as(n)('friend/respond', { username: from, accept: true });
  record('F3k ama now has five friends', (await ov('ama')).friends.length === 5);

  await pause();
  // ---------- sharing ----------
  record(
    'P1 nothing is shared by default',
    (await as('kofi')('friend/view', { username: 'ama_dances' })).j.activity === null,
  );
  for (const bad of [
    'food',
    'food_diary',
    'weight',
    'weight_entries',
    'health',
    'photo',
    'location',
    'meals',
    'activity',
  ]) {
    const r = await as('ama')('share/set', { username: 'kofi_moves', category: bad, on: true });
    record(`P2 sharing "${bad}" is refused`, r.status === 400 && code(r) === 'invalid_category');
  }
  record(
    'P2b nothing was stored by those attempts',
    (await as('ama')('share/get', { username: 'kofi_moves' })).j.shares.length === 0,
  );
  record(
    'P2c sharing with a non-friend is refused',
    code(
      await as('ama')('share/set', {
        username: 'noname_x',
        category: 'activity_summary',
        on: true,
      }),
    ) === 'not_friends',
  );
  record(
    'P3 consent: the owner turns the weekly summary on for one friend',
    (
      await as('ama')('share/set', {
        username: 'kofi_moves',
        category: 'activity_summary',
        on: true,
      })
    ).status === 200,
  );
  const v = await as('kofi')('friend/view', { username: 'ama_dances' });
  record(
    'P3b that friend now sees the weekly summary (server-calculated)',
    v.j.activity?.sessions === 2 && v.j.activity?.minutes === 50,
    JSON.stringify(v.j.activity),
  );
  record(
    'P3c the view holds only a username and the summary',
    Object.keys(v.j).sort().join() === 'activity,ok,username',
  );
  record(
    'P3d another friend still sees nothing',
    (await as('efua')('friend/view', { username: 'ama_dances' })).j.activity === null,
  );
  record(
    'P3e sharing is one way',
    (await as('ama')('friend/view', { username: 'kofi_moves' })).j.activity === null,
  );
  record(
    'P3f a stranger is refused',
    code(await as('noname')('friend/view', { username: 'ama_dances' })) === 'needs_username' ||
      code(await as('noname')('friend/view', { username: 'ama_dances' })) === 'not_friends',
  );
  record(
    'P4 turning it off is immediate',
    (
      await as('ama')('share/set', {
        username: 'kofi_moves',
        category: 'activity_summary',
        on: false,
      })
    ).status === 200 &&
      (await as('kofi')('friend/view', { username: 'ama_dances' })).j.activity === null,
  );
  await as('ama')('share/set', { username: 'kofi_moves', category: 'activity_summary', on: true });
  await as('ama')('share/set', { username: 'efua_fit', category: 'activity_summary', on: true });
  const all = await as('ama')('share/revoke-all');
  record(
    'P4b "stop sharing with everyone" withdraws every choice at once',
    all.status === 200 &&
      all.j.withdrawn === 2 &&
      (await as('kofi')('friend/view', { username: 'ama_dances' })).j.activity === null &&
      (await as('efua')('friend/view', { username: 'ama_dances' })).j.activity === null,
  );
  await as('ama')('share/set', { username: 'kofi_moves', category: 'activity_summary', on: true });

  await pause();
  // ---------- removal and blocking ----------
  record(
    'B1 removing a friend ends the friendship and its sharing',
    (await as('ama')('friend/remove', { username: 'esi_steps' })).status === 200 &&
      code(await as('ama')('friend/remove', { username: 'esi_steps' })) === 'not_friends',
  );
  await as('kofi')('block', { username: 'ama_dances' });
  record(
    'B2 blocking severs the friendship for both',
    (await ov('ama')).friends.includes('kofi_moves') === false &&
      (await ov('kofi')).blocked.join() === 'ama_dances',
  );
  record(
    'B2b the blocked person cannot view them any more',
    code(await as('ama')('friend/view', { username: 'kofi_moves' })) === 'not_friends',
  );
  const blocked = await as('ama')('friend/request', { username: 'kofi_moves' });
  const unknown = await as('ama')('friend/request', { username: 'no_such_person' });
  record(
    'B3 a blocked person cannot find them: the answer equals an unknown name',
    blocked.status === unknown.status &&
      blocked.j.code === unknown.j.code &&
      blocked.j.message === unknown.j.message,
    `${blocked.status}/${blocked.j.code}`,
  );
  await as('kofi')('unblock', { username: 'ama_dances' });
  await as('ama')('friend/request', { username: 'kofi_moves' });
  await as('kofi')('friend/respond', { username: 'ama_dances', accept: true });
  record(
    'B4 after unblocking they can become friends again, with nothing shared',
    (await ov('kofi')).friends.includes('ama_dances') &&
      (await as('kofi')('friend/view', { username: 'ama_dances' })).j.activity === null,
  );
  await as('ama')('share/set', { username: 'kofi_moves', category: 'activity_summary', on: true });

  await pause();
  // ---------- groups ----------
  const g = {
    kind: 'challenge',
    title: 'June moves',
    metric: 'active_minutes',
    startDay: plus(-5),
    endDay: plus(20),
  };
  record(
    'G1 only friends can be invited to a challenge',
    code(await as('ama')('group/create', { ...g, invite: ['noname_x'] })) === 'not_friends',
  );
  const made = await as('ama')('group/create', { ...g, invite: ['kofi_moves', 'efua_fit'] });
  const gid = made.j.id;
  record(
    'G1b a free challenge is created',
    made.status === 200 && /^[0-9a-f-]{36}$/.test(gid ?? ''),
  );
  const inv = (await ov('kofi')).groups[0];
  record(
    'G2 an invitee sees only the invitation',
    inv?.iAm === 'invited' && inv.byMember.length === 0 && inv.members.length === 0,
  );
  record(
    'G2b an invitee cannot send numbers',
    code(await as('kofi')('group/sync', { groupId: gid })) === 'not_member',
  );
  record(
    'G2c a stranger cannot sync or leave it',
    code(await as('yaw')('group/sync', { groupId: gid })) === 'not_member' &&
      (await as('yaw')('group/leave', { groupId: gid })).status === 404,
  );
  record('G2d a stranger does not see it', (await ov('yaw')).groups.length === 0);
  record(
    'G3 an invitee joins',
    (await as('kofi')('group/respond', { groupId: gid, accept: true })).status === 200,
  );
  record(
    'G3b another invitee declines',
    (await as('efua')('group/respond', { groupId: gid, accept: false })).status === 200 &&
      (await ov('efua')).groups.length === 0,
  );
  record(
    'G4 server-calculated progress from completed workouts (duplicate counted once)',
    (await as('ama')('group/sync', { groupId: gid })).j.days === 2,
  );
  await as('kofi')('group/sync', { groupId: gid });
  const mine = (await ov('kofi')).groups[0];
  record(
    'G4b totals: ama 50, kofi 40, visible to members only',
    JSON.stringify(mine.byMember.map((m) => [m.username, m.total])) ===
      JSON.stringify([
        ['ama_dances', 50],
        ['kofi_moves', 40],
      ]),
    JSON.stringify(mine.byMember),
  );
  record(
    'G4c syncing again changes nothing',
    (await as('ama')('group/sync', { groupId: gid })).j.days === 2 &&
      (await ov('ama')).groups[0].byMember[0].total === 50,
  );
  record(
    'G5 ownership: the creator is the owner, a member is not',
    (await ov('ama')).groups[0].isOwner === true && mine.isOwner === false,
  );
  await as('ama')('group/leave', { groupId: gid });
  record(
    "G5b when the owner leaves, the remaining member becomes the owner and the leaver's numbers are gone",
    (await ov('kofi')).groups[0].isOwner === true &&
      (await ov('kofi')).groups[0].byMember.every((m) => m.username !== 'ama_dances'),
  );
  record(
    'G5c the leaver no longer sees the group',
    (await ov('ama')).groups.length === 0 &&
      code(await as('ama')('group/sync', { groupId: gid })) === 'not_member',
  );
  await as('kofi')('group/leave', { groupId: gid });
  record('G5d an empty group disappears', (await ov('kofi')).groups.length === 0);
  const cpl = {
    title: 'Move together',
    metric: 'active_days',
    target: 4,
    startDay: today,
    endDay: plus(6),
  };
  record(
    'G6 a couple goal needs exactly one invitee',
    code(
      await as('ama')('group/create', {
        ...cpl,
        kind: 'couple',
        invite: ['kofi_moves', 'efua_fit'],
      }),
    ) === 'invalid_input' &&
      code(await as('ama')('group/create', { ...cpl, kind: 'couple', invite: [] })) ===
        'invalid_input',
  );
  const cp = await as('ama')('group/create', { ...cpl, kind: 'couple', invite: ['kofi_moves'] });
  record(
    'G6b a couple invitation is sent and accepted',
    cp.status === 200 &&
      (await as('kofi')('group/respond', { groupId: cp.j.id, accept: true })).status === 200,
  );
  record(
    'G6c a goal needs a target',
    code(
      await as('ama')('group/create', {
        ...cpl,
        kind: 'family',
        target: null,
        invite: ['kofi_moves'],
      }),
    ) === 'invalid_input',
  );
  const fam = await as('ama')('group/create', {
    ...cpl,
    kind: 'family',
    invite: ['kofi_moves', 'efua_fit', 'yaw_beats', 'kwame_flow'],
  });
  record('G7 a family invitation goes to several friends', fam.status === 200);
  for (const n of ['efua', 'yaw', 'kwame'])
    await as(n)('group/respond', { groupId: fam.j.id, accept: true });
  record(
    'G7b every joined member sees the same family',
    (await ov('yaw')).groups.find((x) => x.kind === 'family')?.members.length === 4,
  );
  record(
    'G7c a family is limited to six people',
    code(
      await as('ama')('group/create', {
        ...cpl,
        kind: 'family',
        invite: [
          'kofi_moves',
          'efua_fit',
          'yaw_beats',
          'kwame_flow',
          'esi_steps',
          'ama_dances',
          'noname_x',
        ],
      }),
    ) !== undefined,
  );

  // ---------- limits, isolation ----------
  const burst = await Promise.all(
    Array.from({ length: 45 }, () => as('yaw')('friend/cancel', { username: 'ama_dances' })),
  );
  const codes = burst.map((r) => r.status);
  record(
    'R1 a member going too fast is rate limited, never a server error',
    codes.includes(429) && codes.every((c) => c === 404 || c === 429),
    [...new Set(codes)].join(','),
  );
  record('R1b another member is not affected', (await as('efua')('overview')).status === 200);
  const ask = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      as('esi')('friend/request', { username: `nobody_${i}`.replace('_', 'x') }),
    ),
  );
  record(
    'R2 request spam is limited',
    ask.some((r) => r.status === 429) && ask.every((r) => r.status === 404 || r.status === 429),
  );
  // efua is not kofi's friend: a body that names other accounts must change nothing, and ama's friendship with kofi must survive.
  const spoof = await as('efua')('friend/remove', {
    username: 'kofi_moves',
    user: users.ama.id,
    p_user: users.kofi.id,
    actor: users.kofi.id,
  });
  record(
    'R3 a body naming another account changes nothing (identity is the token)',
    code(spoof) === 'not_friends' && (await ov('ama')).friends.includes('kofi_moves'),
  );

  // ---------- account deletion ----------
  const del = await http('/rest/v1/rpc/request_account_deletion', {
    token: tokens.kwame,
    body: {},
  });
  record(
    'D1 a member can request account deletion',
    del.status === 200 || del.status === 204,
    `status ${del.status}`,
  );

  // ---------- privacy of everything returned ----------
  const text = seen.join('\n');
  const ids = Object.values(users).map((u) => u.id);
  record(
    'L1 no internal user id appears in any response',
    ids.every((id) => !text.includes(id)),
  );
  record(
    'L1b no email appears in any response',
    Object.values(users).every((u) => !text.includes(u.email.split('@')[0] + '@')),
  );
  const stray = [
    ...text.matchAll(/"(\w+)":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi),
  ].filter((m) => m[1] !== 'id');
  record('L1c a UUID appears only as a group id', stray.length === 0);
  record(
    'L2 no food, weight or health value appears in any response',
    !/71\.37|SECRETFOODMARKER|kcal|weight|food/i.test(
      text.replace(/"message":"[^"]*"/g, '').replace(/invalid_category/g, ''),
    ),
    'scanned',
  );
}

if (phase === 'after-delete') {
  // kwame requested deletion in the main phase; the server-side executor has since removed the account.
  const a = await as('ama')('overview');
  record(
    "A1 after kwame's account was deleted the friendship is gone",
    a.status === 200 && !a.j.overview.friends.includes('kwame_flow'),
  );
  record(
    'A2 kwame is gone from the family goal and its totals',
    a.j.overview.groups.every(
      (x) =>
        !x.members.includes('kwame_flow') && x.byMember.every((m) => m.username !== 'kwame_flow'),
    ),
  );
  record(
    'A3 nobody can still view kwame',
    code(await as('ama')('friend/view', { username: 'kwame_flow' })) === 'not_friends',
  );
  record(
    'A4 the name cannot be found',
    code(await as('efua')('friend/request', { username: 'kwame_flow' })) === 'not_found',
  );
  record(
    'A5 the deleted account cannot sign in',
    (
      await http('/auth/v1/token?grant_type=password', {
        body: { email: users.kwame.email, password: users.kwame.password },
      })
    ).status >= 400,
  );
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
