import { describe, expect, it } from 'vitest';
import { AppError, type Entitlement } from '@dancehall/shared';
import {
  AiGateway,
  InMemoryBudgetPort,
  InMemoryQuotaPort,
  InMemoryUsageStore,
  MockAiProvider,
  newBudget,
  type GatewayConfig,
} from './index';

const pro: Entitlement = { tier: 'pro', expiresAt: '2099-01-01T00:00:00Z', source: 'admin_grant' };
const cfg = (over: Partial<GatewayConfig> = {}): GatewayConfig => ({
  flags: { ai_gateway: true },
  killAll: false,
  killFeatures: {},
  models: {
    food_photo: 'mock-large',
    concierge_chat: 'mock-small',
    weekly_review: 'mock-small',
  } as GatewayConfig['models'],
  maxOutputTokens: 800,
  now: () => new Date('2026-06-15T12:00:00Z'),
  ...over,
});
const req = (userId = 'u1') => ({
  userId,
  entitlement: pro,
  feature: 'concierge_chat' as const,
  prompt: 'Give me a 10 minute workout',
  userText: 'Give me a 10 minute workout',
});
const code = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof AppError ? e.code : 'other'),
  );

describe('user AI pause vs staff kill switch', () => {
  it('a user pause blocks only that user, with its own error code, and no provider call', async () => {
    const provider = new MockAiProvider();
    const g = new AiGateway(provider, new InMemoryUsageStore(), cfg(), newBudget(), {
      userPause: { isPaused: async (u) => u === 'u1' },
    });
    expect(await code(g.run(req('u1')))).toBe('ai_paused');
    expect(provider.calls).toBe(0);
    expect(await code(g.run(req('u2')))).toBe('ok');
  });
  it('the staff kill switch wins over everything, is read live, and is not a user pause', async () => {
    let kill = false;
    const g = new AiGateway(new MockAiProvider(), new InMemoryUsageStore(), cfg(), newBudget(), {
      staff: { load: async () => ({ killAll: kill, killFeatures: {} }) },
      userPause: { isPaused: async () => false },
    });
    expect(await code(g.run(req()))).toBe('ok');
    kill = true;
    expect(await code(g.run(req()))).toBe('feature_disabled');
  });
  it('a user cannot clear a kill switch by un-pausing, and pausing does not set one', async () => {
    const g = new AiGateway(new MockAiProvider(), new InMemoryUsageStore(), cfg(), newBudget(), {
      staff: { load: async () => ({ killAll: true, killFeatures: {} }) },
      userPause: { isPaused: async () => false },
    });
    expect(await code(g.run(req()))).toBe('feature_disabled');
  });
});

describe('atomic budget and quota ports', () => {
  it('concurrent requests cannot oversubscribe the budget', async () => {
    const budget = new InMemoryBudgetPort(newBudget(0.01));
    const provider = new MockAiProvider();
    const g = new AiGateway(provider, new InMemoryUsageStore(), cfg(), newBudget(), { budget });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => code(g.run(req(`u${i}`)))),
    );
    expect(results.filter((r) => r === 'ok').length).toBeLessThan(20);
    expect(results.some((r) => r === 'budget_exhausted')).toBe(true);
    expect(budget.state.settledUsd + budget.state.reservedUsd).toBeLessThanOrEqual(0.01 + 1e-9);
  });
  it('concurrent requests cannot exceed a per-user allowance, and refunds on provider failure', async () => {
    const quota = new InMemoryQuotaPort();
    const g = new AiGateway(new MockAiProvider(), new InMemoryUsageStore(), cfg(), newBudget(), {
      quota,
    });
    const results = await Promise.all(Array.from({ length: 200 }, () => code(g.run(req()))));
    const ok = results.filter((r) => r === 'ok').length;
    expect(ok).toBeGreaterThan(0);
    expect(ok).toBe(quota.counts.get('u1|2026-06|concierge_chat'));
    expect(results.filter((r) => r === 'quota_exceeded').length).toBe(200 - ok);

    const bad = new AiGateway(
      {
        name: 'bad',
        complete: async () => {
          throw new Error('down');
        },
      },
      new InMemoryUsageStore(),
      cfg(),
      newBudget(),
      { quota: new InMemoryQuotaPort() },
    );
    const q = (bad as unknown as { ports: { quota: InMemoryQuotaPort } }).ports.quota;
    expect(await code(bad.run(req()))).toBe('upstream_failure');
    expect(q.counts.get('u1|2026-06|concierge_chat')).toBe(0);
  });
  it('safe default: free tier has no paid AI allowance and the default ceiling is $50', async () => {
    expect(newBudget().ceilingUsd).toBe(50);
  });
});
