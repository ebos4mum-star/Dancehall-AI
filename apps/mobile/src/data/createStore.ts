import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveConfig, type AppConfig } from '@/lib/env';
import { MockStore } from './mockStore';
import { secureStorage } from './secureStorage';
import { createSupabaseStore } from './supabaseStore';
import type { DataStore } from './types';

/** Expo inlines only static `process.env.EXPO_PUBLIC_*` references, so each one is spelled out. */
export function readConfig(): AppConfig {
  return resolveConfig({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_AUTH_MODE: process.env.EXPO_PUBLIC_AUTH_MODE,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function createStore(config: AppConfig): DataStore {
  if (config.authMode === 'supabase') {
    return createSupabaseStore({
      url: config.supabaseUrl!,
      publishableKey: config.supabasePublishableKey!,
      storage: secureStorage,
    });
  }
  return new MockStore({
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  });
}
