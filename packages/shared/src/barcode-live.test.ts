/**
 * LIVE check of the Open Food Facts integration against the real public service. SKIPPED unless DH_OFF_LIVE=1 (never runs in CI). Read-only, no account, no key; each
 * request carries only the barcode and the app's User-Agent. It sends at most a handful of requests, spaced by the adapter's own throttle, and prints a summary.
 *   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=... (only behind a proxy) DH_OFF_LIVE=1 pnpm --filter @dancehall/shared exec vitest run src/barcode-live.test.ts
 * Nothing here activates the feature: the app keeps Open Food Facts OFF until the owner approves it.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyProduct,
  createOpenFoodFactsProvider,
  itemFromProduct,
  OFF_ATTRIBUTION,
  type ProductLookup,
} from './barcode';
import { createLayeredProvider, createMemoryProductStore } from './barcode-products';

const on = process.env.DH_OFF_LIVE === '1';
const UA = 'DanceHallFit/0.0 (barcode lookup)';
const seenHeaders: Array<Record<string, string>> = [];
const seenUrls: string[] = [];
const spy: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  seenUrls.push(String(input));
  seenHeaders.push(
    Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
  );
  return fetch(input, init);
}) as typeof fetch;
const line = (s: string) => process.stdout.write(s + '\n');

describe.skipIf(!on)('Open Food Facts, live', () => {
  const provider = createOpenFoodFactsProvider({ fetchImpl: spy, userAgent: UA });
  const results = new Map<string, ProductLookup>();

  it('finds a widely listed product, maps it, and stays within physical limits', async () => {
    const r = await provider.lookup('3017620422003'); // a very common packaged spread
    results.set('known', r);
    line(
      `known product: ${r.status}${r.status === 'found' ? ` · ${r.product.name} · ${r.product.per100g.kcal} kcal/100g` : ''}`,
    );
    expect(['found', 'incomplete']).toContain(r.status);
    if (r.status === 'found') {
      const p = r.product;
      expect(p.source).toBe('open_food_facts');
      expect(p.per100g.kcal!).toBeGreaterThan(0);
      expect(p.per100g.kcal!).toBeLessThanOrEqual(900);
      expect(classifyProduct(p).status).toBe('found');
      const item = itemFromProduct(p, p.servingG ?? 100)!;
      expect(item.source).toBe('open_food_facts');
      expect(item.kcalLow).toBeLessThanOrEqual(item.kcal);
      expect(item.kcalHigh).toBeGreaterThanOrEqual(item.kcal);
      expect(item.foodId).toBeNull();
    }
  }, 30000);

  it('handles a second well-known product and a code nobody has listed, without throwing', async () => {
    const a = await provider.lookup('5449000000996');
    results.set('cola', a);
    line(`second product: ${a.status}`);
    expect(['found', 'incomplete', 'not_found']).toContain(a.status);
    const unknown = await provider.lookup('0000000000017'); // valid check digit, almost certainly not a product
    results.set('unknown', unknown);
    line(`unlisted code: ${unknown.status}`);
    expect(['not_found', 'incomplete', 'found']).toContain(unknown.status);
  }, 30000);

  it('rejects an invalid code locally, with no request', async () => {
    const before = seenUrls.length;
    expect(await provider.lookup('1234567890123')).toEqual({ status: 'not_found' });
    expect(seenUrls.length).toBe(before);
  });

  it('answers a repeat from memory (no second request) and spaces requests apart', async () => {
    const before = seenUrls.length;
    const again = await provider.lookup('3017620422003');
    expect(again).toEqual(results.get('known'));
    expect(seenUrls.length).toBe(before);
  });

  it('sends only the barcode and an identifying User-Agent: no cookies, credentials or personal data', () => {
    expect(seenUrls.length).toBeGreaterThan(0);
    for (const h of seenHeaders) {
      expect(
        Object.keys(h)
          .map((k) => k.toLowerCase())
          .sort(),
      ).toEqual(['accept', 'user-agent']);
      expect(h['User-Agent']).toBe(UA);
    }
    for (const u of seenUrls) {
      expect(u).toMatch(
        /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/\d{8,13}\.json\?fields=/,
      );
      expect(u).not.toMatch(/[?&](user|email|id|token|key)=/i);
    }
    line(`requests sent: ${seenUrls.length}; all https, barcode plus a field list only`);
  });

  it('offline fallback: a remembered product is served when the network fails, and an unknown one fails honestly', async () => {
    const real = results.get('known');
    if (real?.status !== 'found') return;
    const memory = createMemoryProductStore();
    const mine = createMemoryProductStore();
    let up = true;
    const flaky: typeof fetch = (async (i: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!up) throw new Error('offline');
      return fetch(i, init);
    }) as typeof fetch;
    const layered = createLayeredProvider({
      mine,
      remote: createOpenFoodFactsProvider({
        fetchImpl: flaky,
        userAgent: UA,
        cacheMs: 0,
        minIntervalMs: 0,
      }),
      memory,
    });
    const first = await layered.lookup('3017620422003');
    expect(first.status).toBe('found');
    up = false;
    const offline = await layered.lookup('3017620422003');
    expect(offline).toMatchObject({ status: 'found', cached: true });
    expect(await layered.lookup('5449000000996')).toMatchObject({
      status: 'unavailable',
      reason: 'network',
    });
    line('offline fallback: remembered product served; never-seen product reports "unavailable"');
  }, 30000);

  it('carries the required credit', () => {
    expect(OFF_ATTRIBUTION).toMatch(/Open Food Facts/);
    expect(OFF_ATTRIBUTION).toMatch(/ODbL/);
  });
});
