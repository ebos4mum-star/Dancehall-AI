import {
  classifyProduct,
  parseBarcode,
  type ProductLookup,
  type ProductProvider,
  type ProductRecord,
} from './barcode';

/**
 * The person's own products and an offline memory of earlier lookups, layered in front of any product database. Nothing here talks to the network and nothing
 * here is shared: both stores live on the device.
 *
 *  - "My products": when a scan finds nothing (or incomplete data) the person can type what the package label says. It is saved against the barcode, is always trusted
 *    first on later scans (it is their own entry), and is labelled as entered by them. It can be changed or removed at any time.
 *  - Offline memory: a product the database really returned is remembered, so scanning it again still works with no connection. It is shown as "from an earlier
 *    lookup". Failures and unknowns are never remembered.
 */
export interface ProductStore {
  get(code: string): Promise<ProductRecord | null>;
  put(p: ProductRecord): Promise<void>;
  remove(code: string): Promise<void>;
  list(): Promise<ProductRecord[]>;
}

export function createMemoryProductStore(max = 200): ProductStore {
  const m = new Map<string, ProductRecord>();
  return {
    async get(code) {
      return m.get(code) ?? null;
    },
    async put(p) {
      m.delete(p.barcode); // re-inserting moves it to the newest position
      m.set(p.barcode, p);
      while (m.size > max) m.delete(m.keys().next().value as string);
    },
    async remove(code) {
      m.delete(code);
    },
    async list() {
      return [...m.values()].reverse();
    },
  };
}

export interface UserProductInput {
  barcode: string;
  name: string;
  brand?: string | null;
  servingG?: number | null;
  /** Per 100 g, as on the label. */
  per100g: { kcal?: number; proteinG?: number; carbsG?: number; fatG?: number };
}
const clean = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Validates a label the person typed with exactly the rules a database product must pass. Never repairs a value: it explains what is wrong. */
export function userProduct(
  i: UserProductInput,
): { ok: true; product: ProductRecord } | { ok: false; problems: string[] } {
  const parsed = parseBarcode(i.barcode);
  if (!parsed) return { ok: false, problems: ['That barcode is not valid.'] };
  const serving = clean(i.servingG);
  const p: ProductRecord = {
    barcode: parsed.code,
    name: i.name.trim().slice(0, 120),
    brand: i.brand?.trim() ? i.brand.trim().slice(0, 60) : null,
    servingG: serving && serving > 0 && serving <= 2000 ? serving : null,
    per100g: {
      kcal: clean(i.per100g.kcal),
      proteinG: clean(i.per100g.proteinG),
      carbsG: clean(i.per100g.carbsG),
      fatG: clean(i.per100g.fatG),
    },
    allergens: [],
    source: 'user_entered',
  };
  const c = classifyProduct(p);
  return c.status === 'found'
    ? { ok: true, product: p }
    : {
        ok: false,
        problems: c.status === 'incomplete' ? c.problems : ['That product cannot be saved.'],
      };
}

/**
 * Lookup order: my own product, then the database (remembering a real answer), and only when the database cannot be reached an earlier remembered answer.
 * A remembered answer is re-checked before use, so a damaged record can never produce a number.
 */
export function createLayeredProvider(a: {
  mine: ProductStore;
  remote: ProductProvider;
  memory?: ProductStore;
}): ProductProvider {
  const usable = (p: ProductRecord | null): p is ProductRecord =>
    !!p && classifyProduct(p).status === 'found';
  return {
    id: a.remote.id,
    attribution: a.remote.attribution,
    async lookup(raw): Promise<ProductLookup> {
      const parsed = parseBarcode(raw);
      if (!parsed) return { status: 'not_found' };
      const own = await a.mine.get(parsed.code).catch(() => null);
      if (usable(own)) return { status: 'found', product: own };
      const r = await a.remote.lookup(parsed.code);
      if (r.status === 'found' && a.memory && r.product.source === 'open_food_facts')
        await a.memory.put(r.product).catch(() => undefined);
      if (r.status === 'unavailable' && r.reason !== 'off' && a.memory) {
        const old = await a.memory.get(parsed.code).catch(() => null);
        if (usable(old)) return { status: 'found', product: old, cached: true };
      }
      return r;
    },
  };
}
