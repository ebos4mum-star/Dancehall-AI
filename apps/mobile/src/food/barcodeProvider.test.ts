import { describe, expect, it } from 'vitest';
import { createBarcodeProvider, offProductUrl } from './barcodeProvider';

describe('the barcode provider that the build selects', () => {
  const ok = (seen: string[]) =>
    (async (_u: unknown, init?: { headers?: Record<string, string> }) => {
      seen.push(init?.headers?.['User-Agent'] ?? '');
      return new Response(JSON.stringify({ status: 0 }));
    }) as unknown as typeof fetch;
  it('identifies the app with the public support address when one is set, and never anything personal', async () => {
    const seen: string[] = [];
    await createBarcodeProvider(
      { barcodeProvider: 'open_food_facts', supportEmail: 'help@example.test' },
      ok(seen),
    ).lookup('4006381333931');
    expect(seen).toEqual(['DanceHallFit/0.0 (help@example.test)']);
    const none: string[] = [];
    await createBarcodeProvider({ barcodeProvider: 'open_food_facts' }, ok(none)).lookup(
      '4006381333931',
    );
    expect(none).toEqual(['DanceHallFit/0.0 (barcode lookup)']);
  });
  it('off and local never touch the network', async () => {
    const seen: string[] = [];
    expect(
      await createBarcodeProvider({ barcodeProvider: 'off' }, ok(seen)).lookup('4006381333931'),
    ).toEqual({ status: 'unavailable', reason: 'off' });
    expect(
      (await createBarcodeProvider({ barcodeProvider: 'local' }, ok(seen)).lookup('4006381333931'))
        .status,
    ).not.toBe('unavailable');
    expect(seen).toEqual([]);
  });
  it('builds the credit link only for a real barcode', () => {
    expect(offProductUrl('4006381333931')).toBe(
      'https://world.openfoodfacts.org/product/4006381333931',
    );
    expect(offProductUrl('abc')).toBeNull();
    expect(offProductUrl('1/../../x')).toBeNull();
  });
});

describe('the default fetch', () => {
  it('is never called with another object as `this` (a browser throws "Illegal invocation" otherwise)', async () => {
    const original = globalThis.fetch;
    const seen: unknown[] = [];
    globalThis.fetch = function (this: unknown) {
      seen.push(this);
      return Promise.resolve(new Response(JSON.stringify({ status: 0 })));
    } as unknown as typeof fetch;
    try {
      await createBarcodeProvider({ barcodeProvider: 'open_food_facts' }).lookup('4006381333931');
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toHaveLength(1);
    expect(seen[0] === undefined || seen[0] === globalThis).toBe(true);
  });
});
