import { describe, expect, it } from 'vitest';
import { FREE_ENTITLEMENT, type Entitlement } from '@dancehall/shared';
import { AiGateway } from '../gateway';
import { InMemoryQuotaPort } from '../ports';
import { MockAiProvider } from '../provider';
import { InMemoryUsageStore } from '../gateway';
import { newBudget } from '../budget';
import { handleHttp, runPhotoRetention, type ServerDeps } from './handlers';
import { MemoryRepo } from './memory-repo';

const pro: Entitlement = { tier: 'pro', expiresAt: '2099-01-01T00:00:00Z', source: 'admin_grant' };
const NOW = new Date('2026-06-17T12:00:00Z'); // a Wednesday
const ALL = [
  'health_data_processing',
  'ai_coach_personalization',
  'ai_processing_of_food_photos',
] as const;

function setup(over: { kill?: boolean; userPaused?: boolean; provider?: MockAiProvider } = {}) {
  const repo = new MemoryRepo();
  repo.clock = () => NOW;
  repo.addUser('alice', 'tok-alice', [...ALL], pro);
  repo.addUser('bob', 'tok-bob', ['health_data_processing'], pro);
  repo.addUser('cara', 'tok-cara', [], pro);
  const removed: string[] = [];
  const quota = new InMemoryQuotaPort();
  const gateway = new AiGateway(
    over.provider ?? new MockAiProvider(),
    new InMemoryUsageStore(),
    {
      flags: { ai_gateway: true },
      killAll: false,
      killFeatures: {},
      models: {
        food_photo: 'mock-large',
        concierge_chat: 'mock-small',
        weekly_review: 'mock-small',
      } as never,
      maxOutputTokens: 800,
      now: () => NOW,
    },
    newBudget(),
    {
      quota,
      staff: { load: async () => ({ killAll: !!over.kill, killFeatures: {} }) },
      userPause: { isPaused: async (u) => !!over.userPaused && u === 'alice' },
    },
  );
  const deps: ServerDeps = {
    repo,
    gateway,
    photos: { remove: async (p) => void removed.push(p) },
    now: () => NOW,
    provider: 'mock',
  };
  const call = (path: string, token: string | null, body?: unknown) =>
    handleHttp(deps, {
      method: 'POST',
      path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body,
    });
  return { repo, deps, call, removed };
}
const err = (r: { json: unknown }) => (r.json as { error: { code: string } }).error.code;

describe('authentication and authorization', () => {
  it('rejects missing/invalid tokens and unknown routes/methods', async () => {
    const { call, deps } = setup();
    expect((await call('/v1/coach/messages', null, { text: 'hi' })).status).toBe(401);
    expect((await call('/v1/coach/messages', 'nope', { text: 'hi' })).status).toBe(401);
    expect((await call('/v1/nothing', 'tok-alice')).status).toBe(404);
    expect(
      (await handleHttp(deps, { method: 'GET', path: '/v1/coach/messages', headers: {} })).status,
    ).toBe(404);
  });
  it('requires consent: no health-data consent, no coach; no photo consent, no photo analysis', async () => {
    const { call } = setup();
    expect(err(await call('/v1/coach/messages', 'tok-cara', { text: 'hi' }))).toBe('forbidden');
    expect(
      err(await call('/v1/food/photo-analysis', 'tok-bob', { storagePath: 'bob/a.jpg' })),
    ).toBe('forbidden');
    expect(err(await call('/v1/coach/weekly-review', 'tok-bob', {}))).toBe('forbidden');
  });
  it('validates input', async () => {
    const { call } = setup();
    expect(err(await call('/v1/coach/messages', 'tok-alice', { text: '   ' }))).toBe(
      'validation_failed',
    );
    expect(err(await call('/v1/coach/messages', 'tok-alice', { text: 'x'.repeat(1001) }))).toBe(
      'validation_failed',
    );
    expect(
      err(await call('/v1/coach/weekly-review', 'tok-alice', { weekStart: '2026-06-17' })),
    ).toBe('validation_failed');
  });
});

describe('coach chat', () => {
  it('stores both messages, uses personal data only with personalization consent', async () => {
    const { call, repo } = setup();
    const a = await call('/v1/coach/messages', 'tok-alice', {
      text: 'Give me a 10 minute workout',
    });
    expect(a.status).toBe(200);
    const b = await call('/v1/coach/messages', 'tok-bob', { text: 'Give me a 10 minute workout' });
    expect(b.status).toBe(200);
    const msgs = (r: { json: unknown }) =>
      repo.conversations.get((r.json as { conversationId: string }).conversationId)!.messages;
    expect(msgs(a).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs(a)[1]!.usedPersonalData).toBe(true);
    expect(msgs(b)[1]!.usedPersonalData).toBe(false);
  });
  it('cannot read or append to someone else’s conversation', async () => {
    const { call } = setup();
    const a = await call('/v1/coach/messages', 'tok-alice', { text: 'hello coach' });
    const id = (a.json as { conversationId: string }).conversationId;
    expect(
      err(await call('/v1/coach/messages', 'tok-bob', { text: 'hi', conversationId: id })),
    ).toBe('not_found');
  });
  it('crisis text gets the fixed safe response and is not marked personalized', async () => {
    const provider = new MockAiProvider();
    const { call, repo } = setup({ provider });
    const r = await call('/v1/coach/messages', 'tok-alice', { text: 'I want to kill myself' });
    expect(r.status).toBe(200);
    expect(provider.calls).toBe(0);
    const m = repo.conversations.get((r.json as { conversationId: string }).conversationId)!
      .messages[1]!;
    expect(m.usedPersonalData).toBe(false);
  });
  it('staff kill switch and user pause are reported separately', async () => {
    expect(
      err(
        await setup({ kill: true }).call('/v1/coach/messages', 'tok-alice', { text: 'hi there' }),
      ),
    ).toBe('feature_disabled');
    const paused = setup({ userPaused: true });
    expect(err(await paused.call('/v1/coach/messages', 'tok-alice', { text: 'hi there' }))).toBe(
      'ai_paused',
    );
    expect((await paused.call('/v1/coach/messages', 'tok-bob', { text: 'hi there' })).status).toBe(
      200,
    );
  });
  it('maps provider failure to 502 without leaking internals', async () => {
    const provider = {
      name: 'down',
      complete: async () => {
        throw new Error('secret-key-abc');
      },
    };
    const r = await setup({ provider: provider as never }).call('/v1/coach/messages', 'tok-alice', {
      text: 'hi there',
    });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain('secret-key-abc');
  });
});

describe('weekly review', () => {
  it('saves one review per week for a consented user', async () => {
    const { call, repo } = setup();
    expect((await call('/v1/coach/weekly-review', 'tok-alice', {})).status).toBe(200);
    expect(
      (await call('/v1/coach/weekly-review', 'tok-alice', { weekStart: '2026-06-15' })).status,
    ).toBe(200);
    expect(repo.reviews).toHaveLength(1);
  });
});

describe('food photo analysis and retention', () => {
  it('only reads photos from the caller’s own folder, grounds items, and schedules deletion', async () => {
    const { call, repo } = setup();
    expect(
      err(await call('/v1/food/photo-analysis', 'tok-alice', { storagePath: 'bob/a.jpg' })),
    ).toBe('forbidden');
    expect(
      err(
        await call('/v1/food/photo-analysis', 'tok-alice', { storagePath: 'alice/../bob/a.jpg' }),
      ),
    ).toBe('forbidden');
    const r = await call('/v1/food/photo-analysis', 'tok-alice', {
      storagePath: 'alice/a.jpg',
      seed: 0,
    });
    expect(r.status).toBe(200);
    expect((r.json as { items: unknown[] }).items.length).toBeGreaterThan(0);
    expect([...repo.photos.values()][0]!.status).toBe('succeeded');
  });
  it('retention deletes the file first, then marks it deleted; a storage failure is retried', async () => {
    const { call, repo, deps, removed } = setup();
    await call('/v1/food/photo-analysis', 'tok-alice', { storagePath: 'alice/a.jpg' });
    const later = { ...deps, now: () => new Date(NOW.getTime() + 2 * 86_400_000) };
    const failing = {
      ...later,
      photos: {
        remove: async () => {
          throw new Error('storage down');
        },
      },
    };
    expect(await runPhotoRetention(failing)).toEqual({ deleted: 0, failed: 1 });
    expect([...repo.photos.values()][0]!.status).toBe('succeeded');
    expect(await runPhotoRetention(later)).toEqual({ deleted: 1, failed: 0 });
    expect(removed).toEqual(['alice/a.jpg']);
    expect([...repo.photos.values()][0]).toMatchObject({ status: 'deleted', path: null });
  });
});

describe('account deletion request', () => {
  it('is idempotent, scheduled 30 days out, and cancellable', async () => {
    const { call } = setup();
    const a = await call('/v1/account/deletion', 'tok-cara');
    const b = await call('/v1/account/deletion', 'tok-cara');
    expect(a.status).toBe(202);
    expect(b.json).toEqual(a.json);
    expect((await call('/v1/account/deletion/cancel', 'tok-cara')).json).toEqual({
      cancelled: true,
    });
    expect((await call('/v1/account/deletion/cancel', 'tok-cara')).json).toEqual({
      cancelled: false,
    });
    expect((await call('/v1/account/deletion', null)).status).toBe(401);
  });
});
void FREE_ENTITLEMENT;
