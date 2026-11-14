import * as SecureStore from 'expo-secure-store';

// SecureStore values are limited to ~2KB; auth sessions are larger, so they are split into chunks.
const CHUNK = 1800;
const key = (k: string, i: number | 'n') => `${k.replace(/[^A-Za-z0-9._-]/g, '_')}.${i}`;

export const secureStorage = {
  async getItem(k: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(key(k, 'n'));
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(n); i++) {
      const p = await SecureStore.getItemAsync(key(k, i));
      if (p === null) return null;
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(k: string, v: string): Promise<void> {
    await this.removeItem(k);
    const count = Math.max(1, Math.ceil(v.length / CHUNK));
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(key(k, i), v.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(key(k, 'n'), String(count));
  },
  async removeItem(k: string): Promise<void> {
    const n = await SecureStore.getItemAsync(key(k, 'n'));
    for (let i = 0; i < Number(n ?? 0); i++) await SecureStore.deleteItemAsync(key(k, i));
    await SecureStore.deleteItemAsync(key(k, 'n'));
  },
};
