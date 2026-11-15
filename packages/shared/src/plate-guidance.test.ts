import { describe, expect, it } from 'vitest';
import {
  FIBRE_GUIDE_G,
  FOOD_BY_ID,
  PLATE_MODEL,
  itemFromFood,
  manualItem,
  plateGuidance,
} from './index';

const food = (id: string, grams: number) => itemFromFood(FOOD_BY_ID.get(id)!, grams);
const RANGE = { low: 56, high: 84 };

describe('plate guidance', () => {
  it('shows only the static plate picture, with no analysis of the day, when numbers are hidden', () => {
    const g = plateGuidance({
      items: [food('white-rice', 200)],
      proteinRange: RANGE,
      hidden: true,
    });
    expect(g.hidden).toBe(true);
    expect(g.protein).toBeNull();
    expect(g.fibre).toBeNull();
    expect(g.groups).toBeNull();
    expect(g.nudges).toEqual([]);
    expect(g.model).toBe(PLATE_MODEL);
    expect(g.note).toMatch(/not medical advice/);
  });

  it('the plate picture is half vegetables and fruit, a quarter protein, a quarter whole grains or starch', () => {
    expect(PLATE_MODEL.map((p) => [p.id, p.share])).toEqual([
      ['veg_fruit', 'about half'],
      ['protein', 'about a quarter'],
      ['grain', 'about a quarter'],
    ]);
  });

  it('protein: a calm progress description against the person’s own range, never a score or a warning', () => {
    const none = plateGuidance({ items: [], proteinRange: RANGE, hidden: false });
    expect(none.protein).toBeNull(); // nothing logged: nothing to say
    const low = plateGuidance({
      items: [food('boiled-egg', 100)],
      proteinRange: RANGE,
      hidden: false,
    }).protein!;
    expect(low.status).toBe('building');
    expect(low.fraction).toBeGreaterThan(0);
    expect(low.fraction).toBeLessThan(1);
    expect(low.message).toMatch(/the day is not over/);
    const within = plateGuidance({
      items: [manualItem({ name: 'Shake', grams: 300, kcal: 300, proteinG: 60 })],
      proteinRange: RANGE,
      hidden: false,
    }).protein!;
    expect(within.status).toBe('within');
    expect(within.message).toMatch(/no need to hit it exactly/);
    const above = plateGuidance({
      items: [manualItem({ name: 'Big', grams: 500, kcal: 800, proteinG: 120 })],
      proteinRange: RANGE,
      hidden: false,
    }).protein!;
    expect(above.status).toBe('above');
    expect(above.message).toMatch(/fine for one day/);
    expect(above.fraction).toBe(1);
    for (const p of [low, within, above])
      expect(p.message).not.toMatch(/should|must|too much|bad|good/i);
    expect(
      plateGuidance({ items: [food('boiled-egg', 100)], proteinRange: null, hidden: false })
        .protein,
    ).toBeNull();
  });

  it('fibre: counted only from foods in the reference table, with the coverage stated and a general guide, never invented', () => {
    const g = plateGuidance({
      items: [food('lentils', 200), manualItem({ name: 'Mystery stew', grams: 300, kcal: 400 })],
      proteinRange: null,
      hidden: false,
    });
    const lent = FOOD_BY_ID.get('lentils')!.per100g.fiberG!;
    expect(g.fibre!.gramsKnown).toBeCloseTo((lent * 200) / 100, 1);
    expect(g.fibre!.matchedItems).toBe(1);
    expect(g.fibre!.totalItems).toBe(2);
    expect(g.fibre!.guideG).toBe(FIBRE_GUIDE_G);
    expect(g.fibre!.message).toMatch(/1 of 2/);
    expect(g.fibre!.message).toMatch(/general guide/);
    const unknown = plateGuidance({
      items: [manualItem({ name: 'Mystery', grams: 100, kcal: 100 })],
      proteinRange: null,
      hidden: false,
    });
    expect(unknown.fibre!.matchedItems).toBe(0);
    expect(unknown.fibre!.gramsKnown).toBe(0);
    expect(unknown.fibre!.message).toMatch(/cannot estimate fibre/);
  });

  it('food groups come from reference foods only; unclassified items are counted, not guessed', () => {
    const g = plateGuidance({
      items: [
        food('spinach-cooked', 100),
        food('white-rice', 150),
        manualItem({ name: 'Unknown', grams: 50, kcal: 80 }),
      ],
      proteinRange: null,
      hidden: false,
    });
    expect(g.groups).toEqual({ veg_fruit: true, protein: false, grain: true, dairy: false });
    expect(g.coverage).toEqual({ classified: 2, total: 3 });
    const none = plateGuidance({
      items: [manualItem({ name: 'Unknown', grams: 50, kcal: 80 })],
      proteinRange: null,
      hidden: false,
    });
    expect(none.groups).toBeNull();
    expect(none.nudges).toEqual([]); // nothing visible, so nothing is said
  });

  it('gentle suggestions appear only when they are true, at most two, and never judge', () => {
    const noVeg = plateGuidance({
      items: [food('white-rice', 150), food('boiled-egg', 100)],
      proteinRange: RANGE,
      hidden: false,
    });
    expect(noVeg.nudges.join(' ')).toMatch(/No vegetables or fruit logged yet today/);
    const withVeg = plateGuidance({
      items: [food('white-rice', 150), food('spinach-cooked', 100)],
      proteinRange: RANGE,
      hidden: false,
    });
    expect(withVeg.nudges.join(' ')).not.toMatch(/vegetables or fruit/);
    const proteinNudge = plateGuidance({
      items: [food('white-rice', 150), food('spinach-cooked', 100), food('banana', 100)],
      proteinRange: RANGE,
      hidden: false,
    });
    expect(proteinNudge.nudges.join(' ')).toMatch(/A little protein/);
    expect(proteinNudge.nudges.length).toBeLessThanOrEqual(2);
    for (const n of [...noVeg.nudges, ...proteinNudge.nudges])
      expect(n).not.toMatch(/should|must|bad|good|cheat|guilt|calorie|diet/i);
  });

  it('is always labelled provisional and says nothing about calories or weight', () => {
    const g = plateGuidance({
      items: [food('white-rice', 150)],
      proteinRange: RANGE,
      hidden: false,
    });
    expect(g.provisional).toBe(true);
    expect(JSON.stringify(g)).not.toMatch(/kcal|calorie|weight loss|lose weight/i);
  });
});
