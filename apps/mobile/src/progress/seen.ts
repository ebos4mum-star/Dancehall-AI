import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SeenStore {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
export const deviceSeenStore: SeenStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
};
const key = (userId: string) => `dh.achievements.seen.${userId}`;

/** Celebrated ids for this person on this device. `null` means never recorded. Unreadable data is treated as never recorded. */
export async function readSeen(store: SeenStore, userId: string): Promise<string[] | null> {
  try {
    const raw = await store.get(key(userId));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}
export async function writeSeen(store: SeenStore, userId: string, ids: string[]): Promise<void> {
  try {
    await store.set(key(userId), JSON.stringify([...new Set(ids)]));
  } catch {
    // Celebration state is a convenience; failing to save it must never break the screen.
  }
}
