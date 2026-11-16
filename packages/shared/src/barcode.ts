import { kcalRange } from './nutrition';
import { energyIsPlausible } from './food-provenance';
import type { FoodItemValues } from './food';

/**
 * Packaged-food barcode support. Pure logic only: validating a scanned code, describing a product, turning it into an editable log item, and a provider port with
 * an offline catalog and an (OFF-BY-DEFAULT) Open Food Facts adapter.
 *
 * Principles:
 *  - Package data is only as good as whoever entered it. A product is never shown as verified: it is labelled package data, its energy is cross-checked against its
 *    macros, anything inconsistent or incomplete is NOT turned into a number (the person is asked to check the label or enter it themselves), and every value stays editable.
 *  - Allergens listed by a database are shown only as "listed", never as a guarantee. The person must read the package.
 *  - No data provider is contacted unless the owner switches one on in the build configuration. The offline catalog contains only clearly synthetic products.
 *  - Nothing identifying is sent: a lookup carries the product's barcode number and nothing about the person.
 */
export type BarcodeFormat = 'ean13' | 'ean8' | 'upca';
export interface ParsedBarcode {
  /** Canonical digits: 13 for EAN-13 and UPC-A (UPC-A is the EAN-13 with a leading 0), 8 for EAN-8. */
  code: string;
  format: BarcodeFormat;
}

/** GS1 check digit: weights 3,1,3,1... from the digit next to the check digit. */
function gs1Valid(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3)
    sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** Cleans a scanned or typed code and validates its length and check digit. Returns null for anything that is not a real EAN-8, UPC-A or EAN-13. */
export function parseBarcode(raw: string): ParsedBarcode | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  // A GTIN-14 that is just an EAN-13 with a leading zero.
  const d = digits.length === 14 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (![8, 12, 13].includes(d.length) || !gs1Valid(d)) return null;
  if (d.length === 8) return { code: d, format: 'ean8' };
  if (d.length === 12) return { code: `0${d}`, format: 'upca' };
  return { code: d, format: 'ean13' };
}

export type ProductSource = 'open_food_facts' | 'local_sample' | 'user_entered';
export interface ProductRecord {
  barcode: string;
  name: string;
  brand?: string | null;
  /** Typical serving in grams, when the package states one. */
  servingG?: number | null;
  /** Per 100 g. Unknown values are undefined, never guessed. */
  per100g: { kcal?: number; proteinG?: number; carbsG?: number; fatG?: number };
  /** As listed by the data source. Shown with a reminder to read the package; never a guarantee. */
  allergens?: string[];
  source: ProductSource;
}

export type ProductLookup =
  /** `cached` means the answer came from this device's earlier lookup because the database could not be reached; the screen says so. */
  | { status: 'found'; product: ProductRecord; cached?: boolean }
  /** The product exists but its numbers cannot be trusted or are missing: no value is produced. `problems` says why, in plain words. */
  | { status: 'incomplete'; product: ProductRecord; problems: string[] }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: 'off' | 'network' | 'error' | 'rate_limited' };

export interface ProductProvider {
  id: ProductSource | 'off';
  /** Credit that must be shown where this provider's data is used. */
  attribution?: string;
  lookup(code: string): Promise<ProductLookup>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Decides whether a product's numbers are usable. Never repairs or guesses a value. */
export function classifyProduct(p: ProductRecord): ProductLookup {
  const n = p.per100g;
  const problems: string[] = [];
  if (!p.name.trim()) problems.push('The product has no name.');
  if (!finite(n.kcal)) problems.push('The product has no energy value.');
  else if (n.kcal < 0 || n.kcal > 900)
    problems.push('The energy value is outside what a food can contain.');
  for (const [k, label] of [
    ['proteinG', 'protein'],
    ['carbsG', 'carbohydrate'],
    ['fatG', 'fat'],
  ] as const) {
    const v = n[k];
    if (v !== undefined && (!finite(v) || v < 0 || v > 100))
      problems.push(`The ${label} value is not possible.`);
  }
  if ((n.proteinG ?? 0) + (n.carbsG ?? 0) + (n.fatG ?? 0) > 100.5)
    problems.push('The protein, carbohydrate and fat add up to more than 100 g per 100 g.');
  if (
    problems.length === 0 &&
    finite(n.proteinG) &&
    finite(n.carbsG) &&
    finite(n.fatG) &&
    !energyIsPlausible({ kcal: n.kcal!, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG })
  )
    problems.push('The energy does not match the protein, carbohydrate and fat listed.');
  return problems.length > 0
    ? { status: 'incomplete', product: p, problems }
    : { status: 'found', product: p };
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Turns a usable product into a log item. Confidence is `medium` when all three macros are known and `low` when some are missing (missing macros count as 0 and the
 * wider range says so). The person can always change the portion or any value. Returns null when the product is not usable.
 */
export function itemFromProduct(p: ProductRecord, grams?: number): FoodItemValues | null {
  if (classifyProduct(p).status !== 'found') return null;
  const g = grams && grams > 0 ? grams : p.servingG && p.servingG > 0 ? p.servingG : 100;
  const k = g / 100;
  const n = p.per100g;
  const allMacros = finite(n.proteinG) && finite(n.carbsG) && finite(n.fatG);
  const confidence = allMacros ? 'medium' : 'low';
  const kcal = n.kcal! * k;
  const range = kcalRange(kcal, confidence);
  return {
    name: p.brand ? `${p.name} (${p.brand})` : p.name,
    foodId: null,
    grams: r1(g),
    kcal: r0(kcal),
    proteinG: r1((n.proteinG ?? 0) * k),
    carbsG: r1((n.carbsG ?? 0) * k),
    fatG: r1((n.fatG ?? 0) * k),
    kcalLow: r0(range.low),
    kcalHigh: r0(range.high),
    source: p.source === 'open_food_facts' ? 'open_food_facts' : 'user_manual',
    confidence,
    userEdited: false,
  };
}

/** A list of allergens as a sentence, always with the reminder. Empty when the source lists none (which is NOT the same as "contains none"). */
export function allergenLine(p: Pick<ProductRecord, 'allergens'>): string | null {
  const a = (p.allergens ?? []).map((x) => x.trim()).filter(Boolean);
  return a.length === 0 ? null : `Listed allergens: ${a.join(', ')}. Always read the package.`;
}

/** An offline provider over a fixed list. Used for development and tests; the shipped list is synthetic. */
export function createCatalogProvider(records: readonly ProductRecord[]): ProductProvider {
  const by = new Map(records.map((r) => [r.barcode, r]));
  return {
    id: 'local_sample',
    async lookup(code) {
      const parsed = parseBarcode(code);
      if (!parsed) return { status: 'not_found' };
      const r = by.get(parsed.code) ?? by.get(parsed.code.replace(/^0/, ''));
      return r ? classifyProduct(r) : { status: 'not_found' };
    },
  };
}

/** The provider used when none is switched on: every lookup is "unavailable (off)", and nothing leaves the device. */
export const OFF_PROVIDER: ProductProvider = {
  id: 'off',
  async lookup() {
    return { status: 'unavailable', reason: 'off' };
  },
};

export const OFF_ATTRIBUTION = 'Product data from Open Food Facts (open database, ODbL licence).';

/**
 * Open Food Facts adapter (https://world.openfoodfacts.org). OFF BY DEFAULT: it is created only when the owner enables it, after approving the licence terms and the
 * privacy note (the request reveals the barcode and the phone's IP address to a third party). Read-only, no account, no key. Not exercised against the live service. Its terms and rate limits have NOT been verified from the live documentation (see docs/OPEN_FOOD_FACTS_CHECKLIST.md): the throttle and cache below are conservative courtesy limits, not a statement of the real limits.
 */
export function createOpenFoodFactsProvider(opts: {
  fetchImpl: typeof fetch;
  /** Open Food Facts asks every app to identify itself with a descriptive User-Agent. Must not contain personal details. */
  userAgent: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Courtesy limits, kept well under any published rate limit: at least this long between requests (default 700 ms), results remembered for this long (default 10 min). */
  minIntervalMs?: number;
  cacheMs?: number;
  /**
   * Open Food Facts publishes 15 product reads a minute per IP address and reserves the right to ban an address above it. The adapter keeps to 12 in any rolling minute
   * (default) and answers "unavailable (rate_limited)" instead of sending more, so a burst of scans can never push a household behind one address over the limit.
   */
  maxPerMinute?: number;
  /** Injectable clock and delay, for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): ProductProvider {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minGap = opts.minIntervalMs ?? 700;
  const ttl = opts.cacheMs ?? 10 * 60_000;
  const cache = new Map<string, { at: number; value: ProductLookup }>();
  let last = 0;
  const maxPerMinute = opts.maxPerMinute ?? 12;
  const sent: number[] = [];
  const base = (opts.baseUrl ?? 'https://world.openfoodfacts.org').replace(/\/+$/, '');
  return {
    id: 'open_food_facts',
    attribution: OFF_ATTRIBUTION,
    async lookup(code) {
      const parsed = parseBarcode(code);
      if (!parsed) return { status: 'not_found' };
      // A product already looked up recently is answered from memory: the same barcode is never requested twice in a row.
      const hit = cache.get(parsed.code);
      if (hit && now() - hit.at < ttl) return hit.value;
      // Rolling one-minute budget, checked BEFORE anything is sent.
      while (sent.length > 0 && now() - sent[0]! >= 60_000) sent.shift();
      if (sent.length >= maxPerMinute) return { status: 'unavailable', reason: 'rate_limited' };
      const wait = last + minGap - now();
      if (wait > 0) await sleep(wait);
      last = now();
      sent.push(last);
      const remember = (value: ProductLookup): ProductLookup => {
        // Only definite answers are remembered; a network or server failure is retried next time.
        if (value.status !== 'unavailable') {
          if (cache.size >= 50) cache.delete(cache.keys().next().value as string);
          cache.set(parsed.code, { at: now(), value });
        }
        return value;
      };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
      try {
        const url = `${base}/api/v2/product/${parsed.code}.json?fields=code,product_name,brands,serving_quantity,nutriments,allergens_tags`;
        const res = await opts.fetchImpl(url, {
          headers: { 'User-Agent': opts.userAgent, Accept: 'application/json' },
          signal: ctl.signal,
        });
        if (res.status === 404) return remember({ status: 'not_found' });
        if (!res.ok) return { status: 'unavailable', reason: 'error' };
        const body = (await res.json()) as {
          status?: unknown;
          product?: Record<string, unknown>;
        };
        if (body.status !== 1 || !body.product) return remember({ status: 'not_found' });
        return remember(classifyProduct(productFromOff(parsed.code, body.product)));
      } catch {
        return { status: 'unavailable', reason: 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return finite(n) ? n : undefined;
};

/** Maps an Open Food Facts product object to a ProductRecord. Defensive: anything unexpected becomes "unknown", never a guess. */
export function productFromOff(code: string, p: Record<string, unknown>): ProductRecord {
  const n = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<
    string,
    unknown
  >;
  const kcal =
    num(n['energy-kcal_100g']) ??
    (num(n['energy_100g']) !== undefined ? num(n['energy_100g'])! / 4.184 : undefined);
  const serving = num(p.serving_quantity);
  const brand = typeof p.brands === 'string' ? (p.brands.split(',')[0]?.trim() ?? '') : '';
  return {
    barcode: code,
    name: typeof p.product_name === 'string' ? p.product_name.trim().slice(0, 120) : '',
    brand: brand ? brand.slice(0, 60) : null,
    servingG: serving && serving > 0 && serving <= 2000 ? serving : null,
    per100g: {
      kcal: kcal === undefined ? undefined : Math.round(kcal * 10) / 10,
      proteinG: num(n['proteins_100g']),
      carbsG: num(n['carbohydrates_100g']),
      fatG: num(n['fat_100g']),
    },
    allergens: Array.isArray(p.allergens_tags)
      ? (p.allergens_tags as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '))
          .slice(0, 12)
      : [],
    source: 'open_food_facts',
  };
}
