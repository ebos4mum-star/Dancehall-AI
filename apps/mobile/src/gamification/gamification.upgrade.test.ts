import { describe, expect, it, vi } from 'vitest';
import { celebrationPolicy } from './policy';
import {
  EMPTY_SEEN,
  diffRewards,
  hasReward,
  primaryReaction,
  takeToast,
  type ProgressSnapshot,
} from './rewards';
import { createCoalescedSync } from './coalescedSync';

const snap = (over: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  totalXp: 0,
  level: 1,
  streakCurrent: 0,
  badges: [],
  cosmetics: [],
  questsDone: [],
  seasonId: 'harvest-2026',
  seasonDone: false,
  ...over,
});

describe('R2 regression: one policy controls every optional celebration', () => {
  it('Off removes the toast, banner, haptics, motion and any celebratory pose', () => {
    const p = celebrationPolicy('off', false);
    expect([p.toast, p.banner, p.haptics, p.motion]).toEqual([false, false, false, false]);
    expect(p.maxToastsPerDay).toBe(0);
  });
  it('Gentle is calm: a banner and the calm pose, no haptics', () => {
    const p = celebrationPolicy('gentle', false);
    expect(p).toMatchObject({
      toast: true,
      banner: true,
      haptics: false,
      pulseState: 'encourage',
      motion: true,
    });
  });
  it('Full celebrates with haptics and motion', () => {
    expect(celebrationPolicy('full', false)).toMatchObject({
      toast: true,
      haptics: true,
      motion: true,
      pulseState: 'celebrate',
    });
  });
  it('Reduce Motion removes motion at every level but keeps the words', () => {
    for (const l of ['off', 'gentle', 'full'] as const)
      expect(celebrationPolicy(l, true).motion).toBe(false);
    expect(celebrationPolicy('full', true).banner).toBe(true);
  });
  it('the toast budget limits repetition and resets each day', () => {
    let seen = EMPTY_SEEN;
    for (let i = 0; i < 3; i++) {
      const r = takeToast(seen, '2026-06-17', 3);
      expect(r.ok).toBe(true);
      seen = r.seen;
    }
    expect(takeToast(seen, '2026-06-17', 3).ok).toBe(false);
    expect(takeToast(seen, '2026-06-18', 3).ok).toBe(true);
  });
  it('the progression UI routes every celebration through the policy (no direct showMoment or haptics call)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ui = readFileSync(join(__dirname, 'ui.tsx'), 'utf8');
    expect(ui).not.toMatch(/showMoment\(/);
    expect(ui).not.toMatch(/haptics\.celebrate|haptics\.success/);
    const host = readFileSync(join(__dirname, 'GamificationHost.tsx'), 'utf8');
    expect(host).toMatch(/celebrationPolicy\(/);
  });
});

describe('reward events come only from confirmed, genuinely new progress', () => {
  it('the first snapshot on a phone sets the baseline and celebrates nothing (no replay after a reinstall)', () => {
    const r = diffRewards(
      snap({ totalXp: 6000, level: 11, badges: ['level_5', 'level_10'], streakCurrent: 74 }),
      EMPTY_SEEN,
    );
    expect(hasReward(r.summary)).toBe(false);
    expect(r.seen.baselined).toBe(true);
    expect(r.seen.levelSeen).toBe(11);
  });
  it('reports XP gained, a level-up, a new quest and a badge once, and nothing the second time', () => {
    const base = diffRewards(snap({ totalXp: 90 }), EMPTY_SEEN).seen;
    const next = snap({
      totalXp: 135,
      level: 2,
      questsDone: ['quest:2026-06-17:move_10'],
      badges: ['level_5'],
    });
    const a = diffRewards(next, base);
    expect(a.summary).toMatchObject({
      xpGained: 45,
      levelUp: 2,
      questsDone: ['move_10'],
      badges: ['level_5'],
    });
    expect(primaryReaction(a.summary)).toBe('level_up');
    const b = diffRewards(next, a.seen);
    expect(hasReward(b.summary)).toBe(false);
  });
  it('streak milestones fire once per milestone, never twice, and never on the way back up after a quiet week', () => {
    let seen = diffRewards(snap(), EMPTY_SEEN).seen;
    const r1 = diffRewards(snap({ streakCurrent: 7 }), seen);
    expect(r1.summary.streakMilestone).toBe(7);
    seen = r1.seen;
    expect(diffRewards(snap({ streakCurrent: 8 }), seen).summary.streakMilestone).toBeNull();
    const dropped = diffRewards(snap({ streakCurrent: 0 }), seen);
    expect(dropped.summary.streakMilestone).toBeNull();
    expect(
      diffRewards(snap({ streakCurrent: 7 }), dropped.seen).summary.streakMilestone,
    ).toBeNull();
    expect(diffRewards(snap({ streakCurrent: 14 }), dropped.seen).summary.streakMilestone).toBe(14);
  });
  it('a deleted workout lowers the baseline quietly, and earning it back is not announced as new XP twice', () => {
    const seen = diffRewards(snap({ totalXp: 100 }), EMPTY_SEEN).seen;
    const down = diffRewards(snap({ totalXp: 60 }), seen);
    expect(hasReward(down.summary)).toBe(false);
    expect(down.seen.xpSeen).toBe(60);
  });
  it('season completion and a cosmetic unlock are announced once', () => {
    const seen = diffRewards(snap(), EMPTY_SEEN).seen;
    const r = diffRewards(snap({ seasonDone: true, cosmetics: ['cosmetic_scarf'] }), seen);
    expect(r.summary.seasonDone).toBe(true);
    expect(r.summary.cosmetics).toEqual(['cosmetic_scarf']);
    expect(
      hasReward(
        diffRewards(snap({ seasonDone: true, cosmetics: ['cosmetic_scarf'] }), r.seen).summary,
      ),
    ).toBe(false);
  });
  it('Pulse reacts to the most important thing first', () => {
    expect(
      primaryReaction({
        ...diffRewards(snap(), EMPTY_SEEN).summary,
        badges: ['level_5'],
        questsDone: ['move_10'],
      }),
    ).toBe('badge');
  });
});

describe('R1 regression: progression is refreshed promptly, without flooding, and the latest answer wins', () => {
  const harness = (work: (k: string) => Promise<string>) => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const errors: string[] = [];
    const s = createCoalescedSync<string>({
      debounceMs: 300,
      retryMs: 5000,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      work,
      apply: (r) => applied.push(r),
      onError: (k) => errors.push(k),
    });
    return { s, applied, errors };
  };
  it('a change made right after an earlier one is NOT left stale (the original defect: a change inside a minute was never re-requested)', async () => {
    const { s, applied } = harness(async (k) => `state:${k}`);
    s.request('A');
    await vi.advanceTimersByTimeAsync(400);
    s.request('B'); // two seconds later in real life; here immediately after
    await vi.advanceTimersByTimeAsync(400);
    expect(applied).toEqual(['state:A', 'state:B']);
    vi.useRealTimers();
  });
  it('a burst of changes becomes one call with the newest key', async () => {
    const { s, applied } = harness(async (k) => k);
    for (const k of ['1', '2', '3', '4']) s.request(k);
    await vi.advanceTimersByTimeAsync(400);
    expect(applied).toEqual(['4']);
    expect(s.calls).toBe(1);
    vi.useRealTimers();
  });
  it('an unchanged key makes no network call at all', async () => {
    const { s } = harness(async (k) => k);
    s.request('same');
    await vi.advanceTimersByTimeAsync(400);
    s.request('same');
    s.request('same');
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.calls).toBe(1);
    vi.useRealTimers();
  });
  it('a key asked while a call is running runs right after it, and a slow old answer never overwrites the newer one', async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { s, applied } = harness(async (k) => {
      if (k === 'old') await slow;
      return k;
    });
    s.request('old');
    await vi.advanceTimersByTimeAsync(400); // call for "old" is now in flight
    s.request('new');
    await vi.advanceTimersByTimeAsync(400); // "new" is waiting its turn
    release();
    await vi.advanceTimersByTimeAsync(400);
    expect(applied).toEqual(['new']);
    vi.useRealTimers();
  });
  it('a failure is reported once, is not retried in a loop, and recovers when the data changes', async () => {
    let fail = true;
    const { s, applied, errors } = harness(async (k) => {
      if (fail) throw new Error('offline');
      return k;
    });
    s.request('x');
    await vi.advanceTimersByTimeAsync(400);
    s.request('x');
    await vi.advanceTimersByTimeAsync(1000);
    expect(errors).toEqual(['x']);
    expect(s.calls).toBe(1);
    fail = false;
    s.request('y');
    await vi.advanceTimersByTimeAsync(400);
    expect(applied).toEqual(['y']);
    vi.useRealTimers();
  });
});

import { cleanList, readGmPrefs, writeGmPrefs, wornCosmetics, DEFAULT_DEVICE_PREFS } from './prefs';
import { rewardLines } from './rewardText';
import { NO_REWARD } from './rewards';
import type { PrefsRaw } from '@/health/prefs';

const mem = (): PrefsRaw => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};

describe('wardrobe: view, select and equip', () => {
  it('everything unlocked is worn unless the person took it off, so a new unlock is worn at once', () => {
    expect(wornCosmetics(['cosmetic_headband', 'cosmetic_cape'], [])).toEqual([
      'cosmetic_headband',
      'cosmetic_cape',
    ]);
    expect(wornCosmetics(['cosmetic_headband', 'cosmetic_cape'], ['cosmetic_cape'])).toEqual([
      'cosmetic_headband',
    ]);
    expect(
      wornCosmetics(['cosmetic_headband', 'cosmetic_wristbands'], ['cosmetic_headband']),
    ).toEqual(['cosmetic_wristbands']);
    expect(wornCosmetics([], ['cosmetic_cape'])).toEqual([]);
  });
  it('what was taken off is remembered per account, cleaned of junk, and survives a restart', async () => {
    const raw = mem();
    await writeGmPrefs(raw, 'u1', {
      ...DEFAULT_DEVICE_PREFS,
      takenOff: ['cosmetic_cape', 'nope' as never, 'cosmetic_cape'],
    });
    expect((await readGmPrefs(raw, 'u1')).takenOff).toEqual(['cosmetic_cape']);
    expect((await readGmPrefs(raw, 'u2')).takenOff).toEqual([]);
    await raw.set('dh.gm.v1.u3', '{not json');
    expect((await readGmPrefs(raw, 'u3')).takenOff).toEqual([]);
    expect(cleanList('x')).toEqual([]);
  });
});

describe('reward words (shown and read aloud from the same lines)', () => {
  it('lists what was earned, including an Apple Health import and a completed group goal', () => {
    const lines = rewardLines({
      ...NO_REWARD,
      xpGained: 80,
      importedWorkouts: 2,
      levelUp: 3,
      questsDone: ['move_10'],
      badges: ['streak_7'],
      streakMilestone: 7,
      cosmetics: ['cosmetic_headband'],
      seasonDone: true,
    });
    expect(lines).toEqual(
      expect.arrayContaining([
        '+80 XP',
        'Brought in 2 workouts from Apple Health',
        'Level 3 reached',
        'Quest done: Move for 10 minutes',
        '7 active days in a row',
        'New badge: Seven active days in a row',
        'Unlocked for Pulse: Headband',
        'Season challenge complete',
      ]),
    );
    expect(rewardLines(NO_REWARD, 'Move together')).toEqual(['Group goal reached: Move together']);
    expect(rewardLines(NO_REWARD)).toEqual([]);
  });
});
