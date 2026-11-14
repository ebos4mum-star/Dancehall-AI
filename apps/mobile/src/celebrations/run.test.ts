import { describe, expect, it } from 'vitest';
import type { CelebrationInput, CelebrationLevel } from '@dancehall/shared';
import { ledgerKey, loadSeen, runCelebrations, type KV, type RemoteLedger } from './run';
import { en } from '../i18n/en';

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
};
/** A synced ledger with first-write-wins, like the `celebrations` table. */
const remoteLedger = (initial: string[] = []) => {
  const rows = new Map<string, CelebrationLevel>(initial.map((i) => [i, 'full']));
  const calls = { list: 0, record: 0 };
  const api: RemoteLedger & { rows: typeof rows; calls: typeof calls; fail: boolean } = {
    rows,
    calls,
    fail: false,
    async list() {
      calls.list++;
      if (api.fail) throw new Error('offline');
      return [...rows.keys()];
    },
    async record(items) {
      calls.record++;
      if (api.fail) throw new Error('offline');
      await Promise.resolve(); // a real call takes time: lets two devices interleave
      const claimed: string[] = [];
      for (const i of items)
        if (!rows.has(i.id)) {
          rows.set(i.id, i.mode);
          claimed.push(i.id);
        }
      return claimed;
    },
  };
  return api;
};
const input = (
  waterMl: number,
  day = '2026-06-17',
  goal: number | null = 2000,
): CelebrationInput => ({
  today: day,
  timeZone: 'UTC',
  waterGoalMl: goal,
  dailyMovementMinutes: null,
  weeklyMinutesGoal: null,
  monthlyWeeksGoal: null,
  yearlyWeeksGoal: null,
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
const run = (
  kv: KV,
  i: CelebrationInput,
  level: CelebrationLevel = 'full',
  remote?: RemoteLedger | null,
  userId = 'u1',
) => runCelebrations({ kv, userId, input: i, level, remote });

describe('celebration runner (device ledger)', () => {
  it('the first run records what is already achieved and celebrates nothing', async () => {
    const kv = memory();
    expect(await run(kv, input(2500))).toEqual([]);
    expect(await loadSeen(kv, ledgerKey('u1'))).toEqual(new Set(['daily:water:2026-06-17']));
  });
  it('celebrates a NEW achievement once, even if evaluated again or concurrently', async () => {
    const kv = memory();
    await run(kv, input(500)); // seeds an empty ledger
    const first = await run(kv, input(2500));
    expect(first.map((c) => c.id)).toEqual(['daily:water:2026-06-17']);
    expect(await run(kv, input(2500))).toEqual([]);
    expect(await run(kv, input(2750))).toEqual([]);
    const [x, y] = await Promise.all([run(memory(), input(500)), run(memory(), input(500))]);
    expect([x, y]).toEqual([[], []]);
  });
  it('each person on a device has their own ledger', async () => {
    const kv = memory();
    await run(kv, input(500), 'full', null, 'u1');
    await run(kv, input(500), 'full', null, 'u2');
    expect((await run(kv, input(2500), 'full', null, 'u1')).length).toBe(1);
    expect((await run(kv, input(2500), 'full', null, 'u2')).length).toBe(1);
  });
  it('a corrupt ledger is treated as new: nothing old is repeated', async () => {
    const kv = memory();
    kv.data.set(ledgerKey('u1'), '{not json');
    expect(await run(kv, input(2500))).toEqual([]);
    expect(await run(kv, input(2500))).toEqual([]);
  });
  it('nothing is celebrated without a configured goal', async () => {
    const kv = memory();
    await run(kv, input(100, '2026-06-17', null));
    expect(await run(kv, input(9000, '2026-06-17', null))).toEqual([]);
  });
});

describe('celebration intensity', () => {
  it('off records new achievements as handled but shows nothing, and turning it back on does not replay them', async () => {
    const kv = memory();
    const remote = remoteLedger();
    await run(kv, input(500), 'off', remote);
    expect(await run(kv, input(2500), 'off', remote)).toEqual([]);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('off');
    expect(await run(kv, input(2500), 'full', remote)).toEqual([]);
    // A later, different achievement is celebrated normally.
    expect((await run(kv, input(2500, '2026-06-18'), 'full', remote)).map((c) => c.id)).toEqual([
      'daily:water:2026-06-18',
    ]);
  });
  it('gentle and full both show, and record how it was handled', async () => {
    const remote = remoteLedger();
    const kv = memory();
    await run(kv, input(500), 'gentle', remote);
    expect((await run(kv, input(2500), 'gentle', remote)).length).toBe(1);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('gentle');
  });
});

describe('celebration sync across devices', () => {
  it('a restored or second device does not repeat what another device already handled', async () => {
    const remote = remoteLedger(['daily:water:2026-06-17']);
    const fresh = memory(); // new device: no local ledger
    expect(await run(fresh, input(2500), 'full', remote)).toEqual([]);
    // ...and it still celebrates something genuinely new.
    expect((await run(fresh, input(2500, '2026-06-18'), 'full', remote)).length).toBe(1);
  });
  it('a first sync of existing history records it silently instead of celebrating it', async () => {
    const remote = remoteLedger();
    const kv = memory();
    expect(await run(kv, input(2500), 'full', remote)).toEqual([]);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('off');
  });
  it('two devices racing on the same achievement: the ledger keeps the first record', async () => {
    const remote = remoteLedger();
    const a = memory();
    const b = memory();
    await run(a, input(500), 'full', remote);
    await run(b, input(500), 'full', remote);
    await run(a, input(2500), 'gentle', remote);
    await run(b, input(2500), 'full', remote);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('gentle');
  });
  it('an unreachable synced ledger falls back to the device ledger and uploads later, without repeats', async () => {
    const remote = remoteLedger();
    const kv = memory();
    await run(kv, input(500), 'full', remote);
    remote.fail = true;
    expect((await run(kv, input(2500), 'full', remote)).length).toBe(1);
    expect(await run(kv, input(2500), 'full', remote)).toEqual([]); // not repeated while offline
    remote.fail = false;
    expect(await run(kv, input(2500), 'full', remote)).toEqual([]);
    expect(remote.rows.has('daily:water:2026-06-17')).toBe(true); // uploaded once reachable
  });
  it('a retried upload never duplicates a record', async () => {
    const remote = remoteLedger();
    const kv = memory();
    await run(kv, input(500), 'full', remote);
    await run(kv, input(2500), 'full', remote);
    await run(kv, input(2500), 'full', remote);
    expect([...remote.rows.keys()]).toEqual(['daily:water:2026-06-17']);
  });
});

describe('celebration text', () => {
  it('every period and kind has a message, with no weight, calorie or shaming language', () => {
    const keys = Object.keys(en).filter(
      (k) => k.startsWith('cel.') && /^cel\.(daily|weekly|monthly|yearly)\./.test(k),
    );
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

describe('claim before display (two devices, one achievement)', () => {
  it('when two devices race on the same new achievement, exactly one shows it', async () => {
    const remote = remoteLedger();
    const a = memory();
    const b = memory();
    await run(a, input(500), 'full', remote);
    await run(b, input(500), 'full', remote);
    const [x, y] = await Promise.all([
      run(a, input(2500), 'full', remote),
      run(b, input(2500), 'full', remote),
    ]);
    expect(x.length + y.length).toBe(1);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('full');
  });
  it('many devices racing still show it exactly once', async () => {
    const remote = remoteLedger();
    const kvs = [memory(), memory(), memory(), memory(), memory()];
    for (const kv of kvs) await run(kv, input(500), 'full', remote);
    const shown = await Promise.all(kvs.map((kv) => run(kv, input(2500), 'full', remote)));
    expect(shown.flat().length).toBe(1);
  });
  it('the loser records nothing new and is quiet afterwards', async () => {
    const remote = remoteLedger();
    const a = memory();
    const b = memory();
    await run(a, input(500), 'full', remote);
    await run(b, input(500), 'full', remote);
    await Promise.all([run(a, input(2500), 'full', remote), run(b, input(2500), 'full', remote)]);
    expect(await run(a, input(2500), 'full', remote)).toEqual([]);
    expect(await run(b, input(2500), 'full', remote)).toEqual([]);
  });
  it('distinct achievements are not suppressed by each other', async () => {
    const remote = remoteLedger();
    const a = memory();
    await run(a, input(500), 'full', remote);
    await run(a, input(500, '2026-06-18'), 'full', remote);
    const shown = await run(
      a,
      {
        ...input(2500, '2026-06-18'),
        entries: [...input(2500, '2026-06-17').entries, ...input(2500, '2026-06-18').entries],
      },
      'full',
      remote,
    );
    expect(shown.map((c) => c.id)).toEqual(['daily:water:2026-06-18']);
  });
  it('offline, the device ledger decides, and it never repeats afterwards', async () => {
    const remote = remoteLedger();
    const kv = memory();
    await run(kv, input(500), 'full', remote);
    remote.fail = true;
    expect((await run(kv, input(2500), 'full', remote)).length).toBe(1);
    expect(await run(kv, input(2500), 'full', remote)).toEqual([]);
  });
  it('the mode is recorded for gentle and off as for full, and off never shows even when claimed', async () => {
    const remote = remoteLedger();
    const kv = memory();
    await run(kv, input(500), 'off', remote);
    expect(await run(kv, input(2500), 'off', remote)).toEqual([]);
    expect(remote.rows.get('daily:water:2026-06-17')).toBe('off');
  });
});
