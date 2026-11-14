import { describe, expect, it } from 'vitest';
import { todayGlance } from './glance';

describe('todayGlance', () => {
  it('shows empty days neutrally, never as zero progress', () => {
    const g = todayGlance({ doneToday: [], plannedToday: 0, mealsLogged: 0, loggedKcal: 0 });
    expect(g.map((l) => l.done)).toEqual([false, false]);
    expect(g.map((l) => l.text).join(' ')).not.toMatch(/\b0 (min|kcal)/);
  });
  it('reflects completed activity and logged meals', () => {
    const g = todayGlance({
      doneToday: [{ minutes: 10 }, { minutes: 5 }],
      plannedToday: 1,
      mealsLogged: 1,
      loggedKcal: 420,
    });
    expect(g[0]).toMatchObject({ done: true, text: 'Moved for 15 min today' });
    expect(g[1]).toMatchObject({ done: true, text: '1 meal logged (about 420 kcal)' });
  });
  it('shows what is planned when nothing is done yet', () => {
    expect(
      todayGlance({ doneToday: [], plannedToday: 2, mealsLogged: 0, loggedKcal: 0 })[0]!.text,
    ).toBe('2 planned for today');
  });
});

describe('hidden numbers', () => {
  it('omits calories from the food line but still says meals were logged', () => {
    const g = todayGlance({
      doneToday: [],
      plannedToday: 0,
      mealsLogged: 2,
      loggedKcal: 640,
      hideNumbers: true,
    });
    expect(g[1]!.text).toBe('2 meals logged');
    expect(JSON.stringify(g)).not.toMatch(/kcal/);
  });
});
