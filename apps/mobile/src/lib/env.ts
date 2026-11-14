/** Resolves which data adapter the app uses and refuses unsafe combinations. Pure so it can be unit-tested. */
export type AppEnv = 'development' | 'preview' | 'production';
export interface AppConfig {
  appEnv: AppEnv;
  authMode: 'mock' | 'supabase';
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  /** Server AI gateway base URL. Not a secret. Absent until the owner deploys the gateway. */
  aiApiUrl?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export function resolveConfig(env: Record<string, string | undefined>): AppConfig {
  const appEnv = (env.EXPO_PUBLIC_APP_ENV ?? 'development') as AppEnv;
  if (!['development', 'preview', 'production'].includes(appEnv))
    throw new ConfigError(`Unknown EXPO_PUBLIC_APP_ENV "${appEnv}"`);
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim() || undefined;
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || undefined;
  const requested = env.EXPO_PUBLIC_AUTH_MODE ?? (url && key ? 'supabase' : 'mock');
  if (requested !== 'mock' && requested !== 'supabase')
    throw new ConfigError(`Unknown EXPO_PUBLIC_AUTH_MODE "${requested}"`);

  if (requested === 'mock') {
    if (appEnv === 'production')
      throw new ConfigError(
        'Mock authentication is development-only and is not allowed in a production build.',
      );
    return { appEnv, authMode: 'mock' };
  }
  if (!url || !key)
    throw new ConfigError(
      'Supabase mode needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url))
    throw new ConfigError('The Supabase URL must use https.');
  // Everything in EXPO_PUBLIC_* ships inside the app. A secret or service-role key there would be a leak.
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role')
    throw new ConfigError(
      'A secret or service-role key must never be used in the app. Use the publishable key.',
    );
  const ai = env.EXPO_PUBLIC_AI_API_URL?.trim().replace(/\/+$/, '') || undefined;
  if (ai && !/^https:\/\//.test(ai) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(ai))
    throw new ConfigError('The AI service URL must use https.');
  return {
    appEnv,
    authMode: 'supabase',
    supabaseUrl: url,
    supabasePublishableKey: key,
    aiApiUrl: ai,
  };
}
