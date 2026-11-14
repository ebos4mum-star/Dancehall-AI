import { describe, expect, it } from 'vitest';
import {
  HEALTH_SYNC_ENABLED,
  disabledHealthProvider,
  importableWorkouts,
  type ExternalWorkout,
} from './contract';

const ext = (id: string, start: string): ExternalWorkout => ({
  source: 'apple_health',
  externalId: id,
  startedAt: start,
  endedAt: start,
  activity: 'dance',
});

describe('health sync contract (inactive)', () => {
  it('is disabled and reads nothing', async () => {
    expect(HEALTH_SYNC_ENABLED).toBe(false);
    expect(disabledHealthProvider.status()).toBe('disabled');
    expect(await disabledHealthProvider.readWorkouts('2026-01-01T00:00:00Z')).toEqual([]);
  });
  it('does not import workouts already known by id, repeated in the feed, or overlapping a recorded session', () => {
    const recorded = [
      { completedAt: '2026-06-15T10:10:00Z', durationS: 600, externalId: null },
      { completedAt: '2026-06-14T08:00:00Z', durationS: 600, externalId: 'known' },
    ];
    const r = importableWorkouts(
      [
        ext('known', '2026-06-01T08:00:00Z'),
        ext('overlap', '2026-06-15T10:03:00Z'),
        ext('fresh', '2026-06-16T18:00:00Z'),
        ext('fresh', '2026-06-16T18:00:00Z'),
        ext('bad-date', 'not a date'),
      ],
      recorded,
    );
    expect(r.map((x) => x.externalId)).toEqual(['fresh']);
  });
});
