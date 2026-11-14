import { describe, expect, it } from 'vitest';
import type { CelebrationInput } from '@dancehall/shared';
import { ledgerKey, loadSeen, runCelebrations, type KV } from './run';
import { en } from '../i18n/en';

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
};
const input = (waterMl: number, day = '2026-06-17'): CelebrationInput => ({
  today: day,
  timeZone: 'UTC',
  waterGoalMl: 2000,
  weeklyMinutesGoal: null,
  entries: [
    {
      id: 'w',
      kind: 'hydration',
      day,
      amount: waterMl,
      amount2: null,
      label: null,
      createdAt: `${day}T08:00:00Z`,
    },
  ],
  sessions: [],
  habits: { activeIds: [], checkins: [] },
});

describe('celebration runner', () => {
  it('the first run records what is already achieved and celebrates nothing', async () => {
    const kv = memory();
    expect(await runCelebrations({ kv, userId: 'u1', input: input(2500) })).toEqual([]);
    expect(await loadSeen(kv, ledgerKey('u1'))).toEqual(new Set(['daily:water:2026-06-17']));
  });
  it('celebrates a NEW achievement once, even if evaluated again or concurrently', async () => {
    const kv = memory();
    await runCelebrations({ kv, userId: 'u1', input: input(500) }); // seeds an empty ledger
    const first = await runCelebrations({ kv, userId: 'u1', input: input(2500) });
    expect(first.map((c) => c.id)).toEqual(['daily:water:2026-06-17']);
    expect(await runCelebrations({ kv, userId: 'u1', input: input(2500) })).toEqual([]);
    expect(await runCelebrations({ kv, userId: 'u1', input: input(2750) })).toEqual([]);
  });
  it('each person on a device has their own ledger', async () => {
    const kv = memory();
    await runCelebrations({ kv, userId: 'u1', input: input(500) });
    await runCelebrations({ kv, userId: 'u2', input: input(500) });
    expect((await runCelebrations({ kv, userId: 'u1', input: input(2500) })).length).toBe(1);
    expect((await runCelebrations({ kv, userId: 'u2', input: input(2500) })).length).toBe(1);
  });
  it('a corrupt ledger is treated as new: nothing old is repeated', async () => {
    const kv = memory();
    kv.data.set(ledgerKey('u1'), '{not json');
    expect(await runCelebrations({ kv, userId: 'u1', input: input(2500) })).toEqual([]);
    expect(await runCelebrations({ kv, userId: 'u1', input: input(2500) })).toEqual([]);
  });
  it('every period and kind has a message, with no weight, calorie or shaming language', () => {
    const keys = Object.keys(en).filter((k) => k.startsWith('cel.'));
    expect(keys.sort()).toEqual([
      'cel.daily.habits',
      'cel.daily.movement',
      'cel.daily.water',
      'cel.monthly.movement_weeks',
      'cel.weekly.movement_minutes',
      'cel.yearly.movement_weeks',
    ]);
    for (const k of keys)
      expect((en as Record<string, string>)[k]).not.toMatch(
        /weight|kcal|calorie|lose|fat|streak|failed|miss/i,
      );
  });
});
