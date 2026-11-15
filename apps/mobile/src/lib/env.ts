/** Resolves which data adapter the app uses and refuses unsafe combinations. Pure so it can be unit-tested. */
export type AppEnv = 'development' | 'preview' | 'production';
export interface AppConfig {
  appEnv: AppEnv;
  authMode: 'mock' | 'supabase';
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  /** Server AI gateway base URL. Not a secret. Absent until the owner deploys the gateway. */
  aiApiUrl?: string;
  /**
   * Internal test fixtures (placeholder Dancehall, reggae, chair dance, seated and strength sessions) for development and review builds only. They are not real
   * content. A production build refuses to start with this on.
   */
  contentFixtures: boolean;
  /**
   * Whether this build offers cloud account creation and recovery. Always on in the development mock build (a clearly-labelled local SIMULATION). In a Supabase build
   * it is OFF unless EXPO_PUBLIC_CLOUD_ACCOUNTS=1, because it needs the account Edge Function and migration deployed and authorised first.
   */
  cloudAccounts: boolean;
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
  const contentFixtures = env.EXPO_PUBLIC_CONTENT_FIXTURES === '1';
  if (contentFixtures && appEnv === 'production')
    throw new ConfigError(
      'Internal content fixtures are for development and review builds only and are not allowed in a production build.',
    );
  const requested = env.EXPO_PUBLIC_AUTH_MODE ?? (url && key ? 'supabase' : 'mock');
  if (requested !== 'mock' && requested !== 'supabase')
    throw new ConfigError(`Unknown EXPO_PUBLIC_AUTH_MODE "${requested}"`);

  if (requested === 'mock') {
    if (appEnv === 'production')
      throw new ConfigError(
        'Mock authentication is development-only and is not allowed in a production build.',
      );
    return { appEnv, authMode: 'mock', contentFixtures, cloudAccounts: true };
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
  // Cloud accounts are being rolled out on development and preview builds only. A production build refuses to start with the flag on, so it cannot be switched
  // on there by accident (an EAS profile, a copied .env, a mistaken variable); lifting this needs a deliberate code change and its own review.
  if (appEnv === 'production' && env.EXPO_PUBLIC_CLOUD_ACCOUNTS === '1')
    throw new ConfigError(
      'Cloud accounts are not allowed in a production build yet. Remove EXPO_PUBLIC_CLOUD_ACCOUNTS.',
    );
  return {
    appEnv,
    authMode: 'supabase',
    supabaseUrl: url,
    supabasePublishableKey: key,
    aiApiUrl: ai,
    contentFixtures,
    cloudAccounts: env.EXPO_PUBLIC_CLOUD_ACCOUNTS === '1',
  };
}
