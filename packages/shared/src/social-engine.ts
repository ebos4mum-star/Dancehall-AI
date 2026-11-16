/**
 * Friends, sharing and group goals: the rules as one reference implementation over plain data (the same approach as community-engine.ts). The development mock
 * runs it directly; supabase/proposed/social.up.sql enforces the same rules in SQL (proposal only, not applied).
 *
 * Privacy rules this engine guarantees, each pinned by a test:
 *  - Food diaries, weights, body measurements and health information can NEVER be shared. `SHARE_CATEGORIES` is the complete list of what a person may choose to share,
 *    and it contains none of them. There is no code path that reads them.
 *  - Nothing is shared until the owner turns that one category on for that one friend, and turning it off takes effect at once.
 *  - A group (challenge, couple or family goal) shares one number, active minutes or active days, with that group's joined members only. Leaving removes the
 *    person's numbers and their visibility.
 *  - A blocked person cannot find, request or see anyone who blocked them, and the answer never says why (no probing).
 *  - Methods take the acting person's INTERNAL id; what they return carries usernames only.
 */
export const SHARE_CATEGORIES = ['activity_summary'] as const;
export type ShareCategory = (typeof SHARE_CATEGORIES)[number];
/** Data this engine refuses to handle under any name. Used by tests as a tripwire. */
export const NEVER_SHARED = ['food', 'weight', 'body', 'health', 'photo', 'location'] as const;

export const SOCIAL_LIMITS = {
  friends: 100,
  pendingOut: 20,
  groupsPerPerson: 10,
  groupMembers: 12,
  coupleMembers: 2,
  familyMembers: 6,
  maxMinutesPerDay: 600,
  titleChars: 60,
} as const;

export type GroupKind = 'challenge' | 'couple' | 'family';
export type GroupMetric = 'active_minutes' | 'active_days';
export type SocialFailCode =
  | 'not_found'
  | 'self'
  | 'already_friends'
  | 'already_requested'
  | 'no_request'
  | 'not_friends'
  | 'limit_reached'
  | 'invalid_category'
  | 'invalid_input'
  | 'not_member'
  | 'not_owner'
  | 'closed';
export type SocialFail = { ok: false; code: SocialFailCode };
const fail = (code: SocialFailCode): SocialFail => ({ ok: false, code });

export interface Friendship {
  /** Always sorted: a < b. */
  a: string;
  b: string;
  status: 'pending' | 'accepted';
  requestedBy: string;
  createdAt: string;
}
export interface GroupMember {
  userId: string;
  status: 'invited' | 'joined';
}
export interface Group {
  id: string;
  kind: GroupKind;
  title: string;
  metric: GroupMetric;
  /** Target per week for couple and family goals (active days or minutes); optional for challenges. */
  target: number | null;
  startDay: string;
  endDay: string;
  ownerId: string;
  members: GroupMember[];
  createdAt: string;
  /** What each person reported, one number per day. Self-reported. */
  contributions: Array<{ userId: string; day: string; value: number }>;
}
export interface SocialState {
  friendships: Friendship[];
  blocks: Array<{ by: string; blocked: string }>;
  shares: Array<{ owner: string; viewer: string; category: ShareCategory }>;
  groups: Group[];
}
export const emptySocial = (): SocialState => ({
  friendships: [],
  blocks: [],
  shares: [],
  groups: [],
});

export interface Directory {
  /** Public username for an internal id, or null. */
  nameOf(userId: string): string | null;
  /** Internal id for a public username (case-insensitive), or null. */
  idOf(username: string): string | null;
}
export interface ActivityWeek {
  sessions: number;
  minutes: number;
  activeDays: number;
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const day = (iso: string) => iso.slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SocialEngine {
  constructor(
    readonly state: SocialState,
    private readonly dir: Directory,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => Math.random().toString(36).slice(2, 12),
  ) {}

  // ---------- blocking and lookup ----------
  private blockedEitherWay(x: string, y: string): boolean {
    return this.state.blocks.some(
      (b) => (b.by === x && b.blocked === y) || (b.by === y && b.blocked === x),
    );
  }
  private friendship(x: string, y: string): Friendship | undefined {
    const [a, b] = pair(x, y);
    return this.state.friendships.find((f) => f.a === a && f.b === b);
  }
  private areFriends(x: string, y: string): boolean {
    return this.friendship(x, y)?.status === 'accepted';
  }

  /** Revokes everything between two people: the friendship, shares in both directions, and each other's group invitations. Groups they both joined stay (leaving is its own choice). */
  private sever(x: string, y: string) {
    const [a, b] = pair(x, y);
    this.state.friendships = this.state.friendships.filter((f) => !(f.a === a && f.b === b));
    this.state.shares = this.state.shares.filter(
      (s) => !((s.owner === x && s.viewer === y) || (s.owner === y && s.viewer === x)),
    );
  }

  block(me: string, username: string): { ok: true } | SocialFail {
    const other = this.dir.idOf(username);
    if (!other) return fail('not_found');
    if (other === me) return fail('self');
    if (!this.state.blocks.some((b) => b.by === me && b.blocked === other))
      this.state.blocks.push({ by: me, blocked: other });
    this.sever(me, other);
    // Neither can see the other's group numbers any more: remove each from groups the other owns, and invitations between them.
    for (const g of this.state.groups) {
      if (g.ownerId === me) this.removeFromGroup(g, other);
      if (g.ownerId === other) this.removeFromGroup(g, me);
    }
    return { ok: true };
  }
  unblock(me: string, username: string): { ok: true } | SocialFail {
    const other = this.dir.idOf(username);
    if (!other) return fail('not_found');
    this.state.blocks = this.state.blocks.filter((b) => !(b.by === me && b.blocked === other));
    return { ok: true };
  }
  blocked(me: string): string[] {
    return this.state.blocks
      .filter((b) => b.by === me)
      .map((b) => this.dir.nameOf(b.blocked))
      .filter((n): n is string => !!n)
      .sort();
  }

  // ---------- friends ----------
  request(
    me: string,
    username: string,
  ): { ok: true; status: 'requested' | 'accepted' } | SocialFail {
    const other = this.dir.idOf(username);
    // Unknown, blocked and blocking all look the same.
    if (!other || this.blockedEitherWay(me, other))
      return fail(other === me ? 'self' : 'not_found');
    if (other === me) return fail('self');
    const f = this.friendship(me, other);
    if (f?.status === 'accepted') return fail('already_friends');
    if (f && f.requestedBy === me) return fail('already_requested');
    if (f && f.requestedBy === other) {
      f.status = 'accepted'; // they already asked: asking back is accepting
      return { ok: true, status: 'accepted' };
    }
    if (this.friendCount(me) >= SOCIAL_LIMITS.friends) return fail('limit_reached');
    if (
      this.state.friendships.filter((x) => x.status === 'pending' && x.requestedBy === me).length >=
      SOCIAL_LIMITS.pendingOut
    )
      return fail('limit_reached');
    const [a, b] = pair(me, other);
    this.state.friendships.push({
      a,
      b,
      status: 'pending',
      requestedBy: me,
      createdAt: this.now().toISOString(),
    });
    return { ok: true, status: 'requested' };
  }
  private friendCount(u: string) {
    return this.state.friendships.filter((f) => f.status === 'accepted' && (f.a === u || f.b === u))
      .length;
  }
  respond(me: string, username: string, accept: boolean): { ok: true } | SocialFail {
    const other = this.dir.idOf(username);
    const f = other ? this.friendship(me, other) : undefined;
    if (
      !other ||
      !f ||
      f.status !== 'pending' ||
      f.requestedBy !== other ||
      this.blockedEitherWay(me, other)
    )
      return fail('no_request');
    if (accept) {
      if (
        this.friendCount(me) >= SOCIAL_LIMITS.friends ||
        this.friendCount(other) >= SOCIAL_LIMITS.friends
      )
        return fail('limit_reached');
      f.status = 'accepted';
    } else this.sever(me, other);
    return { ok: true };
  }
  /** Withdraws my own pending request. */
  cancelRequest(me: string, username: string): { ok: true } | SocialFail {
    const other = this.dir.idOf(username);
    const f = other ? this.friendship(me, other) : undefined;
    if (!other || !f || f.status !== 'pending' || f.requestedBy !== me) return fail('no_request');
    this.sever(me, other);
    return { ok: true };
  }
  remove(me: string, username: string): { ok: true } | SocialFail {
    const other = this.dir.idOf(username);
    if (!other || !this.areFriends(me, other)) return fail('not_friends');
    this.sever(me, other);
    return { ok: true };
  }
  lists(me: string): { friends: string[]; incoming: string[]; outgoing: string[] } {
    const name = (id: string) => this.dir.nameOf(id);
    const out = { friends: [] as string[], incoming: [] as string[], outgoing: [] as string[] };
    for (const f of this.state.friendships) {
      if (f.a !== me && f.b !== me) continue;
      const other = f.a === me ? f.b : f.a;
      if (this.blockedEitherWay(me, other)) continue;
      const n = name(other);
      if (!n) continue;
      if (f.status === 'accepted') out.friends.push(n);
      else if (f.requestedBy === me) out.outgoing.push(n);
      else out.incoming.push(n);
    }
    for (const k of Object.keys(out) as Array<keyof typeof out>) out[k].sort();
    return out;
  }

  // ---------- sharing (per friend, per category, revocable) ----------
  setShare(me: string, username: string, category: string, on: boolean): { ok: true } | SocialFail {
    if (!(SHARE_CATEGORIES as readonly string[]).includes(category))
      return fail('invalid_category');
    const friend = this.dir.idOf(username);
    if (!friend || !this.areFriends(me, friend) || this.blockedEitherWay(me, friend))
      return fail('not_friends');
    const cat = category as ShareCategory;
    this.state.shares = this.state.shares.filter(
      (s) => !(s.owner === me && s.viewer === friend && s.category === cat),
    );
    if (on) this.state.shares.push({ owner: me, viewer: friend, category: cat });
    return { ok: true };
  }
  /** What I currently share with this friend. */
  sharesWith(me: string, username: string): ShareCategory[] {
    const friend = this.dir.idOf(username);
    return friend
      ? this.state.shares
          .filter((s) => s.owner === me && s.viewer === friend)
          .map((s) => s.category)
      : [];
  }
  /** What a friend has chosen to show me. Only categories they turned on for me; nothing else is ever returned. */
  viewFriend(
    me: string,
    username: string,
    activityOf: (userId: string) => ActivityWeek,
  ): { ok: true; username: string; activity: ActivityWeek | null } | SocialFail {
    const friend = this.dir.idOf(username);
    if (!friend || !this.areFriends(me, friend) || this.blockedEitherWay(me, friend))
      return fail('not_friends');
    const shared = this.state.shares.some(
      (s) => s.owner === friend && s.viewer === me && s.category === 'activity_summary',
    );
    return {
      ok: true,
      username: this.dir.nameOf(friend) ?? username,
      activity: shared ? activityOf(friend) : null,
    };
  }

  // ---------- groups: challenges, couple and family goals ----------
  private joinedCount = (g: Group) => g.members.filter((m) => m.status === 'joined').length;
  private groupsOf = (u: string) =>
    this.state.groups.filter((g) => g.members.some((m) => m.userId === u));

  createGroup(
    me: string,
    input: {
      kind: GroupKind;
      title: string;
      metric: GroupMetric;
      target?: number | null;
      startDay: string;
      endDay: string;
      invite: string[];
    },
  ): { ok: true; id: string } | SocialFail {
    const title = input.title.trim();
    if (title.length < 1 || title.length > SOCIAL_LIMITS.titleChars) return fail('invalid_input');
    if (!DAY.test(input.startDay) || !DAY.test(input.endDay) || input.endDay < input.startDay)
      return fail('invalid_input');
    const days =
      (Date.parse(`${input.endDay}T00:00:00Z`) - Date.parse(`${input.startDay}T00:00:00Z`)) /
        86_400_000 +
      1;
    if (days > 92) return fail('invalid_input');
    if (
      !['challenge', 'couple', 'family'].includes(input.kind) ||
      !['active_minutes', 'active_days'].includes(input.metric)
    )
      return fail('invalid_input');
    const target = input.target ?? null;
    if (
      (input.kind !== 'challenge' && target === null) ||
      (target !== null && !(target > 0 && target <= 100_000))
    )
      return fail('invalid_input');
    const cap =
      input.kind === 'couple'
        ? SOCIAL_LIMITS.coupleMembers
        : input.kind === 'family'
          ? SOCIAL_LIMITS.familyMembers
          : SOCIAL_LIMITS.groupMembers;
    const ids: string[] = [];
    for (const u of new Set(input.invite)) {
      const id = this.dir.idOf(u);
      // Only accepted friends can be invited, so a stranger can never be pulled into a group.
      if (!id || id === me || !this.areFriends(me, id) || this.blockedEitherWay(me, id))
        return fail('not_friends');
      ids.push(id);
    }
    if (1 + ids.length > cap || (input.kind === 'couple' && ids.length !== 1))
      return fail('invalid_input');
    if (this.groupsOf(me).length >= SOCIAL_LIMITS.groupsPerPerson) return fail('limit_reached');
    const g: Group = {
      id: this.newId(),
      kind: input.kind,
      title,
      metric: input.metric,
      target,
      startDay: input.startDay,
      endDay: input.endDay,
      ownerId: me,
      members: [
        { userId: me, status: 'joined' },
        ...ids.map((userId) => ({ userId, status: 'invited' as const })),
      ],
      createdAt: this.now().toISOString(),
      contributions: [],
    };
    this.state.groups.push(g);
    return { ok: true, id: g.id };
  }
  private groupFor(me: string, id: string): Group | undefined {
    return this.state.groups.find((g) => g.id === id && g.members.some((m) => m.userId === me));
  }
  respondGroup(me: string, id: string, accept: boolean): { ok: true } | SocialFail {
    const g = this.groupFor(me, id);
    const m = g?.members.find((x) => x.userId === me);
    if (!g || !m || m.status !== 'invited') return fail('not_found');
    if (!accept) return this.dropAndOk(g, me);
    if (
      this.groupsOf(me).filter((x) => x.members.find((y) => y.userId === me)?.status === 'joined')
        .length >= SOCIAL_LIMITS.groupsPerPerson
    )
      return fail('limit_reached');
    m.status = 'joined';
    return { ok: true };
  }
  private dropAndOk(g: Group, u: string): { ok: true } {
    this.dropMember(g, u);
    return { ok: true };
  }
  private dropMember(g: Group, u: string) {
    g.members = g.members.filter((m) => m.userId !== u);
    g.contributions = g.contributions.filter((c) => c.userId !== u);
    if (g.members.filter((m) => m.status === 'joined').length === 0)
      this.state.groups = this.state.groups.filter((x) => x.id !== g.id);
  }
  /** Leaving removes my numbers from the group and ends all visibility, both ways. If the owner leaves, the longest-standing joined member becomes owner. */
  leaveGroup(me: string, id: string): { ok: true } | SocialFail {
    const g = this.groupFor(me, id);
    if (!g) return fail('not_found');
    this.removeFromGroup(g, me);
    return { ok: true };
  }
  private removeFromGroup(g: Group, u: string) {
    this.dropMember(g, u);
    if (g.ownerId === u) {
      const next = g.members.find((m) => m.status === 'joined');
      if (next) g.ownerId = next.userId;
    }
  }
  /** Reports one day's number for a group. Joined members only, inside the group's dates, never in the future, clamped to a sane daily maximum. */
  report(me: string, id: string, dayKey: string, value: number): { ok: true } | SocialFail {
    const g = this.groupFor(me, id);
    if (!g || g.members.find((m) => m.userId === me)?.status !== 'joined')
      return fail('not_member');
    if (
      !DAY.test(dayKey) ||
      dayKey < g.startDay ||
      dayKey > g.endDay ||
      dayKey > day(this.now().toISOString())
    )
      return fail('closed');
    if (!Number.isFinite(value) || value < 0) return fail('invalid_input');
    const v =
      g.metric === 'active_days'
        ? value > 0
          ? 1
          : 0
        : Math.min(SOCIAL_LIMITS.maxMinutesPerDay, Math.round(value));
    g.contributions = g.contributions.filter((c) => !(c.userId === me && c.day === dayKey));
    if (v > 0) g.contributions.push({ userId: me, day: dayKey, value: v });
    return { ok: true };
  }
  /** What a member sees: usernames, each joined member's total, and the group total. Invited people see only the invitation. */
  groupView(me: string, id: string): { ok: true; view: GroupView } | SocialFail {
    const g = this.groupFor(me, id);
    if (!g) return fail('not_found');
    const mine = g.members.find((m) => m.userId === me)!;
    const base = {
      id: g.id,
      kind: g.kind,
      title: g.title,
      metric: g.metric,
      target: g.target,
      startDay: g.startDay,
      endDay: g.endDay,
      iAm: mine.status,
      isOwner: g.ownerId === me,
    };
    if (mine.status !== 'joined')
      return { ok: true, view: { ...base, members: [], total: null, byMember: [] } };
    const joined = g.members.filter((m) => m.status === 'joined');
    const totalOf = (u: string) =>
      g.contributions.filter((c) => c.userId === u).reduce((a, c) => a + c.value, 0);
    const byMember = joined
      .filter((m) => !this.blockedEitherWay(me, m.userId) || m.userId === me)
      .map((m) => ({
        username: this.dir.nameOf(m.userId) ?? '?',
        total: totalOf(m.userId),
        isMe: m.userId === me,
      }))
      .sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));
    return {
      ok: true,
      view: {
        ...base,
        members: [
          ...joined.map((m) => this.dir.nameOf(m.userId) ?? '?'),
          ...(g.ownerId === me
            ? g.members
                .filter((m) => m.status === 'invited')
                .map((m) => `${this.dir.nameOf(m.userId) ?? '?'} (invited)`)
            : []),
        ],
        total: byMember.reduce((a, m) => a + m.total, 0),
        byMember,
      },
    };
  }
  listGroups(me: string): GroupView[] {
    return this.state.groups
      .filter((g) => g.members.some((m) => m.userId === me))
      .map((g) => this.groupView(me, g.id))
      .flatMap((r) => (r.ok ? [r.view] : []))
      .sort((a, b) => b.endDay.localeCompare(a.endDay) || a.title.localeCompare(b.title));
  }

  /** Everything this engine holds about a person, removed (account deletion). */
  erase(me: string) {
    this.state.friendships = this.state.friendships.filter((f) => f.a !== me && f.b !== me);
    this.state.blocks = this.state.blocks.filter((b) => b.by !== me && b.blocked !== me);
    this.state.shares = this.state.shares.filter((s) => s.owner !== me && s.viewer !== me);
    for (const g of [...this.state.groups])
      if (g.members.some((m) => m.userId === me)) this.removeFromGroup(g, me);
  }
}

export interface GroupView {
  id: string;
  kind: GroupKind;
  title: string;
  metric: GroupMetric;
  target: number | null;
  startDay: string;
  endDay: string;
  iAm: 'invited' | 'joined';
  isOwner: boolean;
  members: string[];
  total: number | null;
  byMember: Array<{ username: string; total: number; isMe: boolean }>;
}
