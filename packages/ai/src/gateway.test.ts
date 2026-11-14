import { describe, expect, it } from 'vitest';
import { AppError, FREE_ENTITLEMENT, type Entitlement } from '@dancehall/shared';
import {
  AiGateway,
  InMemoryUsageStore,
  MockAiProvider,
  newBudget,
  reserve,
  settle,
  crossedThresholds,
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
const req = (over = {}) => ({
  userId: 'u1',
  entitlement: pro,
  feature: 'concierge_chat' as const,
  prompt: 'Suggest a 10 minute workout',
  ...over,
});
const rejects = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
};

describe('budget', () => {
  it('rejects a reservation that would cross the ceiling, counting reserved money', () => {
    const b0 = newBudget(1);
    const r1 = reserve(b0, 0.6);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(reserve(r1.budget, 0.6).ok).toBe(false); // concurrent call cannot slip through
    const b1 = settle(r1.budget, 0.6, 0.1);
    expect(b1).toMatchObject({ reservedUsd: 0, settledUsd: 0.1 });
    expect(reserve(b1, 0.6).ok).toBe(true);
  });
  it('defaults to the $50 ceiling and reports newly crossed alert thresholds', () => {
    expect(newBudget().ceilingUsd).toBe(50);
    expect(crossedThresholds(50, 20, 41)).toEqual([0.5, 0.8]);
    expect(crossedThresholds(50, 41, 42)).toEqual([]);
  });
});

describe('gateway (mock provider only)', () => {
  it('returns schema-valid output, records usage, never calls a real service', async () => {
    const provider = new MockAiProvider();
    const store = new InMemoryUsageStore();
    const g = new AiGateway(provider, store, cfg());
    const out = (await g.run(req())) as { proposedChanges: unknown[] };
    expect(out.proposedChanges.length).toBeGreaterThan(0);
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toMatchObject({ outcome: 'ok', feature: 'concierge_chat' });
    expect(g.budget.settledUsd).toBeGreaterThan(0);
  });
  it('honours the global and per-feature kill switches without calling the provider', async () => {
    const p = new MockAiProvider();
    await rejects(
      new AiGateway(p, new InMemoryUsageStore(), cfg({ killAll: true })).run(req()),
      'feature_disabled',
    );
    await rejects(
      new AiGateway(
        p,
        new InMemoryUsageStore(),
        cfg({ killFeatures: { concierge_chat: true } }),
      ).run(req()),
      'feature_disabled',
    );
    expect(p.calls).toBe(0);
  });
  it('refuses when the feature flag is off', async () => {
    await rejects(
      new AiGateway(new MockAiProvider(), new InMemoryUsageStore(), cfg({ flags: {} })).run(req()),
      'feature_disabled',
    );
  });
  it('enforces tier allowances', async () => {
    const g = new AiGateway(new MockAiProvider(), new InMemoryUsageStore(), cfg());
    await g.run(req({ entitlement: FREE_ENTITLEMENT, feature: 'weekly_review' })); // free allows 1 per month
    await rejects(
      g.run(req({ entitlement: FREE_ENTITLEMENT, feature: 'weekly_review' })),
      'quota_exceeded',
    );
  });
  it('automatically rejects new requests once the budget is exhausted', async () => {
    const p = new MockAiProvider();
    const g = new AiGateway(p, new InMemoryUsageStore(), cfg(), newBudget(0.0001));
    await rejects(g.run(req()), 'budget_exhausted');
    expect(p.calls).toBe(0);
  });
  it('fires alerts as spend crosses thresholds', async () => {
    const seen: number[] = [];
    const g = new AiGateway(
      new MockAiProvider(),
      new InMemoryUsageStore(),
      cfg({ maxOutputTokens: 150, onAlert: (t) => seen.push(t) }),
      newBudget(0.0012),
    );
    await g.run(req());
    expect(seen).toEqual([0.5]);
  });
  it('rejects malformed model output and still records the cost', async () => {
    const store = new InMemoryUsageStore();
    const g = new AiGateway(new MockAiProvider({ concierge_chat: { nope: true } }), store, cfg());
    await rejects(g.run(req()), 'upstream_failure');
    expect(store.events[0]?.outcome).toBe('schema_rejected');
    expect(store.events[0]?.costUsd).toBeGreaterThan(0);
  });
  it('rejects guilt-based language in model output', async () => {
    const bad = {
      highlights: ['You failed this week, lazy'],
      nonScaleWins: [],
      suggestions: [],
      tone: 'encouraging',
    };
    const g = new AiGateway(
      new MockAiProvider({ weekly_review: bad }),
      new InMemoryUsageStore(),
      cfg(),
    );
    await rejects(g.run(req({ feature: 'weekly_review' })), 'upstream_failure');
  });
  it('rejects a food-photo response that is not marked as an estimate', async () => {
    const notEstimate = { isEstimate: false, items: [] };
    const g = new AiGateway(
      new MockAiProvider({ food_photo: notEstimate }),
      new InMemoryUsageStore(),
      cfg(),
    );
    await rejects(g.run(req({ feature: 'food_photo', hasImage: true })), 'upstream_failure');
  });
  it('routes risk signals to support without a billable call', async () => {
    const p = new MockAiProvider();
    const store = new InMemoryUsageStore();
    const out = (await new AiGateway(p, store, cfg()).run(
      req({ prompt: "I'm starving myself" }),
    )) as { supportReferral: boolean };
    expect(out.supportReferral).toBe(true);
    expect(p.calls).toBe(0);
    expect(store.events[0]?.outcome).toBe('risk_referral');
  });
});

import { CURATED_FOODS, matchReference } from '@dancehall/shared';
import { MOCK_MEAL_TEMPLATES, mockFoodPhotoResponse, foodPhotoResponseSchema } from './index';

describe('simulated food recognition (mock only)', () => {
  it('returns several foods with portion ranges, schema-valid, labeled as a simulation', () => {
    for (let seed = 0; seed < 12; seed++) {
      const r = foodPhotoResponseSchema.parse(mockFoodPhotoResponse(`mock-seed:${seed}`));
      expect(r.items.length).toBeGreaterThanOrEqual(4);
      expect(r.notes).toMatch(/not real image analysis/i);
      for (const i of r.items) expect(i.gramsHigh).toBeGreaterThan(i.gramsLow);
    }
  });
  it('is deterministic per seed and varies across seeds', () => {
    expect(mockFoodPhotoResponse('mock-seed:2')).toEqual(mockFoodPhotoResponse('mock-seed:2'));
    expect(JSON.stringify(mockFoodPhotoResponse('mock-seed:0'))).not.toBe(
      JSON.stringify(mockFoodPhotoResponse('mock-seed:1')),
    );
  });
  it('every template food exists in the reference data, and one seed simulates an unmatched item', () => {
    const ids = new Set(CURATED_FOODS.map((f) => f.id));
    for (const t of MOCK_MEAL_TEMPLATES)
      for (const i of t.items) expect(ids.has(i.id), i.id).toBe(true);
    const r = foodPhotoResponseSchema.parse(mockFoodPhotoResponse('mock-seed:3'));
    expect(r.items.some((i) => matchReference(i.referenceQuery) === null)).toBe(true);
  });
  it('runs through the gateway with metering and quota (free tier allows 5 a month)', async () => {
    const store = new InMemoryUsageStore();
    const g = new AiGateway(new MockAiProvider(), store, cfg());
    for (let i = 0; i < 5; i++)
      await g.run({
        userId: 'u9',
        entitlement: FREE_ENTITLEMENT,
        feature: 'food_photo',
        prompt: `mock-seed:${i}`,
        hasImage: true,
      });
    expect(
      store.events.filter((e) => e.feature === 'food_photo' && e.outcome === 'ok'),
    ).toHaveLength(5);
    await rejects(
      g.run({
        userId: 'u9',
        entitlement: FREE_ENTITLEMENT,
        feature: 'food_photo',
        prompt: 'mock-seed:9',
        hasImage: true,
      }),
      'quota_exceeded',
    );
  });
});
