import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { createPinVault, type PinVault, type VaultStorage } from './pinVault';

/**
 * Where the PIN record lives. On a phone it is the Keychain (or Keystore), readable only while the device is unlocked and NOT carried to another device or into a
 * backup. The browser build used for development tests has no secure storage, so it uses localStorage there, which is not secure and exists only so the web
 * preview can be tested; the web build is not a shipping target.
 */
const native: VaultStorage = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) =>
    SecureStore.setItemAsync(k, v, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (k) => SecureStore.deleteItemAsync(k),
};
const web: VaultStorage = {
  get: async (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: async (k, v) => {
    globalThis.localStorage?.setItem(k, v);
  },
  remove: async (k) => {
    globalThis.localStorage?.removeItem(k);
  },
};

export const vaultStorage: VaultStorage = Platform.OS === 'web' ? web : native;
export const defaultVault = (): PinVault =>
  createPinVault({ storage: vaultStorage, random: (n) => getRandomBytes(n) });
