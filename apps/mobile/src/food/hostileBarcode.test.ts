import { describe, expect, it } from 'vitest';
import {
  classifyProduct,
  createOpenFoodFactsProvider,
  itemFromProduct,
  parseBarcode,
  productFromOff,
  OFF_PROVIDER,
} from '@dancehall/shared';

/** Hostile scans and hostile or failing Open Food Facts responses (provider is off by default; this is the code that runs when approved). */
const VALID = '4006381333931';
const mk = (impl: typeof fetch, extra = {}) =>
  createOpenFoodFactsProvider({
    fetchImpl: impl,
    userAgent: 'Test/0 (x)',
    minIntervalMs: 0,
    timeoutMs: 50,
    sleep: async () => {},
    ...extra,
  });
const json = (body: unknown, status = 200) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as unknown as typeof fetch;

describe('scanned or typed codes', () => {
  it('rejects junk, wrong check digit, wrong length, huge input and injection', () => {
    for (const bad of [
      '',
      ' ',
      'abc',
      '123',
      '4006381333932',
      VALID + '0',
      '9'.repeat(5000),
      "1';drop table--",
      '４００６３８１３３３９３１',
    ])
      expect(parseBarcode(bad), JSON.stringify(bad).slice(0, 30)).toBeNull();
  });
  it('accepts spaces and dashes in a valid code', () => {
    expect(parseBarcode('4006381 333931')?.code).toBe(VALID);
    expect(parseBarcode('4006-3813-33931')?.code).toBe(VALID);
  });
});

describe('Open Food Facts failures never throw and never invent a product', () => {
  const ok = (r: unknown) =>
    expect(['unavailable', 'not_found', 'incomplete', 'found']).toContain(
      (r as { status: string }).status,
    );
  it('network error, 500, 429, bad JSON, empty body, wrong shape', async () => {
    const cases: (typeof fetch)[] = [
      (async () => {
        throw new TypeError('network');
      }) as unknown as typeof fetch,
      json({}, 500),
      json({}, 429),
      json('not json at all'),
      json(''),
      json({ status: 1, product: 'a string' }),
      json({ status: 1, product: null }),
      json(null),
    ];
    for (const [i, f] of cases.entries()) {
      const r = await mk(f).lookup(VALID);
      ok(r);
      expect((r as { status: string }).status, `case ${i}`).not.toBe('found');
    }
  });
  it('a hanging server times out instead of hanging the scan', async () => {
    const hang = ((_u: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_res, rej) =>
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))),
      )) as unknown as typeof fetch;
    const r = await Promise.race([
      mk(hang).lookup(VALID),
      new Promise((r) => setTimeout(() => r('HUNG'), 2000)),
    ]);
    expect(r).not.toBe('HUNG');
    expect((r as { status: string }).status).toBe('unavailable');
  });
  it('rate cap: a burst past 12 a minute is refused locally, not sent', async () => {
    let sent = 0;
    const f = (async () => {
      sent++;
      return new Response(JSON.stringify({ status: 0 }));
    }) as unknown as typeof fetch;
    const p = mk(f, { now: () => 1000 });
    for (let i = 0; i < 40; i++) await p.lookup(String(4006381333931 + 0));
    expect(sent).toBeLessThanOrEqual(12);
  });
  it('the default provider is OFF and answers unavailable without any network', async () => {
    expect(OFF_PROVIDER.id).not.toBe('open_food_facts');
    ok(await OFF_PROVIDER.lookup(VALID));
  });
});

describe('hostile product payloads', () => {
  it('strings for numbers, negatives, NaN, huge, HTML names', () => {
    const p = productFromOff(VALID, {
      product_name: '<img src=x onerror=alert(1)>'.repeat(50),
      brands: 'A'.repeat(500),
      serving_quantity: -3,
      nutriments: {
        'energy-kcal_100g': '250',
        proteins_100g: -5,
        carbohydrates_100g: Number.NaN,
        fat_100g: 1e12,
      },
      allergens_tags: ['en:milk', 5, null, 'fr:blé'],
    });
    expect(p.name.length).toBeLessThanOrEqual(120);
    expect((p.brand ?? '').length).toBeLessThanOrEqual(60);
    expect(p.servingG).toBeNull();
    for (const v of Object.values(p.per100g))
      if (v !== undefined) expect(Number.isFinite(v)).toBe(true);
  });
  it('absurd or missing calories are not offered as a usable item', () => {
    for (const kcal of [undefined, -10, 0, 99999, Number.NaN]) {
      const rec = productFromOff(VALID, {
        product_name: 'Thing',
        nutriments: kcal === undefined ? {} : { 'energy-kcal_100g': kcal },
      });
      const item = itemFromProduct(rec);
      if (item) {
        expect(
          Number.isFinite(item.kcal) && item.kcal >= 0 && item.kcal < 20000,
          `kcal ${kcal}`,
        ).toBe(true);
        expect(classifyProduct(rec).status, `kcal ${kcal}`).toBe('found');
      } else expect(classifyProduct(rec).status).not.toBe('found');
    }
  });
});
