/** Resolves which data adapter the app uses and refuses unsafe combinations. Pure so it can be unit-tested. */
export type AppEnv = 'development' | 'preview' | 'production';
/**
 * Which product database a barcode scan may use. `off` contacts nothing. `local` is the offline list of SYNTHETIC sample products (development and review builds only).
 * `open_food_facts` sends the barcode number (and, unavoidably, the phone's network address) to Open Food Facts: it needs the owner's approval of the licence and privacy
 * terms before it is switched on, and is never the default.
 */
export type BarcodeProviderId = 'off' | 'local' | 'open_food_facts';

export interface AppConfig {
  barcodeProvider: BarcodeProviderId;
  /**
   * Whether this build offers Community. ON in the development mock build (synthetic sample members, clearly labelled); OFF everywhere else unless EXPO_PUBLIC_COMMUNITY=1.
   * A production build refuses to start with it on: a public feed needs the moderation process, the database rules and the security verification in
   * docs/COMMUNITY.md first, and lifting this needs a deliberate code change and its own review.
   */
  community: boolean;
  /**
   * Whether this build offers Friends, sharing and group goals. ON in the development mock (synthetic sample members); OFF everywhere else unless EXPO_PUBLIC_SOCIAL=1.
   * A production build refuses to start with it on: it needs the social schema applied to a reviewed backend first (supabase/proposed/social.up.sql, not applied).
   */
  social: boolean;
  /** Public support address shown for appeals and questions. Not a secret. Absent until the owner sets one. */
  supportEmail?: string;
  /** Public https address of the published privacy policy and support page. Not secrets. Absent until the owner publishes them; the app shows a link only when set. */
  privacyPolicyUrl?: string;
  supportUrl?: string;
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

/** The exact value that confirms the account backend is live and reviewed. A build profile sets it only after the hosted account gates have passed. */
export const PRODUCTION_ACCOUNTS_ACK = 'backend-live-and-reviewed';

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
  if (appEnv === 'production' && env.EXPO_PUBLIC_COMMUNITY === '1')
    throw new ConfigError(
      'Community is not allowed in a production build yet. Remove EXPO_PUBLIC_COMMUNITY.',
    );
  if (appEnv === 'production' && env.EXPO_PUBLIC_SOCIAL === '1')
    throw new ConfigError(
      'Friends and group goals are not allowed in a production build yet. Remove EXPO_PUBLIC_SOCIAL.',
    );
  const rawSupport = env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  if (rawSupport && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawSupport))
    throw new ConfigError('EXPO_PUBLIC_SUPPORT_EMAIL must be an email address.');
  const supportEmail = rawSupport || undefined;
  const publicUrl = (
    name: 'EXPO_PUBLIC_PRIVACY_POLICY_URL' | 'EXPO_PUBLIC_SUPPORT_URL',
  ): string | undefined => {
    const v = env[name]?.trim();
    if (!v) return undefined;
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(v) || /[\s"'<>]/.test(v))
      throw new ConfigError(`${name} must be an https address.`);
    return v;
  };
  const privacyPolicyUrl = publicUrl('EXPO_PUBLIC_PRIVACY_POLICY_URL');
  const supportUrl = publicUrl('EXPO_PUBLIC_SUPPORT_URL');
  const rawBarcode = env.EXPO_PUBLIC_BARCODE_PROVIDER?.trim();
  if (rawBarcode && !['off', 'local', 'open_food_facts'].includes(rawBarcode))
    throw new ConfigError(`Unknown EXPO_PUBLIC_BARCODE_PROVIDER "${rawBarcode}"`);
  if (rawBarcode === 'local' && appEnv === 'production')
    throw new ConfigError(
      'The barcode sample list is synthetic and is not allowed in a production build.',
    );
  // Safe by default: sample products only in development and review builds, nothing at all in production.
  const barcodeProvider = (rawBarcode ??
    (appEnv === 'production' ? 'off' : 'local')) as BarcodeProviderId;
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
    return {
      appEnv,
      authMode: 'mock',
      contentFixtures,
      cloudAccounts: true,
      barcodeProvider,
      community: env.EXPO_PUBLIC_COMMUNITY !== '0',
      social: env.EXPO_PUBLIC_SOCIAL !== '0',
      supportEmail,
      privacyPolicyUrl,
      supportUrl,
    };
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
  // A production build can offer account creation (App Review needs it for every account feature), but only on purpose: the flag AND a separate acknowledgement
  // that the account backend is live and reviewed. Neither alone is enough, so an EAS profile, a copied .env or a mistaken variable cannot switch it on by accident.
  // This changes WHEN accounts may be offered, never HOW people sign in (PIN-first, email-free) or recover.
  if (
    appEnv === 'production' &&
    env.EXPO_PUBLIC_CLOUD_ACCOUNTS === '1' &&
    env.EXPO_PUBLIC_PRODUCTION_ACCOUNTS !== PRODUCTION_ACCOUNTS_ACK
  )
    throw new ConfigError(
      'Cloud accounts in a production build need EXPO_PUBLIC_PRODUCTION_ACCOUNTS to confirm the account backend is live and reviewed. Remove EXPO_PUBLIC_CLOUD_ACCOUNTS until then.',
    );
  return {
    appEnv,
    authMode: 'supabase',
    supabaseUrl: url,
    supabasePublishableKey: key,
    aiApiUrl: ai,
    contentFixtures,
    cloudAccounts: env.EXPO_PUBLIC_CLOUD_ACCOUNTS === '1',
    barcodeProvider,
    community: env.EXPO_PUBLIC_COMMUNITY === '1',
    social: env.EXPO_PUBLIC_SOCIAL === '1',
    supportEmail,
    privacyPolicyUrl,
    supportUrl,
  };
}
