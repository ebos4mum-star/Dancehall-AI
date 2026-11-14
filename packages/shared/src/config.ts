/** Shared, non-secret product configuration. Secrets never belong here. */
export const MIN_USER_AGE_YEARS = 18;
export const DEFAULT_AI_MONTHLY_BUDGET_USD = 50;
export const PRO_TEST_PRICE_USD_MONTHLY = 9.99;

export const SUPPORTED_LOCALES = ['en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Feature flags. Everything that is not part of the Phase 0B shell starts OFF. */
export const FEATURE_FLAGS = [
  'ai_gateway',
  'ai_food_photo',
  'ai_concierge',
  'ai_voice',
  'barcode_scanner',
  'social_challenges',
  'dance_to_share',
  'households',
  'sponsored_challenges',
  'subscriptions',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const DEFAULT_FEATURE_FLAGS: Readonly<Record<FeatureFlag, boolean>> = Object.freeze(
  Object.fromEntries(FEATURE_FLAGS.map((f) => [f, false])) as Record<FeatureFlag, boolean>,
);

/** Features permanently excluded from the product. A test keeps them out of every flag and schema. */
export const EXCLUDED_FEATURES = ['money_staking', 'deposit_forfeiture', 'cash_penalty'] as const;
