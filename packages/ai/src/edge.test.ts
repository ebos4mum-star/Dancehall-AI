import { describe, expect, it } from 'vitest';
import { FREE_ENTITLEMENT, type Entitlement } from '@dancehall/shared';
import { newBudget } from './budget';
import { InMemoryUsageStore, AiGateway } from './gateway';
import { InMemoryQuotaPort } from './ports';
import { MockAiProvider } from './provider';
import { MemoryRepo } from './server/memory-repo';
import type { ServerDeps } from './server/handlers';
import {
  AI_EDGE_MODELS,
  createAiEdgeHandler,
  notConfigured,
  resolveAiEdgeConfig,
  routeOf,
  ROUTES,
} from './edge';

const NOW = new Date('2026-06-17T12:00:00Z');
const free: Entitlement = FREE_ENTITLEMENT;
function setup(routes: Parameters<typeof createAiEdgeHandler>[1]['routes'] = ['coach']) {
  const repo = new MemoryRepo();
  repo.clock = () => NOW;
  repo.addUser(
    'alice',
    'tok-alice',
    ['health_data_processing', 'ai_processing_of_food_photos'],
    free,
  );
  const gateway = new AiGateway(
    new MockAiProvider(),
    new InMemoryUsageStore(),
    {
      flags: { ai_gateway: true },
      killAll: false,
      killFeatures: {},
      models: AI_EDGE_MODELS as never,
      maxOutputTokens: 800,
      now: () => NOW,
    },
    newBudget(),
    { quota: new InMemoryQuotaPort() },
  );
  const deps: ServerDeps = {
    repo,
    gateway,
    photos: { remove: async () => undefined },
    now: () => NOW,
    provider: 'mock',
  };
  const handler = createAiEdgeHandler(deps, { provider: 'mock', routes });
  const post = (
    path: string,
    body?: unknown,
    token: string | null = 'tok-alice',
    init: RequestInit = {},
  ) =>
    handler(
      new Request(`https://x.test/functions/v1/ai${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        ...init,
      }),
    );
  return { post, handler };
}
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe('the AI function never starts by default', () => {
  it('serves nothing unless AI_PROVIDER is exactly "mock"', () => {
    for (const v of [undefined, null, '', ' ', 'MOCK', 'Mock', 'true', '1', 'openai', 'anthropic'])
      expect(resolveAiEdgeConfig({ AI_PROVIDER: v })).toEqual({
        ok: false,
        reason: 'provider_not_set',
      });
  });
  it('refuses a live provider: none is implemented, so it can never be selected by accident', () => {
    expect(resolveAiEdgeConfig({ AI_PROVIDER: 'live' })).toEqual({
      ok: false,
      reason: 'live_provider_not_implemented',
    });
  });
  it('defaults to the Coach routes only; photo analysis is a separate opt-in; anything else is refused', () => {
    expect(resolveAiEdgeConfig({ AI_PROVIDER: 'mock' })).toEqual({
      ok: true,
      config: { provider: 'mock', routes: ['coach'] },
    });
    expect(resolveAiEdgeConfig({ AI_PROVIDER: 'mock', AI_ROUTES: 'coach, photo' })).toMatchObject({
      ok: true,
      config: { routes: ['coach', 'photo'] },
    });
    for (const r of ['photo,deletion', 'all', '*', 'coach;photo'])
      expect(resolveAiEdgeConfig({ AI_PROVIDER: 'mock', AI_ROUTES: r })).toEqual({
        ok: false,
        reason: 'bad_routes',
      });
  });
  it('the "not configured" answer reveals nothing', async () => {
    const r = notConfigured();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toMatch(/AI_PROVIDER|mock|config|env/i);
  });
});

describe('what the function serves', () => {
  it('the Coach messages route answers with a stored, simulated-tagged reply, behind the real consent and allowance checks', async () => {
    const { post } = setup();
    const r = await post('/v1/coach/messages', { text: 'Can you plan a 10 minute workout?' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const j = (await r.json()) as { reply?: { provider?: string } } & Record<string, unknown>;
    expect(JSON.stringify(j)).toMatch(/"provider":"mock"/);
  });
  it('the same route works with or without the function prefix', () => {
    expect(routeOf('https://x/functions/v1/ai/v1/coach/messages')).toBe('/v1/coach/messages');
    expect(routeOf('https://x/v1/coach/messages')).toBe('/v1/coach/messages');
    expect(routeOf('https://x/v1/coach/messages/')).toBe('/v1/coach/messages');
    expect(routeOf('https://x/anything')).toBe('');
  });
  it('requires a person: no token and a bad token are refused before anything runs', async () => {
    const { post } = setup();
    expect((await post('/v1/coach/messages', { text: 'hi' }, null)).status).toBe(401);
    expect((await post('/v1/coach/messages', { text: 'hi' }, 'forged')).status).toBe(401);
  });
  it('only POST is served', async () => {
    const { handler } = setup();
    expect(
      (await handler(new Request('https://x.test/functions/v1/ai/v1/coach/messages'))).status,
    ).toBe(405);
  });
  it('photo analysis is OFF unless switched on: it answers like a feature that is off (the app words that kindly), never a made-up analysis', async () => {
    const { post } = setup(['coach']);
    const r = await post('/v1/food/photo-analysis', { storagePath: 'u/p.jpg' });
    expect(r.status).toBe(503);
    expect(await code(r)).toBe('feature_disabled');
  });
  it('account-deletion routes are never exposed, whatever the configuration', async () => {
    const { post } = setup(['coach', 'photo']);
    for (const p of ['/v1/account/deletion', '/v1/account/deletion/cancel']) {
      const r = await post(p, {});
      expect(r.status).toBe(404);
      expect(await code(r)).toBe('not_found');
    }
  });
  it('unknown routes are 404', async () => {
    const { post } = setup();
    for (const p of [
      '/v1/admin/x',
      '/v1/coach',
      '/v2/coach/messages',
      '/health',
      '/v1/coach/messages/../x',
    ])
      expect((await post(p, {})).status).toBe(404);
  });
  it('every served route group is a real handler route', () => {
    expect(Object.values(ROUTES).flat().sort()).toEqual([
      '/v1/coach/messages',
      '/v1/coach/weekly-review',
      '/v1/food/photo-analysis',
    ]);
  });
});

describe('hostile requests', () => {
  it('a body that is not JSON is a 400 and is not echoed', async () => {
    const { post } = setup();
    const r = await post('/v1/coach/messages', undefined, 'tok-alice', {
      body: '{"text": <script>alert(1)</script>',
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toMatch(/script|alert/);
  });
  it('an oversized body is a 413, by header and by content', async () => {
    const { post } = setup();
    expect((await post('/v1/coach/messages', { text: 'x'.repeat(9000) })).status).toBe(413);
    const r = await post('/v1/coach/messages', undefined, 'tok-alice', {
      body: '{}',
      headers: { 'content-length': '99999', authorization: 'Bearer tok-alice' },
    });
    expect(r.status).toBe(413);
  });
  it('a message over the product limit is refused by the handler', async () => {
    const { post } = setup();
    expect((await post('/v1/coach/messages', { text: 'x'.repeat(1001) })).status).toBe(400);
  });
  it('a crisis message gets the fixed support reply, never a billable call (the gateway safety screen is still in front)', async () => {
    const { post } = setup();
    const r = await post('/v1/coach/messages', { text: 'I want to kill myself' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).toMatch(/support|someone|person/i);
  });
  it('an internal failure leaks nothing', async () => {
    const { handler } = setup();
    const boom = createAiEdgeHandler(
      {
        ...({} as ServerDeps),
        repo: {
          authenticate: async () => {
            throw new Error('select * from secret_table failed at db.internal:5432');
          },
        } as never,
      },
      { provider: 'mock', routes: ['coach'] },
    );
    void handler;
    const r = await boom(
      new Request('https://x.test/v1/coach/messages', {
        method: 'POST',
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({ text: 'hi' }),
      }),
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await r.json())).not.toMatch(/secret_table|5432|select/i);
  });
});
