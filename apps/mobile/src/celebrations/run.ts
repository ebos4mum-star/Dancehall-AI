import {
  achievedCelebrations,
  dueCelebrations,
  remember,
  type Celebration,
  type CelebrationInput,
  type CelebrationLevel,
} from '@dancehall/shared';

/** Minimal key-value storage (AsyncStorage on device, a Map in tests). */
export interface KV {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
/** The synced ledger (the `celebrations` table, or the mock). Optional: without it the device-local ledger still prevents repeats on this device. */
export interface RemoteLedger {
  list(): Promise<string[]>;
  record(items: Array<{ id: string; mode: CelebrationLevel }>): Promise<void>;
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

const MAX_SYNC_BACKFILL = 200;

/**
 * Decides what to celebrate now. Everything handled is recorded (on the device, then in the synced ledger) BEFORE anything is shown, so a
 * re-render, a retry, a second device or a restored device cannot show the same achievement twice.
 *
 *  - The ledger is the union of this device's record and the synced one, so a restored or second device sees what was already handled.
 *  - A brand-new ledger (nothing local, nothing synced) only records what is already achieved: no retroactive celebration.
 *  - With celebrations off, new achievements are recorded as handled but never shown, so turning them back on later does not replay them.
 *  - If the synced ledger is unreachable the device ledger is used, and anything it holds that the synced one lacks is uploaded next time.
 */
export async function runCelebrations(args: {
  kv: KV;
  userId: string;
  input: CelebrationInput;
  level: CelebrationLevel;
  remote?: RemoteLedger | null;
}): Promise<Celebration[]> {
  const key = ledgerKey(args.userId);
  const achieved = achievedCelebrations(args.input);
  const local = await loadSeen(args.kv, key);
  let remoteIds: string[] | null = null;
  if (args.remote) {
    try {
      remoteIds = await args.remote.list();
    } catch {
      remoteIds = null;
    }
  }
  const brandNew = local === null && (remoteIds === null || remoteIds.length === 0);
  const seen = brandNew
    ? new Set<string>()
    : new Set<string>([...(local ?? []), ...(remoteIds ?? [])]);

  let handled: Celebration[];
  let show: Celebration[] = [];
  let mode: CelebrationLevel = args.level;
  if (brandNew) {
    handled = achieved;
    mode = 'off';
  } else {
    handled = dueCelebrations(achieved, seen);
    if (args.level === 'off') mode = 'off';
    else show = handled;
  }

  const nextLocal = remember(seen, handled);
  if (brandNew || handled.length > 0 || local === null)
    await args.kv.set(key, JSON.stringify(nextLocal));

  if (args.remote) {
    const have = new Set(remoteIds ?? []);
    const items = [
      ...handled.filter((c) => !have.has(c.id)).map((c) => ({ id: c.id, mode })),
      // Upload what only this device knows (handled before sync existed, or while offline).
      ...[...(local ?? [])]
        .filter((id) => remoteIds !== null && !have.has(id) && !handled.some((c) => c.id === id))
        .slice(-MAX_SYNC_BACKFILL)
        .map((id) => ({ id, mode: 'off' as CelebrationLevel })),
    ];
    if (items.length > 0) {
      try {
        await args.remote.record(items);
      } catch {
        /* kept on this device; uploaded on the next run */
      }
    }
  }
  return show;
}
