import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from '../data/mockStore';
import type { DataStore } from '../data/types';
import { buildDataExport, exportToText } from './export';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
async function seeded() {
  const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  await s.addWeight({ weightKg: 70 });
  await s.createSession({ title: 'Synthetic', minutes: 10, status: 'completed' });
  await s.startChallenge({ lengthDays: 7, targetDays: 3, startDate: '2026-06-15' });
  const h = await s.addHabit('Walk');
  await s.setHabitDone(h.id, '2026-06-15', true);
  return s;
}

describe('buildDataExport', () => {
  it('includes the person’s own records and a format marker', async () => {
    const d = await buildDataExport(await seeded(), new Date('2026-06-16T00:00:00Z'));
    expect(d.format).toBe('dancehall-fit-export-v1');
    expect(d.exportedAt).toBe('2026-06-16T00:00:00.000Z');
    expect(d.weights).toHaveLength(1);
    expect(d.workoutSessions).toHaveLength(1);
    expect(d.challenges).toHaveLength(1);
    expect(d.habits).toHaveLength(1);
    expect(d.habitCheckins).toHaveLength(1);
    expect(d.consents).toMatchObject({ health_data_processing: true });
  });
  it('produces valid JSON that round-trips', async () => {
    const d = await buildDataExport(await seeded());
    expect(JSON.parse(exportToText(d))).toEqual(JSON.parse(JSON.stringify(d)));
  });
  it('never includes AI budget internals, staff data or credentials', async () => {
    const text = exportToText(await buildDataExport(await seeded())).toLowerCase();
    for (const bad of ['budget', 'service_role', 'password', 'token', 'secret'])
      expect(text).not.toContain(bad);
  });
  it('fails as a whole when one part cannot be read, instead of returning a partial export', async () => {
    const s = await seeded();
    const broken = Object.create(s) as DataStore;
    broken.listFoodLogs = async () => {
      throw new Error('offline');
    };
    await expect(buildDataExport(broken)).rejects.toThrow('offline');
  });
  it('requires sign-in', async () => {
    await expect(buildDataExport(new MockStore(memory()))).rejects.toThrow();
  });
});
