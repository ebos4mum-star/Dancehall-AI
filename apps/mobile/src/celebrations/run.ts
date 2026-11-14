import {
  achievedCelebrations,
  dueCelebrations,
  remember,
  type Celebration,
  type CelebrationInput,
} from '@dancehall/shared';

/** Minimal key-value storage (AsyncStorage on device, a Map in tests). */
export interface KV {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
/** One ledger per person on a device, so a second account never inherits or hides the first one's celebrations. */
export const ledgerKey = (userId: string) => `dh.celebrations.seen.v1.${userId}`;

export async function loadSeen(kv: KV, key: string): Promise<Set<string> | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string')) : null;
  } catch {
    return null; // an unreadable ledger is treated as new: celebrate nothing retroactively rather than repeat old ones
  }
}

/**
 * Decides what to celebrate now and records it BEFORE anything is shown, so a re-render, a retry or two quick data changes can never show the
 * same achievement twice. The first run on a device only records what is already achieved (no retroactive celebration).
 */
export async function runCelebrations(args: {
  kv: KV;
  userId: string;
  input: CelebrationInput;
}): Promise<Celebration[]> {
  const key = ledgerKey(args.userId);
  const achieved = achievedCelebrations(args.input);
  const seen = await loadSeen(args.kv, key);
  if (seen === null) {
    await args.kv.set(key, JSON.stringify(remember(null, achieved)));
    return [];
  }
  const due = dueCelebrations(achieved, seen);
  if (due.length > 0) await args.kv.set(key, JSON.stringify(remember(seen, due)));
  return due;
}
