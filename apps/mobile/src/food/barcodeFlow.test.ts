import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SAMPLE_PRODUCTS,
  estimateStatus,
  itemFromProduct,
  totals,
  type ProductRecord,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from '../data/mockStore';
import { resolveConfig, ConfigError } from '../lib/env';
import { createBarcodeProvider } from './barcodeProvider';
import { draftReducer, emptyDraft, newKey } from './draft';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const OATS = SAMPLE_PRODUCTS[0] as ProductRecord;

describe('which database a build may use', () => {
  it('development and review builds get the offline SYNTHETIC samples; production gets nothing', () => {
    expect(resolveConfig({}).barcodeProvider).toBe('local');
    expect(resolveConfig({ EXPO_PUBLIC_APP_ENV: 'preview' }).barcodeProvider).toBe('local');
    const prod = {
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_AUTH_MODE: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    };
    expect(resolveConfig(prod).barcodeProvider).toBe('off');
  });
  it('synthetic data can never reach production, an unknown value is refused, and Open Food Facts is opt-in only', () => {
    const prod = {
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_AUTH_MODE: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    };
    expect(() => resolveConfig({ ...prod, EXPO_PUBLIC_BARCODE_PROVIDER: 'local' })).toThrow(
      ConfigError,
    );
    expect(() => resolveConfig({ EXPO_PUBLIC_BARCODE_PROVIDER: 'banana' })).toThrow(/Unknown/);
    expect(
      resolveConfig({ ...prod, EXPO_PUBLIC_BARCODE_PROVIDER: 'open_food_facts' }).barcodeProvider,
    ).toBe('open_food_facts');
    expect(resolveConfig({ EXPO_PUBLIC_BARCODE_PROVIDER: 'off' }).barcodeProvider).toBe('off');
  });
  it('off and local never touch the network; only an enabled Open Food Facts does, and only with the barcode', async () => {
    const net = vi.fn(async () => new Response(JSON.stringify({ status: 0 })));
    const off = createBarcodeProvider({ barcodeProvider: 'off' }, net as unknown as typeof fetch);
    const local = createBarcodeProvider(
      { barcodeProvider: 'local' },
      net as unknown as typeof fetch,
    );
    expect(await off.lookup(OATS.barcode)).toEqual({ status: 'unavailable', reason: 'off' });
    expect((await local.lookup(OATS.barcode)).status).toBe('found');
    expect(net).not.toHaveBeenCalled();
    const live = createBarcodeProvider(
      { barcodeProvider: 'open_food_facts' },
      net as unknown as typeof fetch,
    );
    expect((await live.lookup('4006381333931')).status).toBe('not_found');
    expect(net).toHaveBeenCalledTimes(1);
    const [url] = net.mock.calls[0] as unknown as [string];
    expect(url).toContain('4006381333931');
    expect(new URL(url).pathname).toBe('/api/v2/product/4006381333931.json');
    expect(url).not.toMatch(/user|email|token|session|device/i);
  });
  it('the only app file that can reach Open Food Facts is the provider factory', () => {
    const root = join(import.meta.dirname, '..', '..');
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? e.name === 'node_modules'
            ? []
            : walk(join(d, e.name))
          : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)
            ? [join(d, e.name)]
            : [],
      );
    const hits = [...walk(join(root, 'src')), ...walk(join(root, 'app'))]
      .filter((f) => /openfoodfacts|createOpenFoodFactsProvider/i.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(root, ''));
    expect(hits).toEqual(['/src/food/barcodeProvider.ts']);
  });
});

describe('a scan becomes a normal, editable log entry', () => {
  it('lookup -> draft -> diary: stored as package data, no photo consent needed, numbers add up', async () => {
    const found = await createBarcodeProvider({ barcodeProvider: 'local' }).lookup(OATS.barcode);
    expect(found.status).toBe('found');
    if (found.status !== 'found') return;
    const item = itemFromProduct({ ...found.product, source: 'open_food_facts' }, 60)!;
    const draft = draftReducer(emptyDraft(new Date('2026-06-15T12:00:00Z')), { type: 'add', item });
    expect(draft.source).toBe('manual');
    expect(draft.items).toHaveLength(1);

    const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
    await s.signInDev();
    await s.setConsent('health_data_processing', true); // note: NOT the AI-photo consent
    await s.createFoodLog({
      mealType: 'snack',
      source: draft.source,
      loggedAt: '2026-06-15T12:00:00Z',
      items: draft.items.map(({ key: _k, ...i }) => i),
    });
    const logs = await s.listFoodLogs();
    expect(logs).toHaveLength(1);
    const saved = logs[0]!.items[0]!;
    expect(saved).toMatchObject({ source: 'open_food_facts', grams: 60, kcal: 270, foodId: null });
    expect(estimateStatus(saved)).toBe('reference');
    expect(totals(logs[0]!.items).kcal).toBe(270);
  });
  it('an unusable listing never becomes a log entry', () => {
    const bad = SAMPLE_PRODUCTS[4] as ProductRecord;
    expect(itemFromProduct(bad)).toBeNull();
    expect(typeof newKey()).toBe('string');
  });
});
