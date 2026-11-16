import { describe, expect, it } from 'vitest';
import { createBarcodeProvider } from './barcodeProvider';

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
});
