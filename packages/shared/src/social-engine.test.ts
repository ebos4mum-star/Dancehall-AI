import { describe, expect, it } from 'vitest';
import {
  NEVER_SHARED,
  SHARE_CATEGORIES,
  SOCIAL_LIMITS,
  SocialEngine,
  emptySocial,
  type ActivityWeek,
} from './social-engine';

const people: Record<string, string> = { u1: 'ama', u2: 'kofi', u3: 'esi', u4: 'yaw', u5: 'abena' };
const byName = Object.fromEntries(Object.entries(people).map(([id, n]) => [n, id]));
const dir = {
  nameOf: (id: string) => people[id] ?? null,
  idOf: (n: string) => byName[n.trim().toLowerCase()] ?? null,
};
let clock = new Date('2026-06-15T12:00:00Z');
function setup() {
  clock = new Date('2026-06-15T12:00:00Z');
  let n = 0;
  return new SocialEngine(
    emptySocial(),
    dir,
    () => clock,
    () => `g${++n}`,
  );
}
const befriend = (e: SocialEngine, x: string, y: string) => {
  expect(e.request(x, people[y]!)).toMatchObject({ ok: true });
  expect(e.respond(y, people[x]!, true)).toEqual({ ok: true });
};
const week: ActivityWeek = { sessions: 3, minutes: 95, activeDays: 3 };

describe('friend requests', () => {
  it('request, accept, and both see each other', () => {
    const e = setup();
    expect(e.request('u1', 'kofi')).toEqual({ ok: true, status: 'requested' });
    expect(e.lists('u1').outgoing).toEqual(['kofi']);
    expect(e.lists('u2').incoming).toEqual(['ama']);
    expect(e.lists('u2').friends).toEqual([]);
    expect(e.respond('u2', 'ama', true)).toEqual({ ok: true });
    expect(e.lists('u1').friends).toEqual(['kofi']);
    expect(e.lists('u2').friends).toEqual(['ama']);
  });
  it('declining leaves no trace and allows asking again later', () => {
    const e = setup();
    e.request('u1', 'kofi');
    expect(e.respond('u2', 'ama', false)).toEqual({ ok: true });
    expect(e.lists('u1')).toEqual({ friends: [], incoming: [], outgoing: [] });
    expect(e.request('u1', 'kofi')).toMatchObject({ ok: true });
  });
  it('only the person asked can accept; asking back accepts; duplicates and self are refused', () => {
    const e = setup();
    e.request('u1', 'kofi');
    expect(e.respond('u1', 'kofi', true)).toEqual({ ok: false, code: 'no_request' });
    expect(e.request('u1', 'kofi')).toEqual({ ok: false, code: 'already_requested' });
    expect(e.request('u1', 'ama')).toEqual({ ok: false, code: 'self' });
    expect(e.request('u2', 'ama')).toEqual({ ok: true, status: 'accepted' });
    expect(e.request('u1', 'kofi')).toEqual({ ok: false, code: 'already_friends' });
    expect(e.request('u1', 'nobody')).toEqual({ ok: false, code: 'not_found' });
  });
  it('a request can be withdrawn only by the one who sent it', () => {
    const e = setup();
    e.request('u1', 'kofi');
    expect(e.cancelRequest('u2', 'ama')).toEqual({ ok: false, code: 'no_request' });
    expect(e.cancelRequest('u1', 'kofi')).toEqual({ ok: true });
    expect(e.lists('u2').incoming).toEqual([]);
  });
  it('removing a friend ends the friendship and every share between them', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    e.setShare('u1', 'kofi', 'activity_summary', true);
    e.setShare('u2', 'ama', 'activity_summary', true);
    expect(e.remove('u1', 'kofi')).toEqual({ ok: true });
    expect(e.state.shares).toEqual([]);
    expect(e.lists('u2').friends).toEqual([]);
    expect(e.remove('u1', 'kofi')).toEqual({ ok: false, code: 'not_friends' });
  });
  it('enforces limits', () => {
    const e = setup();
    const many = new SocialEngine(
      emptySocial(),
      { nameOf: (id) => id, idOf: (n) => n },
      () => clock,
    );
    for (let i = 0; i < SOCIAL_LIMITS.pendingOut; i++)
      expect(many.request('me', `x${i}`)).toMatchObject({ ok: true });
    expect(many.request('me', 'one-more')).toEqual({ ok: false, code: 'limit_reached' });
    expect(e.lists('u1').friends).toEqual([]);
  });
});

describe('blocking', () => {
  it('a blocked person cannot find or ask the one who blocked them, and the answer gives nothing away', () => {
    const e = setup();
    e.block('u1', 'kofi');
    expect(e.request('u2', 'ama')).toEqual({ ok: false, code: 'not_found' });
    expect(e.request('u2', 'nobody')).toEqual({ ok: false, code: 'not_found' });
    expect(e.request('u1', 'kofi')).toEqual({ ok: false, code: 'not_found' }); // and the blocker cannot ask them either until they unblock
    e.unblock('u1', 'kofi');
    expect(e.request('u2', 'ama')).toMatchObject({ ok: true });
  });
  it('blocking severs friendship and shares, and hides each from the other everywhere', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    e.setShare('u2', 'ama', 'activity_summary', true);
    e.block('u1', 'kofi');
    expect(e.lists('u1').friends).toEqual([]);
    expect(e.lists('u2').friends).toEqual([]);
    expect(e.state.shares).toEqual([]);
    expect(e.viewFriend('u1', 'kofi', () => week)).toEqual({ ok: false, code: 'not_friends' });
    expect(e.blocked('u1')).toEqual(['kofi']);
    expect(e.blocked('u2')).toEqual([]);
  });
  it('blocking removes the other from groups the blocker owns', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = e.createGroup('u1', {
      kind: 'challenge',
      title: 'June',
      metric: 'active_minutes',
      startDay: '2026-06-01',
      endDay: '2026-06-30',
      invite: ['kofi'],
    });
    if (!g.ok) throw new Error();
    e.respondGroup('u2', g.id, true);
    e.block('u1', 'kofi');
    expect(e.listGroups('u2')).toEqual([]);
  });
  it('cannot block yourself or nobody', () => {
    const e = setup();
    expect(e.block('u1', 'ama')).toEqual({ ok: false, code: 'self' });
    expect(e.block('u1', 'nobody')).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('sharing is explicit, per friend and revocable, and never covers health data', () => {
  it('the list of shareable things contains no food, weight, body, health, photo or location data', () => {
    for (const c of SHARE_CATEGORIES) for (const bad of NEVER_SHARED) expect(c).not.toContain(bad);
    const e = setup();
    befriend(e, 'u1', 'u2');
    for (const bad of [
      ...NEVER_SHARED,
      'food_diary',
      'weight_entries',
      'weight',
      'meals',
      'activity',
    ]) {
      expect(e.setShare('u1', 'kofi', bad, true)).toEqual({ ok: false, code: 'invalid_category' });
    }
    expect(e.state.shares).toEqual([]);
  });
  it('nothing is visible until the owner turns it on for that friend, and turning it off is immediate', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    befriend(e, 'u1', 'u3');
    expect(e.viewFriend('u2', 'ama', () => week)).toMatchObject({ ok: true, activity: null });
    e.setShare('u1', 'kofi', 'activity_summary', true);
    expect(e.viewFriend('u2', 'ama', () => week)).toMatchObject({ ok: true, activity: week });
    expect(e.viewFriend('u3', 'ama', () => week)).toMatchObject({ ok: true, activity: null }); // another friend sees nothing
    expect(e.sharesWith('u1', 'kofi')).toEqual(['activity_summary']);
    e.setShare('u1', 'kofi', 'activity_summary', false);
    expect(e.viewFriend('u2', 'ama', () => week)).toMatchObject({ ok: true, activity: null });
    expect(e.sharesWith('u1', 'kofi')).toEqual([]);
  });
  it('sharing is one-way: the friend has to turn theirs on separately', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    e.setShare('u1', 'kofi', 'activity_summary', true);
    expect(e.viewFriend('u1', 'kofi', () => week)).toMatchObject({ ok: true, activity: null });
  });
  it('only friends can be shared with, and the viewer result carries no ids', () => {
    const e = setup();
    expect(e.setShare('u1', 'kofi', 'activity_summary', true)).toEqual({
      ok: false,
      code: 'not_friends',
    });
    expect(e.viewFriend('u1', 'kofi', () => week)).toEqual({ ok: false, code: 'not_friends' });
    befriend(e, 'u1', 'u2');
    e.setShare('u2', 'ama', 'activity_summary', true);
    const out = JSON.stringify(e.viewFriend('u1', 'kofi', () => week));
    expect(out).not.toMatch(/u1|u2/);
  });
  it('the provider is only asked about people who chose to share', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const asked: string[] = [];
    e.viewFriend('u1', 'kofi', (u) => (asked.push(u), week));
    expect(asked).toEqual([]);
  });
});

describe('group challenges, couple and family goals', () => {
  const challenge = (e: SocialEngine, invite = ['kofi', 'esi']) =>
    e.createGroup('u1', {
      kind: 'challenge',
      title: 'June moves',
      metric: 'active_minutes',
      startDay: '2026-06-01',
      endDay: '2026-06-30',
      invite,
    });
  it('only accepted friends can be invited, and invitations need a yes', () => {
    const e = setup();
    expect(challenge(e)).toEqual({ ok: false, code: 'not_friends' });
    befriend(e, 'u1', 'u2');
    befriend(e, 'u1', 'u3');
    const g = challenge(e);
    if (!g.ok) throw new Error();
    expect(e.listGroups('u2')[0]).toMatchObject({ iAm: 'invited', total: null, byMember: [] });
    expect(e.report('u2', g.id, '2026-06-10', 30)).toEqual({ ok: false, code: 'not_member' });
    expect(e.respondGroup('u2', g.id, true)).toEqual({ ok: true });
    expect(e.respondGroup('u3', g.id, false)).toEqual({ ok: true });
    expect(e.listGroups('u3')).toEqual([]);
    expect(e.listGroups('u1')[0]!.members).toEqual(['ama', 'kofi']);
  });
  it('reports are per day, replace themselves, are clamped, and respect the dates', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = challenge(e, ['kofi']);
    if (!g.ok) throw new Error();
    e.respondGroup('u2', g.id, true);
    e.report('u1', g.id, '2026-06-10', 30);
    e.report('u1', g.id, '2026-06-10', 45); // replaces
    e.report('u1', g.id, '2026-06-11', 99999); // clamped
    e.report('u2', g.id, '2026-06-12', 20);
    expect(e.report('u1', g.id, '2026-06-16', 10)).toEqual({ ok: false, code: 'closed' }); // future
    expect(e.report('u1', g.id, '2026-05-31', 10)).toEqual({ ok: false, code: 'closed' }); // before
    expect(e.report('u1', g.id, 'x', 10)).toEqual({ ok: false, code: 'closed' });
    expect(e.report('u1', g.id, '2026-06-12', -5)).toEqual({ ok: false, code: 'invalid_input' });
    const v = e.groupView('u2', g.id);
    if (!v.ok) throw new Error();
    expect(v.view.byMember).toEqual([
      { username: 'ama', total: 45 + SOCIAL_LIMITS.maxMinutesPerDay, isMe: false },
      { username: 'kofi', total: 20, isMe: true },
    ]);
    expect(v.view.total).toBe(45 + SOCIAL_LIMITS.maxMinutesPerDay + 20);
    e.report('u1', g.id, '2026-06-10', 0); // zero removes the day
    expect(
      e.state.groups[0]!.contributions.filter((c) => c.userId === 'u1' && c.day === '2026-06-10'),
    ).toEqual([]);
  });
  it('active-days groups count each day once', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = e.createGroup('u1', {
      kind: 'couple',
      title: 'Move together',
      metric: 'active_days',
      target: 8,
      startDay: '2026-06-15',
      endDay: '2026-06-21',
      invite: ['kofi'],
    });
    if (!g.ok) throw new Error();
    e.respondGroup('u2', g.id, true);
    e.report('u1', g.id, '2026-06-15', 90);
    e.report('u2', g.id, '2026-06-15', 12);
    const v = e.groupView('u1', g.id);
    if (!v.ok) throw new Error();
    expect(v.view.total).toBe(2);
  });
  it('couples are exactly two; families up to six; goals need a target', () => {
    const e = setup();
    for (const [a, b] of [
      ['u1', 'u2'],
      ['u1', 'u3'],
      ['u1', 'u4'],
    ] as const)
      befriend(e, a, b);
    const base = {
      title: 'x',
      metric: 'active_days' as const,
      startDay: '2026-06-15',
      endDay: '2026-06-21',
    };
    expect(
      e.createGroup('u1', { ...base, kind: 'couple', target: 5, invite: ['kofi', 'esi'] }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(e.createGroup('u1', { ...base, kind: 'couple', target: 5, invite: [] })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(e.createGroup('u1', { ...base, kind: 'family', invite: ['kofi'] })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(
      e.createGroup('u1', { ...base, kind: 'family', target: 10, invite: ['kofi', 'esi', 'yaw'] }),
    ).toMatchObject({ ok: true });
  });
  it('validates title, dates and length', () => {
    const e = setup();
    const ok = { kind: 'challenge' as const, metric: 'active_minutes' as const, invite: [] };
    expect(
      e.createGroup('u1', { ...ok, title: ' ', startDay: '2026-06-01', endDay: '2026-06-30' }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(
      e.createGroup('u1', { ...ok, title: 'a', startDay: '2026-06-30', endDay: '2026-06-01' }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(
      e.createGroup('u1', { ...ok, title: 'a', startDay: '2026-01-01', endDay: '2026-12-31' }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(e.createGroup('u1', { ...ok, title: 'a', startDay: 'x', endDay: 'y' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });
  it('leaving removes my numbers and my visibility; the owner role passes on; an empty group disappears', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = challenge(e, ['kofi']);
    if (!g.ok) throw new Error();
    e.respondGroup('u2', g.id, true);
    e.report('u2', g.id, '2026-06-10', 50);
    e.leaveGroup('u2', g.id);
    expect(e.state.groups[0]!.contributions).toEqual([]);
    expect(e.listGroups('u2')).toEqual([]);
    expect(e.groupView('u2', g.id)).toEqual({ ok: false, code: 'not_found' });
    e.leaveGroup('u1', g.id);
    expect(e.state.groups).toEqual([]);
  });
  it('a group shows only usernames and numbers, and an invitee sees none of the members', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = challenge(e, ['kofi']);
    if (!g.ok) throw new Error();
    e.report('u1', g.id, '2026-06-10', 40);
    const invited = JSON.stringify(e.groupView('u2', g.id));
    expect(invited).not.toMatch(/ama|40/);
    e.respondGroup('u2', g.id, true);
    expect(JSON.stringify(e.groupView('u2', g.id))).not.toMatch(/u1|u2/);
  });
  it('a stranger cannot read or report to a group', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    const g = challenge(e, ['kofi']);
    if (!g.ok) throw new Error();
    expect(e.groupView('u5', g.id)).toEqual({ ok: false, code: 'not_found' });
    expect(e.report('u5', g.id, '2026-06-10', 10)).toEqual({ ok: false, code: 'not_member' });
    expect(e.leaveGroup('u5', g.id)).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('account deletion', () => {
  it('erases a person from friendships, blocks, shares and groups, and keeps the others intact', () => {
    const e = setup();
    befriend(e, 'u1', 'u2');
    befriend(e, 'u1', 'u3');
    e.setShare('u1', 'kofi', 'activity_summary', true);
    e.block('u1', 'yaw');
    const g = e.createGroup('u1', {
      kind: 'challenge',
      title: 'g',
      metric: 'active_minutes',
      startDay: '2026-06-01',
      endDay: '2026-06-30',
      invite: ['kofi', 'esi'],
    });
    if (!g.ok) throw new Error();
    e.respondGroup('u2', g.id, true);
    e.report('u1', g.id, '2026-06-10', 30);
    e.erase('u1');
    expect(JSON.stringify(e.state)).not.toMatch(/u1/);
    expect(e.state.groups[0]!.members.map((m) => m.userId)).toEqual(['u2', 'u3']);
    expect(e.state.friendships).toEqual([]);
  });
});
