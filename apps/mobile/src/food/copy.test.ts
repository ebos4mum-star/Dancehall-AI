import { describe, expect, it } from 'vitest';
import { itemFromFood, localDateKey, FOOD_BY_ID, totals } from '@dancehall/shared';
import type { FoodLog } from '@/data/types';
import { copyDay, instantOnLocalDay, lastSimilarMeal, repeatLog } from './copy';

const rice = FOOD_BY_ID.get('white-rice')!;
const egg = FOOD_BY_ID.get('boiled-egg')!;
const log = (id: string, at: string, mealType: FoodLog['mealType'], foods = [rice]): FoodLog => ({
  id,
  loggedAt: at,
  mealType,
  source: 'manual',
  photoAnalysisId: null,
  items: foods.map((f, n) => ({ ...itemFromFood(f, 150), id: `${id}-${n}`, logId: id })),
});

describe('instantOnLocalDay', () => {
  it('lands on the requested local day in far-apart zones', () => {
    for (const tz of [
      'UTC',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
      'Africa/Accra',
      'America/Jamaica',
      'Asia/Kolkata',
    ]) {
      for (const h of [0, 8, 12, 18, 23]) {
        expect(localDateKey(instantOnLocalDay('2026-03-10', tz, h), tz), `${tz} ${h}`).toBe(
          '2026-03-10',
        );
      }
    }
  });
  it('does not throw on nonsense', () => {
    expect(() => instantOnLocalDay('nope', 'UTC')).not.toThrow();
  });
});

describe('repeatLog', () => {
  it('repeats foods and portions as a new entry with no ids, keeping estimate labels', () => {
    const src = log('a', '2026-03-09T08:00:00Z', 'breakfast', [rice, egg]);
    const r = repeatLog(src, { loggedAt: '2026-03-10T09:00:00Z' });
    expect(r.items).toHaveLength(2);
    expect(r.items.every((i) => !('id' in i) && !('logId' in i))).toBe(true);
    expect(totals(r.items).kcal).toBe(totals(src.items).kcal);
    expect(r.mealType).toBe('breakfast');
    expect(r.source).toBe('manual');
  });
  it('can change the meal type', () => {
    expect(
      repeatLog(log('a', '2026-03-09T08:00:00Z', 'breakfast'), { mealType: 'snack' }).mealType,
    ).toBe('snack');
  });
  it('does not alias the original items', () => {
    const src = log('a', '2026-03-09T08:00:00Z', 'lunch');
    const r = repeatLog(src);
    r.items[0]!.grams = 1;
    expect(src.items[0]!.grams).toBe(150);
  });
});

describe('copyDay', () => {
  const logs = [
    log('b', '2026-03-09T13:00:00Z', 'lunch'),
    log('a', '2026-03-09T08:00:00Z', 'breakfast', [egg]),
    log('c', '2026-03-08T08:00:00Z', 'breakfast'),
  ];
  it('copies one day onto another in time order and leaves the source alone', () => {
    const out = copyDay(logs, '2026-03-09', '2026-03-12', 'UTC', new Date('2026-03-20T10:00:00Z'));
    expect(out.map((o) => o.mealType)).toEqual(['breakfast', 'lunch']);
    expect(out.every((o) => localDateKey(o.loggedAt!, 'UTC') === '2026-03-12')).toBe(true);
    expect(logs).toHaveLength(3);
  });
  it('uses now when copying onto today', () => {
    const now = new Date('2026-03-10T21:30:00Z');
    const out = copyDay(logs, '2026-03-09', '2026-03-10', 'UTC', now);
    expect(out.every((o) => o.loggedAt === now.toISOString())).toBe(true);
  });
  it('copies nothing onto the same day or from an empty day', () => {
    expect(copyDay(logs, '2026-03-09', '2026-03-09', 'UTC')).toEqual([]);
    expect(copyDay(logs, '2026-02-01', '2026-03-10', 'UTC')).toEqual([]);
  });
});

describe('lastSimilarMeal', () => {
  const logs = [
    log('a', '2026-03-05T08:00:00Z', 'breakfast'),
    log('b', '2026-03-07T08:00:00Z', 'breakfast', [egg]),
    log('c', '2026-03-07T12:00:00Z', 'lunch'),
  ];
  it('finds the most recent earlier meal of that type', () => {
    expect(lastSimilarMeal(logs, 'breakfast', '2026-03-10', 'UTC')?.id).toBe('b');
    expect(lastSimilarMeal(logs, 'dinner', '2026-03-10', 'UTC')).toBeNull();
    expect(lastSimilarMeal(logs, 'breakfast', '2026-03-07', 'UTC')?.id).toBe('a');
  });
});
