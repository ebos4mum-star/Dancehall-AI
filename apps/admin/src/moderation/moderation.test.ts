import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLiveModerationApi, ModerationError } from './api';
import { createDemoModerationApi, demoQueue } from './demo';
import { ItemCard } from './ItemCard';
import {
  backlogStatus,
  isOverdue,
  playbookFor,
  sortQueue,
  validateRestriction,
  type Backlog,
  type QueueItem,
} from './model';
import { createStaffAuth } from './staffAuth';

const item = (o: Partial<QueueItem> = {}): QueueItem => ({
  id: 'i1',
  targetType: 'post',
  author: 'ama_dances',
  body: 'hello',
  status: 'held',
  flags: [],
  reasons: [],
  reportCount: 0,
  urgent: false,
  ageHours: 2,
  createdAt: '2026-12-01T10:00:00Z',
  media: [],
  ...o,
});
const backlog = (o: Partial<Backlog> = {}): Backlog => ({
  open: 3,
  urgent: 0,
  media: 1,
  oldestHours: 5,
  oldestUrgentHours: 0,
  urgentOverTarget: 0,
  overTarget: 0,
  urgentTargetHours: 4,
  targetHours: 48,
  ...o,
});

describe('queue rules', () => {
  it('puts urgent first, then reported, then the oldest', () => {
    const q = sortQueue([
      item({ id: 'a', ageHours: 50 }),
      item({ id: 'b', ageHours: 1, urgent: true }),
      item({ id: 'c', ageHours: 3, reportCount: 2 }),
      item({ id: 'd', ageHours: 70 }),
    ]);
    expect(q.map((i) => i.id)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('knows when an item is past its target', () => {
    expect(isOverdue(item({ urgent: true, ageHours: 5 }))).toBe(true);
    expect(isOverdue(item({ urgent: true, ageHours: 3 }))).toBe(false);
    expect(isOverdue(item({ ageHours: 49 }))).toBe(true);
    expect(isOverdue(item({ ageHours: 47 }))).toBe(false);
  });
  it('headlines the backlog, with overdue urgent items first', () => {
    expect(backlogStatus(backlog({ open: 0, media: 0 })).level).toBe('clear');
    expect(backlogStatus(backlog()).level).toBe('ok');
    expect(backlogStatus(backlog({ overTarget: 2 })).level).toBe('attention');
    expect(backlogStatus(backlog({ urgent: 1 })).level).toBe('attention');
    const o = backlogStatus(backlog({ urgent: 2, urgentOverTarget: 1, overTarget: 4 }));
    expect(o.level).toBe('overdue');
    expect(o.headline).toMatch(/urgent/);
  });
});

describe('procedures', () => {
  it('treats a self-harm report as urgent, with no contact outside the app and an escalation step', () => {
    const p = playbookFor(item({ reasons: ['self_harm'] }));
    expect(p.urgent).toBe(true);
    const text = p.steps.join(' ');
    expect(text).toMatch(/Do not contact the member outside the app/);
    expect(text).toMatch(/escalation/i);
    expect(text).toMatch(/Do not approve/);
  });
  it('treats private information as urgent and never to be copied', () => {
    const p = playbookFor(item({ reasons: ['private_information'] }));
    expect(p.urgent).toBe(true);
    expect(p.steps.join(' ')).toMatch(/Never copy/);
  });
  it('gives photo and video review a checklist that errs on removal', () => {
    const p = playbookFor(
      item({ flags: ['media_review'], media: [{ kind: 'photo', role: 'single', uri: 'x' }] }),
    );
    expect(p.steps.join(' ')).toMatch(/every photo and video/);
    expect(p.steps.join(' ')).toMatch(/If unsure, remove/);
  });
  it('never asks a moderator to edit a member’s words', () => {
    expect(playbookFor(item({ flags: ['weight_claim'] })).steps.join(' ')).toMatch(/Do not edit/);
  });
});

describe('restrictions', () => {
  it('needs a reason, a sensible length, and a note for a suspension', () => {
    expect(validateRestriction({ restriction: 'muted', hours: 24 })).toMatch(/reason/);
    expect(validateRestriction({ restriction: 'muted', hours: 0, reason: 'spam' })).toMatch(
      /length/,
    );
    expect(validateRestriction({ restriction: 'muted', hours: 24, reason: 'spam' })).toBeNull();
    expect(
      validateRestriction({ restriction: 'suspended', hours: null, reason: 'harassment' }),
    ).toMatch(/note/);
    expect(
      validateRestriction({
        restriction: 'suspended',
        hours: null,
        reason: 'harassment',
        note: 'repeated abuse',
      }),
    ).toBeNull();
    expect(validateRestriction({ restriction: 'none' })).toBeNull();
  });
});

describe('what a moderator sees', () => {
  it('shows the username, the content and the procedure, and no identifiers', () => {
    const html = renderToStaticMarkup(
      createElement(ItemCard, {
        item: item({
          reasons: ['harassment'],
          reportCount: 2,
          media: [{ kind: 'photo', role: 'single', uri: 'https://signed.example/x.jpg?t=1' }],
        }),
      }),
    );
    expect(html).toContain('@ama_dances');
    expect(html).toContain('Procedure: Harassment');
    expect(html).toContain('https://signed.example/x.jpg');
    expect(html).not.toMatch(/user_id|email|@example/);
  });
  it('escapes member text instead of rendering it as markup', () => {
    const html = renderToStaticMarkup(
      createElement(ItemCard, {
        item: item({ body: '<script>alert(1)</script><img src=x onerror=alert(2)>' }),
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
  it('marks urgent items clearly', () => {
    expect(
      renderToStaticMarkup(createElement(ItemCard, { item: item({ urgent: true, ageHours: 9 }) })),
    ).toMatch(/URGENT[\s\S]*|past target/);
  });
});

describe('live API client', () => {
  const mk = (reply: unknown, token: string | null = 'tok') => {
    const calls: Array<{ url: string; auth: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (
      url: string,
      init: { headers: Record<string, string>; body: string },
    ) => {
      calls.push({ url, auth: init.headers.authorization!, body: JSON.parse(init.body) });
      return { json: async () => reply };
    }) as unknown as typeof fetch;
    return {
      api: createLiveModerationApi({
        baseUrl: 'https://p.supabase.co/',
        publishableKey: 'pk',
        getToken: async () => token,
        fetchImpl,
      }),
      calls,
    };
  };
  it('sends only the staff token and refuses to call without one', async () => {
    const t = mk({ ok: true, items: [] });
    await t.api.queue();
    expect(t.calls[0]).toMatchObject({
      url: 'https://p.supabase.co/functions/v1/community/mod/queue',
      auth: 'Bearer tok',
    });
    await expect(mk({ ok: true }, null).api.queue()).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
  it('turns refusals into friendly messages without server text', async () => {
    const t = mk({ ok: false, code: 'forbidden', message: 'internal detail' });
    await expect(t.api.backlog()).rejects.toThrow(/second factor/);
    await expect(mk({ ok: false, code: 'weird' }).api.queue()).rejects.toBeInstanceOf(
      ModerationError,
    );
  });
  it('changes the mode through the server', async () => {
    const t = mk({ ok: true });
    await t.api.setMode('text_only', 'busy');
    expect(t.calls[0]).toMatchObject({
      url: expect.stringContaining('/mod/mode'),
      body: { mode: 'text_only', note: 'busy' },
    });
  });
  it('sends actions with the target, not the author’s account', async () => {
    const t = mk({ ok: true });
    await t.api.act({ type: 'post', targetId: 'p1', action: 'remove', note: 'unsafe' });
    await t.api.restrict({
      username: 'ama_dances',
      restriction: 'muted',
      hours: 24,
      reason: 'spam',
    });
    expect(t.calls[0]!.body).toEqual({
      type: 'post',
      targetId: 'p1',
      action: 'remove',
      note: 'unsafe',
    });
    expect(t.calls[1]!.body).toMatchObject({
      username: 'ama_dances',
      restriction: 'muted',
      hours: 24,
      reason: 'spam',
    });
  });
});

describe('demo API', () => {
  it('uses made-up content only and removes handled items', async () => {
    const d = createDemoModerationApi();
    expect(d.kind).toBe('demo');
    const q = await d.queue();
    expect(q.every((i) => i.author.startsWith('demo_') && i.id.startsWith('demo-'))).toBe(true);
    await d.act({ type: 'post', targetId: q[0]!.id, action: 'approve' });
    expect((await d.queue()).length).toBe(demoQueue().length - 1);
  });
});

describe('staff sign-in', () => {
  const flow = (over: Record<string, unknown> = {}) => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      const path = url.split('/auth/v1')[1]!;
      calls.push(path);
      const body = (over[path] ?? over['*']) as { ok?: boolean; json?: unknown } | undefined;
      return { ok: body?.ok ?? true, json: async () => body?.json ?? {} };
    }) as unknown as typeof fetch;
    return {
      auth: createStaffAuth({ url: 'https://p.supabase.co', publishableKey: 'pk', fetchImpl }),
      calls,
    };
  };
  const factors = { user: { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] } };
  it('needs a password, then an authenticator code, and only then gives a token', async () => {
    const t = flow({
      '/token?grant_type=password': { json: { access_token: 'aal1-token', ...factors } },
      '/factors/f1/challenge': { json: { id: 'c1' } },
      '/factors/f1/verify': { json: { access_token: 'aal2-token' } },
    });
    expect(await t.auth.signIn('s@example.test', 'pw')).toEqual({
      step: 'second_factor',
      factorId: 'f1',
    });
    expect(await t.auth.verifyCode('f1', 'abc')).toEqual({ step: 'failed' });
    expect(await t.auth.verifyCode('f1', '123456')).toEqual({ step: 'ready' });
    expect(await t.auth.getToken()).toBe('aal2-token');
    t.auth.signOut();
    expect(await t.auth.getToken()).toBeNull();
  });
  it('stays locked when the account has no verified second factor, and says nothing more', async () => {
    const t = flow({
      '/token?grant_type=password': { json: { access_token: 'aal1-token', user: { factors: [] } } },
    });
    expect(await t.auth.signIn('s@example.test', 'pw')).toEqual({ step: 'failed' });
    expect(await t.auth.getToken()).toBeNull();
  });
  it('fails the same way for a wrong password and a network error', async () => {
    expect(
      await flow({ '/token?grant_type=password': { ok: false } }).auth.signIn('a@b.c', 'x'),
    ).toEqual({ step: 'failed' });
    const down = createStaffAuth({
      url: 'https://p.test',
      publishableKey: 'k',
      fetchImpl: (async () => {
        throw new Error('x');
      }) as unknown as typeof fetch,
    });
    expect(await down.signIn('a@b.c', 'x')).toEqual({ step: 'failed' });
  });
  it('never keeps the aal1 token as a usable session', async () => {
    const t = flow({
      '/token?grant_type=password': { json: { access_token: 'aal1-token', ...factors } },
      '/factors/f1/challenge': { json: { id: 'c1' } },
      '/factors/f1/verify': { ok: false },
    });
    await t.auth.signIn('s@example.test', 'pw');
    expect(await t.auth.getToken()).toBeNull(); // the password-only token is never offered
    expect(await t.auth.verifyCode('f1', '000000')).toEqual({ step: 'failed' });
    expect(await t.auth.getToken()).toBeNull();
  });
});
