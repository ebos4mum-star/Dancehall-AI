import { z } from 'zod';

/** Structured model output. Everything the model returns is validated against these before the app sees it. */
const confidence = z.enum(['low', 'medium', 'high']);

export const foodPhotoItemSchema = z.object({
  name: z.string().min(1).max(80),
  likelyIngredients: z.array(z.string().max(60)).max(12),
  gramsLow: z.number().positive(),
  gramsHigh: z.number().positive(),
  confidence,
  /** Suggested reference-database search terms; the server grounds each item in nutrition reference data. */
  referenceQuery: z.string().min(1).max(80),
});
export const foodPhotoResponseSchema = z
  .object({
    items: z.array(foodPhotoItemSchema).max(15),
    /** Always true: the UI must present the result as an editable estimate. */
    isEstimate: z.literal(true),
    notes: z.string().max(280).optional(),
  })
  .refine((r) => r.items.every((i) => i.gramsHigh >= i.gramsLow), 'gramsHigh must be >= gramsLow');
export type FoodPhotoResponse = z.infer<typeof foodPhotoResponseSchema>;

/** A change the assistant proposes. It is never applied until the user confirms it in the app. */
export const proposedChangeSchema = z.object({
  kind: z.enum(['update_daily_plan', 'add_workout', 'swap_meal', 'adjust_goal', 'add_habit']),
  summary: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
});
export const conciergeResponseSchema = z.object({
  message: z.string().min(1).max(1500),
  /** Why the assistant suggested this, in plain language (transparent recommendations). */
  because: z.array(z.string().max(200)).max(5),
  proposedChanges: z.array(proposedChangeSchema).max(5),
  /** Set when the assistant steered toward professional or crisis support instead of coaching. */
  supportReferral: z.boolean().default(false),
});
export type ConciergeResponse = z.infer<typeof conciergeResponseSchema>;

export const weeklyReviewResponseSchema = z.object({
  highlights: z.array(z.string().max(200)).min(1).max(5),
  nonScaleWins: z.array(z.string().max(200)).max(5),
  suggestions: z.array(z.string().max(200)).max(3),
  /** Tone guard: the review never shames; the validator in the gateway also rejects guilt language. */
  tone: z.literal('encouraging'),
});
export type WeeklyReviewResponse = z.infer<typeof weeklyReviewResponseSchema>;

export const AI_RESPONSE_SCHEMAS = {
  food_photo: foodPhotoResponseSchema,
  concierge_chat: conciergeResponseSchema,
  weekly_review: weeklyReviewResponseSchema,
} as const;
export type SchemaFeature = keyof typeof AI_RESPONSE_SCHEMAS;

const GUILT_LANGUAGE =
  /\b(you failed|lazy|you should be ashamed|bad food|cheat(ed|ing)? day|no excuses|disappointing)\b/i;
export const containsGuiltLanguage = (text: string): boolean => GUILT_LANGUAGE.test(text);
