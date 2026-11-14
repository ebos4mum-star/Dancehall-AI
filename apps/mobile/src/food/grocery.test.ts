import { describe, expect, it } from 'vitest';
import { buildGroceryList, groceryText } from './grocery';

describe('buildGroceryList', () => {
  it('combines the same food across days and meals', () => {
    const l = buildGroceryList([
      { foodId: 'rice', name: 'Rice', grams: 150 },
      { foodId: 'rice', name: 'Rice', grams: 120 },
      { foodId: 'beans', name: 'Beans', grams: 80 },
    ]);
    expect(l).toEqual([
      { key: 'beans', name: 'Beans', grams: 80, meals: 1 },
      { key: 'rice', name: 'Rice', grams: 270, meals: 2 },
    ]);
  });
  it('rounds up to 10 g and sorts by name', () => {
    const l = buildGroceryList([
      { foodId: 'b', name: 'Banana', grams: 101 },
      { foodId: 'a', name: 'Apple', grams: 95 },
    ]);
    expect(l.map((x) => [x.name, x.grams])).toEqual([
      ['Apple', 100],
      ['Banana', 110],
    ]);
  });
  it('matches foods without an id by name, ignoring case and spacing', () => {
    const l = buildGroceryList([
      { foodId: null, name: ' Plantain ', grams: 100 },
      { foodId: null, name: 'plantain', grams: 100 },
    ]);
    expect(l).toHaveLength(1);
    expect(l[0]!.grams).toBe(200);
  });
  it('skips empty and invalid quantities, and handles an empty plan', () => {
    expect(buildGroceryList([])).toEqual([]);
    expect(
      buildGroceryList([
        { foodId: 'x', name: 'X', grams: 0 },
        { foodId: 'y', name: 'Y', grams: NaN },
      ]),
    ).toEqual([]);
  });
  it('formats shareable text', () => {
    expect(groceryText('List', [{ key: 'a', name: 'Apple', grams: 100, meals: 1 }])).toBe(
      'List\n- Apple: 100 g',
    );
  });
});

import { clampHouseholdSize, scaleGroceryList } from './grocery';
import { readHouseholdSize, writeHouseholdSize, type SizeStore } from './household';

describe('household scaling', () => {
  const base = [{ key: 'rice', name: 'Rice', grams: 270, meals: 2 }];
  it('multiplies quantities and rounds up to 10 g, leaving the one-person list unchanged', () => {
    expect(scaleGroceryList(base, 1)).toEqual(base);
    expect(scaleGroceryList(base, 3)[0]!.grams).toBe(810);
    expect(scaleGroceryList([{ key: 'x', name: 'X', grams: 15, meals: 1 }], 2)[0]!.grams).toBe(30);
  });
  it('clamps the household size to 1-6 and ignores junk', () => {
    expect([0, 1, 4.4, 9, -3].map(clampHouseholdSize)).toEqual([1, 1, 4, 6, 1]);
    expect(clampHouseholdSize('3')).toBe(3);
    expect(clampHouseholdSize('abc')).toBe(1);
    expect(clampHouseholdSize(undefined)).toBe(1);
  });
  it('mentions the number of people in the shared text only when more than one', () => {
    expect(groceryText('Plan', [], 1)).toBe('Plan');
    expect(groceryText('Plan', [], 3)).toBe('Plan (3 people)');
  });
  const mem = (): SizeStore & { d: Map<string, string> } => {
    const d = new Map<string, string>();
    return { d, get: async (k) => d.get(k) ?? null, set: async (k, v) => void d.set(k, v) };
  };
  it('remembers the size per user on the device and survives bad data and failing storage', async () => {
    const s = mem();
    expect(await readHouseholdSize(s, 'u1')).toBe(1);
    await writeHouseholdSize(s, 'u1', 4);
    expect(await readHouseholdSize(s, 'u1')).toBe(4);
    expect(await readHouseholdSize(s, 'u2')).toBe(1);
    s.d.set('dh.household.size.u1', 'junk');
    expect(await readHouseholdSize(s, 'u1')).toBe(1);
    const bad: SizeStore = {
      get: async () => {
        throw new Error('x');
      },
      set: async () => {
        throw new Error('x');
      },
    };
    expect(await readHouseholdSize(bad, 'u')).toBe(1);
    await expect(writeHouseholdSize(bad, 'u', 2)).resolves.toBeUndefined();
  });
});
