import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID, itemFromFood } from '@dancehall/shared';
import { draftReducer, emptyDraft, unresolved, type DraftItem } from './draft';
import { fitWithin, seedFrom } from './photoMath';
import { foodEmoji } from './emoji';

const rice = itemFromFood(FOOD_BY_ID.get('white-rice')!, 150);

describe('draft reducer', () => {
  it('adds, updates and removes items with stable keys', () => {
    let d = emptyDraft(new Date(2026, 0, 1, 8));
    expect(d.mealType).toBe('breakfast');
    d = draftReducer(d, { type: 'add', item: rice });
    d = draftReducer(d, { type: 'add', item: rice });
    expect(d.items).toHaveLength(2);
    expect(d.items[0]!.key).not.toBe(d.items[1]!.key);
    const key = d.items[0]!.key;
    d = draftReducer(d, { type: 'update', key, item: { ...rice, grams: 300 } });
    expect(d.items[0]).toMatchObject({ key, grams: 300 });
    d = draftReducer(d, { type: 'remove', key });
    expect(d.items).toHaveLength(1);
    d = draftReducer(d, { type: 'mealType', mealType: 'dinner' });
    expect(d.mealType).toBe('dinner');
    expect(draftReducer(d, { type: 'clear' }).items).toHaveLength(0);
  });
  it('blocks saving while an item needs a match', () => {
    const d = draftReducer(emptyDraft(), {
      type: 'start',
      draft: {
        items: [{ ...rice, key: 'a' }, { ...rice, key: 'b', needsMatch: true } as DraftItem],
        source: 'photo',
        provider: 'mock',
      },
    });
    expect(unresolved(d).map((i) => i.key)).toEqual(['b']);
    expect(d).toMatchObject({ source: 'photo', provider: 'mock' });
  });
});

describe('photo helpers', () => {
  it('fits within 1024 px on the longest edge without enlarging', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
  it('derives a stable seed', () => {
    expect(seedFrom('file:///a.jpg')).toBe(seedFrom('file:///a.jpg'));
    expect(seedFrom('a')).not.toBe(seedFrom('b'));
  });
});

describe('food emoji', () => {
  it('falls back by category and then to a plate', () => {
    expect(foodEmoji('jollof-rice')).toBe('🍛');
    expect(foodEmoji('unknown-id', 'fruit')).toBe('🍓');
    expect(foodEmoji(null)).toBe('🍽️');
  });
});
