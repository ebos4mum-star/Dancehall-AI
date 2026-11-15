import { describe, expect, it } from 'vitest';
import {
  OFF_PROVIDER,
  SAMPLE_PRODUCTS,
  allergenLine,
  classifyProduct,
  createCatalogProvider,
  createOpenFoodFactsProvider,
  estimateStatus,
  itemFromProduct,
  parseBarcode,
  productFromOff,
  type ProductRecord,
} from './index';

const [OATS, YOGHURT, WATER, PARTIAL, MISLABELLED] = SAMPLE_PRODUCTS as [
  ProductRecord,
  ProductRecord,
  ProductRecord,
  ProductRecord,
  ProductRecord,
];

describe('parseBarcode', () => {
  it('accepts real EAN-13, UPC-A and EAN-8 codes and canonicalises them', () => {
    expect(parseBarcode('4006381333931')).toEqual({ code: '4006381333931', format: 'ean13' });
    expect(parseBarcode('036000291452')).toEqual({ code: '0036000291452', format: 'upca' });
    expect(parseBarcode('96385074')).toEqual({ code: '96385074', format: 'ean8' });
    expect(parseBarcode(' 4006381 333931 ')).toEqual({ code: '4006381333931', format: 'ean13' });
    expect(parseBarcode('4006-3813-33931')?.code).toBe('4006381333931');
    expect(parseBarcode('04006381333931')?.code).toBe('4006381333931'); // GTIN-14 with a leading zero
  });
  it('rejects anything that is not a valid code: wrong length, wrong check digit, letters, empty', () => {
    for (const bad of [
      '',
      '123',
      '4006381333932',
      '036000291453',
      '96385075',
      'abc4006381333931',
      '12345678901234',
      '4006381333931x',
    ])
      expect(parseBarcode(bad), bad).toBeNull();
  });
  it('UPC-A and its EAN-13 form are the same product', () => {
    expect(parseBarcode('036000291452')!.code).toBe(parseBarcode('0036000291452')!.code);
  });
});

describe('classifyProduct: never repairs or guesses a number', () => {
  it('accepts complete, consistent products (including zero-energy water)', () => {
    for (const p of [OATS, YOGHURT, WATER]) expect(classifyProduct(p).status, p.name).toBe('found');
  });
  it('a product with no energy value is incomplete, with a reason', () => {
    const r = classifyProduct({ ...OATS, per100g: { proteinG: 7 } });
    expect(r.status).toBe('incomplete');
    expect(r.status === 'incomplete' && r.problems.join(' ')).toMatch(/no energy value/);
  });
  it('impossible or inconsistent values are incomplete, not corrected', () => {
    expect(classifyProduct({ ...OATS, per100g: { kcal: 1200 } }).status).toBe('incomplete');
    expect(classifyProduct({ ...OATS, per100g: { kcal: 100, fatG: -3 } }).status).toBe(
      'incomplete',
    );
    expect(
      classifyProduct({ ...OATS, per100g: { kcal: 400, proteinG: 60, carbsG: 60, fatG: 10 } })
        .status,
    ).toBe('incomplete');
    const r = classifyProduct(MISLABELLED);
    expect(r.status).toBe('incomplete');
    expect(r.status === 'incomplete' && r.problems.join(' ')).toMatch(/does not match/);
    expect(classifyProduct({ ...OATS, name: '  ' }).status).toBe('incomplete');
    expect(classifyProduct({ ...OATS, per100g: { kcal: Number.NaN } }).status).toBe('incomplete');
  });
});

describe('itemFromProduct', () => {
  it('scales per-100 g values to the serving, with an honest range and package-data confidence', () => {
    const i = itemFromProduct(OATS)!; // serving 30 g
    expect(i.grams).toBe(30);
    expect(i.kcal).toBe(135);
    expect(i.proteinG).toBe(2.1);
    expect(i.kcalLow).toBeLessThan(i.kcal);
    expect(i.kcalHigh).toBeGreaterThan(i.kcal);
    expect(i.confidence).toBe('medium');
    expect(i.userEdited).toBe(false);
    expect(i.foodId).toBeNull();
  });
  it('uses the chosen portion, defaults to 100 g with no stated serving, and never returns an unusable product', () => {
    expect(itemFromProduct(OATS, 60)!.kcal).toBe(270);
    expect(itemFromProduct({ ...OATS, servingG: null })!.grams).toBe(100);
    expect(itemFromProduct(OATS, -5)!.grams).toBe(30);
    expect(itemFromProduct(MISLABELLED)).toBeNull();
    expect(itemFromProduct({ ...OATS, per100g: {} })).toBeNull();
  });
  it('missing macros: low confidence and a wider range, and the missing values are not invented', () => {
    const full = itemFromProduct({ ...OATS, source: 'open_food_facts' })!;
    const part = itemFromProduct({ ...PARTIAL, source: 'open_food_facts' })!;
    expect(part.confidence).toBe('low');
    expect(part.proteinG + part.carbsG + part.fatG).toBe(0);
    expect(part.kcalHigh - part.kcalLow).toBeGreaterThan((full.kcalHigh - full.kcalLow) / 2);
  });
  it('is labelled as package data from Open Food Facts when it came from there, and stays editable', () => {
    const i = itemFromProduct({ ...YOGHURT, source: 'open_food_facts' })!;
    expect(i.source).toBe('open_food_facts');
    expect(estimateStatus(i)).toBe('reference');
    expect(i.name).toBe('Sample plain yoghurt (synthetic)');
    expect(itemFromProduct({ ...YOGHURT, brand: 'Acme' })!.name).toBe(
      'Sample plain yoghurt (synthetic) (Acme)',
    );
  });
});

describe('allergens are listed, never guaranteed', () => {
  it('always carries the reminder, and says nothing when none are listed', () => {
    expect(allergenLine(OATS)).toBe('Listed allergens: gluten, milk. Always read the package.');
    expect(allergenLine(WATER)).toBeNull();
    expect(allergenLine({})).toBeNull();
  });
});

describe('catalog provider (offline, synthetic)', () => {
  const p = createCatalogProvider(SAMPLE_PRODUCTS);
  it('finds a product by any form of its code, passes incomplete ones through, and reports unknowns', async () => {
    const found = await p.lookup(OATS.barcode);
    expect(found.status).toBe('found');
    expect((await p.lookup(` ${OATS.barcode} `)).status).toBe('found');
    expect((await p.lookup(MISLABELLED.barcode)).status).toBe('incomplete');
    expect((await p.lookup('4006381333931')).status).toBe('not_found');
    expect((await p.lookup('not a code')).status).toBe('not_found');
  });
  it('every shipped sample is clearly synthetic', () => {
    for (const s of SAMPLE_PRODUCTS) {
      expect(s.name).toMatch(/\(synthetic\)/);
      expect(parseBarcode(s.barcode), s.barcode).not.toBeNull();
      expect(s.barcode.startsWith('999')).toBe(true);
    }
  });
});

describe('the off switch', () => {
  it('with no provider enabled every lookup is "unavailable (off)" and nothing is requested', async () => {
    expect(await OFF_PROVIDER.lookup(OATS.barcode)).toEqual({
      status: 'unavailable',
      reason: 'off',
    });
  });
});

describe('Open Food Facts adapter (fake network only; never called live)', () => {
  const ok = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const make = (f: typeof fetch, extra: Record<string, unknown> = {}) =>
    createOpenFoodFactsProvider({ fetchImpl: f, userAgent: 'DanceHallFit-test/0.0', ...extra });
  const body = {
    status: 1,
    product: {
      product_name: 'Test oat bar',
      brands: 'Acme, Other',
      serving_quantity: '40',
      allergens_tags: ['en:gluten', 'en:tree-nuts'],
      nutriments: {
        'energy-kcal_100g': 420,
        proteins_100g: 8,
        carbohydrates_100g: 60,
        fat_100g: 15,
      },
    },
  };

  it('maps a product, takes the first brand and the serving, and tidies allergen tags', async () => {
    const r = await make(ok(body)).lookup('4006381333931');
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.product).toMatchObject({
      barcode: '4006381333931',
      name: 'Test oat bar',
      brand: 'Acme',
      servingG: 40,
      allergens: ['gluten', 'tree nuts'],
      source: 'open_food_facts',
    });
    expect(r.product.per100g).toEqual({ kcal: 420, proteinG: 8, carbsG: 60, fatG: 15 });
  });
  it('sends only the barcode and an app User-Agent: no cookies, no credentials, nothing about the person', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const f = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    await make(f).lookup('036000291452'); // UPC-A is sent in its EAN-13 form
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/0036000291452\.json\?fields=/,
    );
    expect(seen[0]!.init?.headers).toEqual({
      'User-Agent': 'DanceHallFit-test/0.0',
      Accept: 'application/json',
    });
    expect(seen[0]!.init?.credentials).toBeUndefined();
  });
  it('converts a kilojoule-only energy value, and treats unreadable values as unknown, never as numbers', async () => {
    const kj = await make(
      ok({ status: 1, product: { product_name: 'KJ item', nutriments: { energy_100g: 1000 } } }),
    ).lookup('4006381333931');
    expect(kj.status).toBe('found');
    expect(kj.status === 'found' && Math.round(kj.product.per100g.kcal!)).toBe(239);
    const bad = await make(
      ok({
        status: 1,
        product: { product_name: 'Odd', nutriments: { 'energy-kcal_100g': 'lots' } },
      }),
    ).lookup('4006381333931');
    expect(bad.status).toBe('incomplete');
    expect(
      productFromOff('4006381333931', { nutriments: 'nope', allergens_tags: 'nope' }).per100g,
    ).toEqual({
      kcal: undefined,
      proteinG: undefined,
      carbsG: undefined,
      fatG: undefined,
    });
  });
  it('unknown products, bad codes, server errors, network failures and timeouts are all handled without throwing', async () => {
    expect((await make(ok({ status: 0 })).lookup('4006381333931')).status).toBe('not_found');
    expect((await make(ok({}, 404)).lookup('4006381333931')).status).toBe('not_found');
    expect(await make(ok({}, 500)).lookup('4006381333931')).toEqual({
      status: 'unavailable',
      reason: 'error',
    });
    expect(
      await make((async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch).lookup('4006381333931'),
    ).toEqual({ status: 'unavailable', reason: 'network' });
    let called = false;
    const never = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    expect((await make(never).lookup('12345')).status).toBe('not_found');
    expect(called).toBe(false); // an invalid code never leaves the device
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_res, rej) =>
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))),
      )) as unknown as typeof fetch;
    expect(await make(hang, { timeoutMs: 20 }).lookup('4006381333931')).toEqual({
      status: 'unavailable',
      reason: 'network',
    });
  });
  it('carries the Open Food Facts credit', () => {
    expect(make(ok({})).attribution).toMatch(/Open Food Facts/);
  });
});
