import AsyncStorage from '@react-native-async-storage/async-storage';
import { clampHouseholdSize, HOUSEHOLD_MIN } from './grocery';

export interface SizeStore {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
export const deviceSizeStore: SizeStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
};
const key = (userId: string) => `dh.household.size.${userId}`;

/** How many people the person usually cooks for. Stored on this device only; no one else is identified or linked. */
export async function readHouseholdSize(store: SizeStore, userId: string): Promise<number> {
  try {
    const raw = await store.get(key(userId));
    return raw === null ? HOUSEHOLD_MIN : clampHouseholdSize(raw);
  } catch {
    return HOUSEHOLD_MIN;
  }
}
export async function writeHouseholdSize(
  store: SizeStore,
  userId: string,
  n: number,
): Promise<void> {
  try {
    await store.set(key(userId), String(clampHouseholdSize(n)));
  } catch {
    // A convenience setting; failing to save it must never break the list.
  }
}
