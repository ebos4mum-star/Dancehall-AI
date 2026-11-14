import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';

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
async function setup(consent = true) {
  const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  if (consent) await s.setConsent('health_data_processing', true);
  return s;
}

describe('mock habits', () => {
  it('adds, lists in creation order, and trims the name', async () => {
    const s = await setup();
    await s.addHabit('  Stretch   two minutes ');
    await s.addHabit('Walk');
    expect((await s.listHabits()).map((h) => h.name)).toEqual(['Stretch two minutes', 'Walk']);
  });
  it('needs health-data consent, like the database', async () => {
    expect(await code((await setup(false)).addHabit('Walk'))).toBe('consent_required');
  });
  it('refuses empty or over-long names', async () => {
    const s = await setup();
    expect(await code(s.addHabit('   '))).toBe('invalid_input');
    expect(await code(s.addHabit('x'.repeat(41)))).toBe('invalid_input');
  });
  it('keeps at most five active habits, and archiving frees a slot', async () => {
    const s = await setup();
    const made = [];
    for (let i = 1; i <= 5; i++) made.push(await s.addHabit(`Habit ${i}`));
    expect(await code(s.addHabit('Sixth'))).toBe('habit_limit_reached');
    await s.archiveHabit(made[0]!.id);
    expect(await code(s.addHabit('Sixth'))).toBeNull();
    expect((await s.listHabits()).map((h) => h.name)).not.toContain('Habit 1');
  });
  it('checks a day on and off, one row per habit per day', async () => {
    const s = await setup();
    const h = await s.addHabit('Walk');
    await s.setHabitDone(h.id, '2026-06-15', true);
    await s.setHabitDone(h.id, '2026-06-15', true);
    expect(await s.listHabitCheckins('2026-06-09')).toEqual([{ habitId: h.id, day: '2026-06-15' }]);
    await s.setHabitDone(h.id, '2026-06-15', false);
    expect(await s.listHabitCheckins('2026-06-09')).toEqual([]);
  });
  it('only returns check-ins from the requested day onward', async () => {
    const s = await setup();
    const h = await s.addHabit('Walk');
    await s.setHabitDone(h.id, '2026-06-01', true);
    await s.setHabitDone(h.id, '2026-06-14', true);
    expect((await s.listHabitCheckins('2026-06-10')).map((c) => c.day)).toEqual(['2026-06-14']);
  });
  it('cannot check an archived or unknown habit', async () => {
    const s = await setup();
    const h = await s.addHabit('Walk');
    await s.archiveHabit(h.id);
    expect(await code(s.setHabitDone(h.id, '2026-06-15', true))).toBe('not_found');
    expect(await code(s.setHabitDone('nope', '2026-06-15', true))).toBe('not_found');
    expect(await code(s.archiveHabit('nope'))).toBe('not_found');
  });
  it('requires sign-in and persists across a reload of the same storage', async () => {
    expect(await code(new MockStore(memory()).listHabits())).toBe('not_authenticated');
    const kv = memory();
    const a = new MockStore(kv, () => new Date('2026-06-15T12:00:00Z'));
    await a.signInDev();
    await a.setConsent('health_data_processing', true);
    await a.addHabit('Walk');
    const b = new MockStore(kv, () => new Date('2026-06-15T12:00:00Z'));
    expect((await b.listHabits()).map((h) => h.name)).toEqual(['Walk']);
  });
});
