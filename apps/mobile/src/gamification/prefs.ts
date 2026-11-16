import { DEFAULT_GM_PREFS, normalizePrefs, type GmPrefs } from '@dancehall/shared';
import { deviceRaw, type PrefsRaw } from '@/health/prefs';

/** Per account, on this phone: the person's own progression settings, and the highest level they have already been congratulated for. */
export interface GmDevicePrefs extends GmPrefs {
  levelSeen: number;
}
export const gmPrefsKey = (userId: string) => `dh.gm.v1.${userId}`;
export const DEFAULT_DEVICE_PREFS: GmDevicePrefs = { ...DEFAULT_GM_PREFS, levelSeen: 1 };

export async function readGmPrefs(raw: PrefsRaw, userId: string): Promise<GmDevicePrefs> {
  try {
    const p = JSON.parse((await raw.get(gmPrefsKey(userId))) ?? 'null') as
      (Partial<GmDevicePrefs> & { levelSeen?: unknown }) | null;
    if (!p) return DEFAULT_DEVICE_PREFS;
    const seen = Number(p.levelSeen);
    return {
      ...normalizePrefs(p),
      levelSeen: Number.isFinite(seen) ? Math.min(100, Math.max(1, Math.floor(seen))) : 1,
    };
  } catch {
    return DEFAULT_DEVICE_PREFS;
  }
}
export async function writeGmPrefs(raw: PrefsRaw, userId: string, p: GmDevicePrefs): Promise<void> {
  await raw.set(
    gmPrefsKey(userId),
    JSON.stringify({ ...normalizePrefs(p), levelSeen: p.levelSeen }),
  );
}
export { deviceRaw };
