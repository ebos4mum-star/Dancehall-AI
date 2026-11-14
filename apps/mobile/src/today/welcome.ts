export interface DayStore {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
}
const key = (userId: string) => `dh.pulse.welcomed.${userId}`;

/** True the first time Today is opened on a local day; remembers it. A storage failure means no welcome, never an error. */
export async function takeWelcome(
  store: DayStore,
  userId: string,
  dateKey: string,
): Promise<boolean> {
  try {
    if ((await store.get(key(userId))) === dateKey) return false;
    await store.set(key(userId), dateKey);
    return true;
  } catch {
    return false;
  }
}
