import { describe, expect, it } from 'vitest';
import {
  createCatalogProvider,
  itemFromProduct,
  OFF_PROVIDER,
  type ProductLookup,
  type ProductProvider,
  type ProductRecord,
} from './barcode';
import { createLayeredProvider, createMemoryProductStore, userProduct } from './barcode-products';

const CODE = '4006381333931'; // a valid EAN-13
const off = (over: Partial<ProductRecord> = {}): ProductRecord => ({
  barcode: CODE,
  name: 'Oat bar',
  brand: 'Acme',
  servingG: 40,
  per100g: { kcal: 400, proteinG: 8, carbsG: 60, fatG: 14 },
  allergens: [],
  source: 'open_food_facts',
  ...over,
});
const remote = (r: ProductLookup | (() => ProductLookup)): ProductProvider & { calls: number } => {
  const p = {
    id: 'open_food_facts' as const,
    attribution: 'credit',
    calls: 0,
    async lookup() {
      p.calls++;
      return typeof r === 'function' ? r() : r;
    },
  };
  return p;
};

describe('userProduct (typing the label)', () => {
  const ok = {
    barcode: CODE,
    name: ' My granola ',
    per100g: { kcal: 450, proteinG: 10, carbsG: 60, fatG: 18 },
  };
  it("accepts a consistent label and marks it as the person's own entry", () => {
    const r = userProduct(ok);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.product).toMatchObject({
        name: 'My granola',
        source: 'user_entered',
        barcode: CODE,
      });
      // It becomes a diary item labelled as entered by the person, never as database data.
      expect(itemFromProduct(r.product, 50)).toMatchObject({ source: 'user_manual', kcal: 225 });
    }
  });
  it('explains what is wrong and never repairs a value', () => {
    for (const bad of [
      { ...ok, name: '  ' },
      { ...ok, per100g: { ...ok.per100g, kcal: undefined } },
      { ...ok, per100g: { kcal: 1200 } },
      { ...ok, per100g: { kcal: 300, proteinG: 60, carbsG: 60, fatG: 40 } },
      { ...ok, per100g: { kcal: 100, proteinG: 30, carbsG: 30, fatG: 30 } },
      { ...ok, barcode: '1234567890123' },
    ]) {
      const r = userProduct(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problems.length).toBeGreaterThan(0);
    }
  });
  it('treats NaN and absurd servings as unknown', () => {
    const r = userProduct({ ...ok, servingG: 99999, per100g: { ...ok.per100g, proteinG: NaN } });
    expect(r.ok && r.product.servingG).toBe(null);
    expect(r.ok && r.product.per100g.proteinG).toBeUndefined();
  });
});

describe('createMemoryProductStore', () => {
  it('replaces by barcode, lists newest first and keeps only the newest max', async () => {
    const s = createMemoryProductStore(2);
    await s.put(off({ barcode: '1', name: 'a' }));
    await s.put(off({ barcode: '2', name: 'b' }));
    await s.put(off({ barcode: '3', name: 'c' }));
    expect((await s.list()).map((p) => p.barcode)).toEqual(['3', '2']);
    await s.put(off({ barcode: '2', name: 'b2' }));
    expect((await s.list()).map((p) => p.name)).toEqual(['b2', 'c']);
    await s.remove('3');
    expect(await s.get('3')).toBeNull();
  });
});

describe('createLayeredProvider', () => {
  it("trusts the person's own product first and never asks the database", async () => {
    const mine = createMemoryProductStore();
    const u = userProduct({
      barcode: CODE,
      name: 'Mine',
      per100g: { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 },
    });
    if (!u.ok) throw new Error();
    await mine.put(u.product);
    const r = remote({ status: 'found', product: off() });
    const out = await createLayeredProvider({ mine, remote: r }).lookup(CODE);
    expect(out).toMatchObject({ status: 'found', product: { name: 'Mine' } });
    expect(r.calls).toBe(0);
  });
  it('uses the database, remembers a real answer, and answers from memory only when the database cannot be reached', async () => {
    const memory = createMemoryProductStore();
    const mine = createMemoryProductStore();
    let up = true;
    const r = remote(() =>
      up ? { status: 'found', product: off() } : { status: 'unavailable', reason: 'network' },
    );
    const p = createLayeredProvider({ mine, remote: r, memory });
    expect(await p.lookup(CODE)).toMatchObject({ status: 'found' });
    expect(((await p.lookup(CODE)) as { cached?: boolean }).cached).toBeUndefined();
    up = false;
    expect(await p.lookup(CODE)).toMatchObject({
      status: 'found',
      cached: true,
      product: { name: 'Oat bar' },
    });
    expect(await p.lookup('0036000291452')).toEqual({ status: 'unavailable', reason: 'network' }); // never seen: honest failure
  });
  it('never remembers or serves failures, unknowns or incomplete records', async () => {
    const memory = createMemoryProductStore();
    const mine = createMemoryProductStore();
    for (const result of [
      { status: 'not_found' },
      { status: 'unavailable', reason: 'error' },
      { status: 'incomplete', product: off(), problems: ['x'] },
    ] as ProductLookup[]) {
      await createLayeredProvider({ mine, remote: remote(result), memory }).lookup(CODE);
    }
    expect(await memory.list()).toEqual([]);
    // A damaged remembered record is re-checked and not used.
    await memory.put(off({ per100g: { kcal: 5000 } }));
    const down = remote({ status: 'unavailable', reason: 'network' });
    expect(await createLayeredProvider({ mine, remote: down, memory }).lookup(CODE)).toEqual({
      status: 'unavailable',
      reason: 'network',
    });
  });
  it('does not remember sample data or answer from memory when the provider is switched off', async () => {
    const memory = createMemoryProductStore();
    const mine = createMemoryProductStore();
    await createLayeredProvider({
      mine,
      remote: createCatalogProvider([off({ source: 'local_sample' })]),
      memory,
    }).lookup(CODE);
    expect(await memory.list()).toEqual([]);
    await memory.put(off());
    expect(
      await createLayeredProvider({ mine, remote: OFF_PROVIDER, memory }).lookup(CODE),
    ).toEqual({ status: 'unavailable', reason: 'off' });
  });
  it('a bad code is "not found" with no work done, and a failing store cannot break a lookup', async () => {
    const r = remote({ status: 'found', product: off() });
    const broken = {
      get: async () => {
        throw new Error('disk');
      },
      put: async () => {
        throw new Error('disk');
      },
      remove: async () => undefined,
      list: async () => [],
    };
    const p = createLayeredProvider({ mine: broken, remote: r, memory: broken });
    expect(await p.lookup('abc')).toEqual({ status: 'not_found' });
    expect(r.calls).toBe(0);
    expect(await p.lookup(CODE)).toMatchObject({ status: 'found' });
  });
});
