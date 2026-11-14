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
