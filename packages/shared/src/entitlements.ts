import type { FeatureFlag } from './config';

export type Tier = 'free' | 'pro' | 'household_pro';
export const TIERS: readonly Tier[] = ['free', 'pro', 'household_pro'];

export type AiFeature =
  | 'food_photo'
  | 'fridge_to_meal'
  | 'meal_plan'
  | 'food_swap'
  | 'menu_assist'
  | 'concierge_chat'
  | 'weekly_review'
  | 'voice';

/**
 * PROPOSED monthly AI allowances per tier (requests). These are placeholders to be tuned from measured
 * cost during beta; they are not commitments. 0 means the feature is not included in that tier.
 * Household Pro is a planned concept: its pricing and allowances are undecided and mirror Pro for now.
 */
export const PROPOSED_AI_ALLOWANCES: Readonly<Record<Tier, Readonly<Record<AiFeature, number>>>> = {
  free: {
    food_photo: 5,
    fridge_to_meal: 2,
    meal_plan: 1,
    food_swap: 10,
    menu_assist: 2,
    concierge_chat: 20,
    weekly_review: 1,
    voice: 0,
  },
  pro: {
    food_photo: 120,
    fridge_to_meal: 30,
    meal_plan: 8,
    food_swap: 100,
    menu_assist: 30,
    concierge_chat: 300,
    weekly_review: 5,
    voice: 60,
  },
  household_pro: {
    food_photo: 120,
    fridge_to_meal: 30,
    meal_plan: 8,
    food_swap: 100,
    menu_assist: 30,
    concierge_chat: 300,
    weekly_review: 5,
    voice: 60,
  },
};

export interface Entitlement {
  tier: Tier;
  /** ISO timestamp; null for free. Written only by trusted server code (store webhook). */
  expiresAt: string | null;
  source: 'none' | 'app_store' | 'google_play' | 'admin_grant';
}

export const FREE_ENTITLEMENT: Entitlement = { tier: 'free', expiresAt: null, source: 'none' };

export function activeTier(e: Entitlement, now: Date = new Date()): Tier {
  if (e.tier === 'free') return 'free';
  if (e.expiresAt === null) return 'free';
  return new Date(e.expiresAt).getTime() > now.getTime() ? e.tier : 'free';
}

export function monthlyAllowance(tier: Tier, feature: AiFeature): number {
  return PROPOSED_AI_ALLOWANCES[tier][feature];
}

export interface EntitlementCheck {
  allowed: boolean;
  reason?: 'feature_flag_off' | 'not_in_tier' | 'quota_used';
  remaining: number;
}

/** Pure check used by the AI gateway and the app. Server code remains the enforcement point. */
export function checkAiAccess(args: {
  entitlement: Entitlement;
  feature: AiFeature;
  usedThisMonth: number;
  flags: Readonly<Partial<Record<FeatureFlag, boolean>>>;
  now?: Date;
}): EntitlementCheck {
  if (!args.flags.ai_gateway) return { allowed: false, reason: 'feature_flag_off', remaining: 0 };
  const limit = monthlyAllowance(activeTier(args.entitlement, args.now), args.feature);
  if (limit === 0) return { allowed: false, reason: 'not_in_tier', remaining: 0 };
  const remaining = Math.max(0, limit - args.usedThisMonth);
  return remaining === 0
    ? { allowed: false, reason: 'quota_used', remaining: 0 }
    : { allowed: true, remaining };
}
