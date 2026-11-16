import AsyncStorage from '@react-native-async-storage/async-storage';

/** Per-account, on this phone only: whether the person turned Apple Health import on, and when it last ran. Nothing here is sent anywhere. */
export interface HealthPrefs {
  enabled: boolean;
  lastSyncIso: string | null;
}
export interface PrefsRaw {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  remove(k: string): Promise<void>;
}
export const deviceRaw: PrefsRaw = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};
export const healthPrefsKey = (userId: string) => `dh.health.v1.${userId}`;

export async function readHealthPrefs(raw: PrefsRaw, userId: string): Promise<HealthPrefs> {
  try {
    const p = JSON.parse(
      (await raw.get(healthPrefsKey(userId))) ?? 'null',
    ) as Partial<HealthPrefs> | null;
    return {
      enabled: p?.enabled === true,
      lastSyncIso:
        typeof p?.lastSyncIso === 'string' && Number.isFinite(Date.parse(p.lastSyncIso))
          ? p.lastSyncIso
          : null,
    };
  } catch {
    return { enabled: false, lastSyncIso: null };
  }
}
export async function writeHealthPrefs(
  raw: PrefsRaw,
  userId: string,
  p: HealthPrefs,
): Promise<void> {
  await raw.set(healthPrefsKey(userId), JSON.stringify(p));
}
