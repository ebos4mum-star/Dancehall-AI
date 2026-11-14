import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';
import { buildDataExport } from '../privacy/export';
import { cleanQuantity, householdError, normalizeInviteCode } from '../food/householdLogic';

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
async function setup() {
  const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  return s;
}

describe('mock household', () => {
  it('starts without a household and with empty lists', async () => {
    const s = await setup();
    expect(await s.getHousehold()).toBeNull();
    expect(await s.listHouseholdMeals()).toEqual([]);
    expect(await s.listHouseholdGrocery()).toEqual([]);
  });
  it('creates one household, rejects a second, and requires one for lists', async () => {
    const s = await setup();
    expect(
      await code(s.addHouseholdMeal({ day: '2026-06-15', mealType: 'dinner', title: 'x' })),
    ).toBe('not_found');
    const h = await s.createHousehold('  Home   base ');
    expect(h).toMatchObject({ name: 'Home base', role: 'owner', memberCount: 1 });
    expect(await code(s.createHousehold('Again'))).toBe('already_in_household');
    expect(await code(s.createHousehold('   '))).toBe('already_in_household');
  });
  it('validates and manages shared meals and grocery items', async () => {
    const s = await setup();
    await s.createHousehold('Home');
    expect(
      await code(s.addHouseholdMeal({ day: 'tomorrow', mealType: 'dinner', title: 'x' })),
    ).toBe('invalid_input');
    expect(
      await code(s.addHouseholdMeal({ day: '2026-06-15', mealType: 'dinner', title: ' ' })),
    ).toBe('invalid_input');
    const m = await s.addHouseholdMeal({
      day: '2026-06-15',
      mealType: 'dinner',
      title: 'Rice and peas',
    });
    expect((await s.listHouseholdMeals()).map((x) => x.title)).toEqual(['Rice and peas']);
    await s.deleteHouseholdMeal(m.id);
    expect(await s.listHouseholdMeals()).toEqual([]);
    expect(await code(s.addHouseholdGroceryItem({ name: '' }))).toBe('invalid_input');
    expect(await code(s.addHouseholdGroceryItem({ name: 'Rice', quantity: 'x'.repeat(21) }))).toBe(
      'invalid_input',
    );
    const g = await s.addHouseholdGroceryItem({ name: 'Plantain', quantity: ' 4 ' });
    expect(g.quantity).toBe('4');
    await s.setHouseholdGroceryChecked(g.id, true);
    expect((await s.listHouseholdGrocery())[0]?.checked).toBe(true);
    expect(await code(s.setHouseholdGroceryChecked('nope', true))).toBe('not_found');
    await s.deleteHouseholdGroceryItem(g.id);
    expect(await s.listHouseholdGrocery()).toEqual([]);
  });
  it('refuses a duplicate unchecked grocery item but allows it again once ticked', async () => {
    const s = await setup();
    await s.createHousehold('Home');
    const a = await s.addHouseholdGroceryItem({ name: 'Plantain', quantity: '4' });
    expect(await code(s.addHouseholdGroceryItem({ name: '  plantain! ' }))).toBe('duplicate_item');
    expect(await s.listHouseholdGrocery()).toHaveLength(1);
    await s.setHouseholdGroceryChecked(a.id, true);
    await s.addHouseholdGroceryItem({ name: 'Plantain' });
    expect(await s.listHouseholdGrocery()).toHaveLength(2);
  });
  it('creates an invite, cannot join alone, and leaving clears the shared lists', async () => {
    const s = await setup();
    await s.createHousehold('Home');
    expect((await s.createHouseholdInvite()).length).toBe(10);
    expect(await code(s.joinHousehold('ABC'))).toBe('already_in_household');
    await s.addHouseholdGroceryItem({ name: 'Rice' });
    await s.leaveHousehold();
    expect(await s.getHousehold()).toBeNull();
    expect(await s.listHouseholdGrocery()).toEqual([]);
    expect(await code(s.joinHousehold('ABC'))).toBe('invalid_invite');
  });
  it('pauses joining after 5 incorrect codes in 15 minutes, and resumes afterwards', async () => {
    let now = new Date('2026-06-15T12:00:00Z');
    const s = new MockStore(memory(), () => now);
    await s.signInDev();
    await s.setConsent('health_data_processing', true);
    for (let i = 0; i < 5; i++)
      expect(await code(s.joinHousehold('BADCODE' + i))).toBe('invalid_invite');
    expect(await code(s.joinHousehold('BADCODE9'))).toBe('too_many_attempts');
    now = new Date('2026-06-15T12:16:00Z');
    expect(await code(s.joinHousehold('BADCODE9'))).toBe('invalid_invite');
  });
  it('is included in the data export and holds no health fields', async () => {
    const s = await setup();
    await s.createHousehold('Home');
    await s.addHouseholdGroceryItem({ name: 'Rice' });
    const e = await buildDataExport(s);
    expect(e.household).toMatchObject({ name: 'Home' });
    expect(e.householdGrocery).toHaveLength(1);
    expect(JSON.stringify(e.householdGrocery)).not.toMatch(/kcal|weight|calorie/i);
  });
  it('helpers normalise input and map database errors', () => {
    expect(normalizeInviteCode(' ab cd1 ')).toBe('ABCD1');
    expect(cleanQuantity('  ')).toBeNull();
    expect(householdError('invalid_invite').code).toBe('invalid_invite');
    expect(householdError('too_many_attempts').code).toBe('too_many_attempts');
    expect(householdError('boom').code).toBe('unknown');
  });
});
