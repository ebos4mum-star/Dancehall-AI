import { describe, expect, it } from 'vitest';
import type { DailyPlanItem } from '@/data/types';
import { heroLine } from './heroLine';

const none = { kind: 'empty' } as const;
const item = {
  id: 'i',
  position: 0,
  kind: 'habit',
  title: 'T',
  detail: 'd',
  why: 'w',
  doneAt: null,
} as DailyPlanItem;
describe('heroLine', () => {
  it('prioritises celebration and encouragement, then next-up, then a gentle default', () => {
    expect(heroLine({ pulse: 'celebrate', next: none, hour: 9, doneAnything: true })).toMatch(
      /counts/,
    );
    expect(heroLine({ pulse: 'encourage', next: none, hour: 9, doneAnything: false })).toMatch(
      /Welcome back/,
    );
    expect(
      heroLine({ pulse: 'idle', next: { kind: 'allDone' }, hour: 9, doneAnything: true }),
    ).toMatch(/bonus/);
    expect(heroLine({ pulse: 'idle', next: none, hour: 9, doneAnything: false })).toMatch(
      /morning/,
    );
    expect(heroLine({ pulse: 'idle', next: none, hour: 14, doneAnything: false })).toMatch(
      /afternoon/,
    );
    expect(heroLine({ pulse: 'idle', next: none, hour: 20, doneAnything: false })).toMatch(
      /evening/,
    );
  });
  it('points to the Next up block when a plan item is waiting, without repeating its title', () => {
    const line = heroLine({
      pulse: 'idle',
      next: { kind: 'item', item, action: 'tick' },
      hour: 9,
      doneAnything: false,
    });
    expect(line).toMatch(/next step/);
    expect(line).not.toContain(item.title + ' ');
  });
  it('uses no guilt, weight or medical language in any branch', () => {
    const lines = [
      heroLine({ pulse: 'celebrate', next: none, hour: 9, doneAnything: true }),
      heroLine({ pulse: 'encourage', next: none, hour: 9, doneAnything: false }),
      heroLine({ pulse: 'idle', next: { kind: 'allDone' }, hour: 9, doneAnything: true }),
      heroLine({ pulse: 'idle', next: none, hour: 9, doneAnything: false }),
      heroLine({ pulse: 'idle', next: none, hour: 9, doneAnything: true }),
    ];
    for (const l of lines)
      expect(l).not.toMatch(/miss|behind|fail|lazy|should|must|weight|burn|doctor/i);
  });
});
