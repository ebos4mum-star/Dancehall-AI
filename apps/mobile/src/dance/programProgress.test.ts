import { describe, expect, it } from 'vitest';
import { programProgress, programSlots } from './programProgress';

const s = (
  status: 'planned' | 'completed' | 'skipped',
  plannedFor: string | null,
  programId = 'p',
) => ({
  programId,
  status,
  plannedFor,
});
describe('programProgress', () => {
  it('counts completed, upcoming, earlier and skipped for this program only', () => {
    const r = programProgress(
      'p',
      12,
      [
        s('completed', '2026-06-01'),
        s('completed', '2026-06-03'),
        s('skipped', '2026-06-05'),
        s('planned', '2026-06-10'),
        s('planned', '2026-06-20'),
        s('completed', '2026-06-02', 'other'),
      ],
      '2026-06-15',
    );
    expect(r).toMatchObject({
      completed: 2,
      skipped: 1,
      earlier: 1,
      upcoming: 1,
      finished: false,
      started: true,
    });
  });
  it('finishes only when every session is completed, and never over-counts', () => {
    const all = Array.from({ length: 4 }, (_, k) => s('completed', `2026-06-0${k + 1}`));
    expect(programProgress('p', 4, all, '2026-06-15').finished).toBe(true);
    expect(programProgress('p', 3, all, '2026-06-15').completed).toBe(3);
    expect(programProgress('p', 5, all, '2026-06-15').finished).toBe(false);
  });
  it('is not started without sessions', () => {
    expect(programProgress('p', 4, [], '2026-06-15')).toMatchObject({
      started: false,
      completed: 0,
    });
  });
});

describe('programSlots', () => {
  const sched = [
    { week: 1, day: 3, workoutId: 'b' },
    { week: 1, day: 1, workoutId: 'a' },
    { week: 2, day: 1, workoutId: 'c' },
  ];
  it('orders slots by week and day and pairs them with sessions by date', () => {
    const r = programSlots(
      sched,
      [s('planned', '2026-06-08'), s('completed', '2026-06-01'), s('skipped', '2026-06-03')],
      'p',
    );
    expect(r.map((x) => x.workoutId)).toEqual(['a', 'b', 'c']);
    expect(r.map((x) => x.status)).toEqual(['completed', 'skipped', 'planned']);
  });
  it('marks slots without a session as not scheduled and ignores other programs', () => {
    expect(
      programSlots(sched, [s('completed', '2026-06-01', 'other')], 'p').map((x) => x.status),
    ).toEqual(['notScheduled', 'notScheduled', 'notScheduled']);
  });
});
