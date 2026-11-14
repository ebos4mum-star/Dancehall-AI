import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';
import { buildDataExport } from '../privacy/export';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );
async function setup(consent = true, kv: KeyValue = memory()) {
  const s = new MockStore(kv, () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  if (consent) await s.setConsent('health_data_processing', true);
  return { s, kv };
}

describe('mock celebration ledger', () => {
  it('records achievements once: first write wins, repeats are harmless', async () => {
    const { s } = await setup();
    await s.recordCelebrations!([{ id: 'daily:water:2026-06-15', mode: 'full' }]);
    await s.recordCelebrations!([
      { id: 'daily:water:2026-06-15', mode: 'off' },
      { id: 'weekly:movement_minutes:2026-06-15', mode: 'gentle' },
    ]);
    expect((await s.listCelebrations!()).sort()).toEqual([
      'daily:water:2026-06-15',
      'weekly:movement_minutes:2026-06-15',
    ]);
  });
  it('needs health-data consent, like the database', async () => {
    const { s } = await setup(false);
    expect(
      await code(s.recordCelebrations!([{ id: 'daily:water:2026-06-15', mode: 'full' }])),
    ).toBe('consent_required');
  });
  it('accepts only the achievement ids and modes the database accepts (nothing about weight or food)', async () => {
    const { s } = await setup();
    for (const id of [
      'daily:weight:2026-06-15',
      'daily:calories:2026-06-15',
      'hourly:water:2026-06-15',
      'daily:water:today',
    ])
      expect(await code(s.recordCelebrations!([{ id, mode: 'full' }])), id).toBe('invalid_input');
    expect(
      await code(s.recordCelebrations!([{ id: 'daily:water:2026-06-15', mode: 'loud' as never }])),
    ).toBe('invalid_input');
    expect(await s.listCelebrations!()).toEqual([]);
  });
  it('survives a restart, and is part of the data export', async () => {
    const { s, kv } = await setup();
    await s.recordCelebrations!([{ id: 'daily:habits:2026-06-15', mode: 'full' }]);
    const s2 = new MockStore(kv, () => new Date('2026-06-15T12:00:00Z'));
    expect(await s2.listCelebrations!()).toEqual(['daily:habits:2026-06-15']);
    expect((await buildDataExport(s2)).celebrations).toEqual(['daily:habits:2026-06-15']);
  });
  it('resetting development data clears it', async () => {
    const { s } = await setup();
    await s.recordCelebrations!([{ id: 'daily:habits:2026-06-15', mode: 'full' }]);
    await s.resetDevData();
    await s.signInDev();
    expect(await s.listCelebrations!()).toEqual([]);
  });
});
