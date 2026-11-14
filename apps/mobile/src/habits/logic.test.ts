import { describe, expect, it } from 'vitest';
import { MAX_HABITS, addDays, cleanHabitName, habitWeek } from './logic';

describe('cleanHabitName', () => {
  it('trims and collapses whitespace', () =>
    expect(cleanHabitName('  Walk   10  min ')).toBe('Walk 10 min'));
  it('rejects empty and over-long names', () => {
    expect(cleanHabitName('   ')).toBeNull();
    expect(cleanHabitName('x'.repeat(41))).toBeNull();
    expect(cleanHabitName('x'.repeat(40))).toHaveLength(40);
  });
  it('the limit matches the database trigger', () => expect(MAX_HABITS).toBe(5));
});

describe('habitWeek', () => {
  const today = '2026-06-10';
  const c = (habitId: string, day: string) => ({ habitId, day });
  it('covers seven days ending today, for one habit only', () => {
    const w = habitWeek(
      [c('a', '2026-06-10'), c('a', '2026-06-07'), c('b', '2026-06-09'), c('a', '2026-05-01')],
      'a',
      today,
    );
    expect(w.days).toHaveLength(7);
    expect(w.days[0]!.date).toBe('2026-06-04');
    expect(w.days[6]).toEqual({ date: '2026-06-10', done: true });
    expect(w.doneDays).toBe(2);
    expect(w.doneToday).toBe(true);
  });
  it('an empty week has no done days and carries no missed state', () => {
    const w = habitWeek([], 'a', today);
    expect(w.doneDays).toBe(0);
    expect(w.doneToday).toBe(false);
    expect(Object.keys(w.days[0]!).sort()).toEqual(['date', 'done']);
  });
  it('day arithmetic crosses month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});
