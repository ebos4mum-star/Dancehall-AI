import {
  COSMETICS,
  DEFAULT_GM_PREFS,
  normalizePrefs,
  type CosmeticId,
  type GmPrefs,
} from '@dancehall/shared';
import { deviceRaw, type PrefsRaw } from '../health/prefs';
import { EMPTY_SEEN, type SeenState } from './rewards';

/** Per account, on this phone: the person's own progression settings, and which accessories they took off Pulse. */
export interface GmDevicePrefs extends GmPrefs {
  /** Kept for older saved settings; the "last seen" state now lives in `SeenState`. */
  levelSeen: number;
  /** Accessories the person took off. Everything unlocked is worn unless it is on this list, so a new unlock is worn straight away. */
  takenOff: CosmeticId[];
}
export const gmPrefsKey = (userId: string) => `dh.gm.v1.${userId}`;
export const DEFAULT_DEVICE_PREFS: GmDevicePrefs = {
  ...DEFAULT_GM_PREFS,
  levelSeen: 1,
  takenOff: [],
};

const COSMETIC_IDS = new Set<string>(COSMETICS.map((c) => c.id));
export const cleanList = (v: unknown): CosmeticId[] =>
  Array.isArray(v)
    ? ([
        ...new Set(v.filter((x): x is CosmeticId => typeof x === 'string' && COSMETIC_IDS.has(x))),
      ] as CosmeticId[])
    : [];

/** What Pulse wears: everything unlocked, except what the person took off. */
export const wornCosmetics = (
  unlocked: readonly CosmeticId[],
  takenOff: readonly CosmeticId[],
): CosmeticId[] => unlocked.filter((c) => !takenOff.includes(c));

export async function readGmPrefs(raw: PrefsRaw, userId: string): Promise<GmDevicePrefs> {
  try {
    const p = JSON.parse((await raw.get(gmPrefsKey(userId))) ?? 'null') as Record<
      string,
      unknown
    > | null;
    if (!p) return DEFAULT_DEVICE_PREFS;
    const seen = Number(p.levelSeen);
    return {
      ...normalizePrefs(p as Partial<GmPrefs>),
      levelSeen: Number.isFinite(seen) ? Math.min(100, Math.max(1, Math.floor(seen))) : 1,
      takenOff: cleanList(p.takenOff),
    };
  } catch {
    return DEFAULT_DEVICE_PREFS;
  }
}
export async function writeGmPrefs(raw: PrefsRaw, userId: string, p: GmDevicePrefs): Promise<void> {
  await raw.set(
    gmPrefsKey(userId),
    JSON.stringify({
      ...normalizePrefs(p),
      levelSeen: p.levelSeen,
      takenOff: cleanList(p.takenOff),
    }),
  );
}

export const gmSeenKey = (userId: string) => `dh.gm.seen.v1.${userId}`;
export async function readSeen(raw: PrefsRaw, userId: string): Promise<SeenState> {
  try {
    const p = JSON.parse((await raw.get(gmSeenKey(userId))) ?? 'null') as Partial<SeenState> | null;
    if (!p || p.baselined !== true) return EMPTY_SEEN;
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-200) : [];
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
    return {
      baselined: true,
      xpSeen: num(p.xpSeen, 0),
      levelSeen: Math.max(1, num(p.levelSeen, 1)),
      badgesSeen: arr(p.badgesSeen),
      cosmeticsSeen: arr(p.cosmeticsSeen),
      questsSeen: arr(p.questsSeen),
      streakMilestoneSeen: num(p.streakMilestoneSeen, 0),
      seasonDoneSeen: typeof p.seasonDoneSeen === 'string' ? p.seasonDoneSeen : null,
      toastDay: typeof p.toastDay === 'string' ? p.toastDay : '',
      toastCount: num(p.toastCount, 0),
    };
  } catch {
    return EMPTY_SEEN;
  }
}
export async function writeSeen(raw: PrefsRaw, userId: string, s: SeenState): Promise<void> {
  await raw.set(gmSeenKey(userId), JSON.stringify(s));
}
export { deviceRaw };
