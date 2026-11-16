import { classifyProduct, type ProductRecord, type ProductStore } from '@dancehall/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Raw {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
export const deviceRaw: Raw = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
};

/**
 * A small list of products kept on this device for one person (their own entries, or the offline memory of earlier lookups). Damaged or unusable records are
 * dropped on read; a storage failure never breaks a lookup. Newest first, bounded.
 */
export function deviceProductStore(raw: Raw, key: string, max: number): ProductStore {
  const read = async (): Promise<ProductRecord[]> => {
    try {
      const s = await raw.get(key);
      const v: unknown = s ? JSON.parse(s) : [];
      return Array.isArray(v)
        ? (v as ProductRecord[])
            .filter(
              (p) => p && typeof p.barcode === 'string' && classifyProduct(p).status === 'found',
            )
            .slice(0, max)
        : [];
    } catch {
      return [];
    }
  };
  const write = async (list: ProductRecord[]) => {
    try {
      await raw.set(key, JSON.stringify(list.slice(0, max)));
    } catch {
      /* a convenience; never breaks the screen */
    }
  };
  return {
    async get(code) {
      return (await read()).find((p) => p.barcode === code) ?? null;
    },
    async put(p) {
      await write([p, ...(await read()).filter((x) => x.barcode !== p.barcode)]);
    },
    async remove(code) {
      await write((await read()).filter((x) => x.barcode !== code));
    },
    async list() {
      return await read();
    },
  };
}
export const myProductsKey = (userId: string) => `dh.products.mine.${userId}`;
export const memoryProductsKey = (userId: string) => `dh.products.seen.${userId}`;
