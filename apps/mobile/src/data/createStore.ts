import { AppState } from 'react-native';
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
    EXPO_PUBLIC_AI_API_URL: process.env.EXPO_PUBLIC_AI_API_URL,
    EXPO_PUBLIC_CONTENT_FIXTURES: process.env.EXPO_PUBLIC_CONTENT_FIXTURES,
    EXPO_PUBLIC_CLOUD_ACCOUNTS: process.env.EXPO_PUBLIC_CLOUD_ACCOUNTS,
    EXPO_PUBLIC_BARCODE_PROVIDER: process.env.EXPO_PUBLIC_BARCODE_PROVIDER,
    EXPO_PUBLIC_COMMUNITY: process.env.EXPO_PUBLIC_COMMUNITY,
    EXPO_PUBLIC_PRODUCTION_ACCOUNTS: process.env.EXPO_PUBLIC_PRODUCTION_ACCOUNTS,
    EXPO_PUBLIC_SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    EXPO_PUBLIC_SUPPORT_URL: process.env.EXPO_PUBLIC_SUPPORT_URL,
  });
}

export function createStore(config: AppConfig): DataStore {
  if (config.authMode === 'supabase') {
    return createSupabaseStore({
      url: config.supabaseUrl!,
      publishableKey: config.supabasePublishableKey!,
      aiApiUrl: config.aiApiUrl,
      storage: secureStorage,
      appState: AppState,
    });
  }
  return new MockStore({
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  });
}
