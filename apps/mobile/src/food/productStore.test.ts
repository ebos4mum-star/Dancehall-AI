import { describe, expect, it } from 'vitest';
import { createLayeredProvider, userProduct, type ProductProvider } from '@dancehall/shared';
import {
  deviceProductStore,
  myProductsKey,
  memoryProductsKey,
  readLookupConsent,
  writeLookupConsent,
  type Raw,
} from './productStore';

const mem = (): Raw & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
};
const CODE = '4006381333931';
const mine = (name = 'Mine') => {
  const r = userProduct({
    barcode: CODE,
    name,
    per100g: { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 },
  });
  if (!r.ok) throw new Error();
  return r.product;
};

describe('the device product store', () => {
  it('keeps products per person and key, newest first, bounded, and survives a restart', async () => {
    const raw = mem();
    const a = deviceProductStore(raw, myProductsKey('u1'), 2);
    await a.put({ ...mine('one'), barcode: '4006381333931' });
    await a.put({ ...mine('two'), barcode: '0036000291452' });
    await a.put({ ...mine('three'), barcode: '96385074' });
    expect((await a.list()).map((p) => p.name)).toEqual(['three', 'two']);
    expect((await deviceProductStore(raw, myProductsKey('u1'), 2).list()).length).toBe(2); // a new instance reads the same data
    expect(await deviceProductStore(raw, myProductsKey('u2'), 2).list()).toEqual([]); // another person sees nothing
    expect(await deviceProductStore(raw, memoryProductsKey('u1'), 2).list()).toEqual([]); // the offline memory is separate
    await a.remove('96385074');
    expect((await a.list()).map((p) => p.name)).toEqual(['two']);
  });
  it('drops damaged or unusable records and survives unreadable storage', async () => {
    const raw = mem();
    raw.data.set(
      myProductsKey('u1'),
      JSON.stringify([
        mine(),
        { barcode: CODE, name: '', per100g: {}, source: 'user_entered' },
        null,
        5,
        'x',
      ]),
    );
    expect((await deviceProductStore(raw, myProductsKey('u1'), 10).list()).length).toBe(1);
    raw.data.set(myProductsKey('u1'), '{not json');
    expect(await deviceProductStore(raw, myProductsKey('u1'), 10).list()).toEqual([]);
    const broken: Raw = {
      get: async () => {
        throw new Error('disk');
      },
      set: async () => {
        throw new Error('disk');
      },
    };
    const s = deviceProductStore(broken, 'k', 5);
    await expect(s.put(mine())).resolves.toBeUndefined();
    expect(await s.get(CODE)).toBeNull();
  });
  it('works as the layers of a lookup: a saved label is used offline, even with the database off', async () => {
    const raw = mem();
    const store = deviceProductStore(raw, myProductsKey('u1'), 50);
    const off: ProductProvider = {
      id: 'off',
      async lookup() {
        return { status: 'unavailable', reason: 'off' };
      },
    };
    const provider = createLayeredProvider({ mine: store, remote: off });
    expect(await provider.lookup(CODE)).toEqual({ status: 'unavailable', reason: 'off' });
    await store.put(mine('My granola'));
    expect(await provider.lookup(CODE)).toMatchObject({
      status: 'found',
      product: { name: 'My granola', source: 'user_entered' },
    });
  });
});

describe('lookup consent', () => {
  it('is off until the person allows it, per person, and can be withdrawn', async () => {
    const raw = mem();
    expect(await readLookupConsent(raw, 'u1')).toBe(false);
    await writeLookupConsent(raw, 'u1', true);
    expect(await readLookupConsent(raw, 'u1')).toBe(true);
    expect(await readLookupConsent(raw, 'u2')).toBe(false);
    await writeLookupConsent(raw, 'u1', false);
    expect(await readLookupConsent(raw, 'u1')).toBe(false);
  });
  it('a storage failure means "not allowed"', async () => {
    const broken: Raw = {
      get: async () => {
        throw new Error('disk');
      },
      set: async () => {
        throw new Error('disk');
      },
    };
    expect(await readLookupConsent(broken, 'u1')).toBe(false);
    await expect(writeLookupConsent(broken, 'u1', true)).resolves.toBeUndefined();
  });
});
