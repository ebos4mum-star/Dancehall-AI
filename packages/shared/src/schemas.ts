import { z } from 'zod';
import { MIN_USER_AGE_YEARS } from './config';

export const unitSystemSchema = z.enum(['metric', 'imperial']);
export const sexSchema = z.enum(['female', 'male', 'unspecified']);
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 country code');
export const timeZoneSchema = z.string().min(1).max(64);

function ageOn(birthDate: string, now: Date): number {
  const b = new Date(`${birthDate}T00:00:00Z`);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}
export const ageYearsOn = ageOn;

/** Adults only: a birth date that makes the person under 18 fails validation. */
export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date')
  .refine(
    (s) => ageOn(s, new Date()) >= MIN_USER_AGE_YEARS,
    `Must be ${MIN_USER_AGE_YEARS} or older`,
  )
  .refine((s) => ageOn(s, new Date()) <= 120, 'Invalid date');

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  country: countryCodeSchema,
  timeZone: timeZoneSchema,
  unitSystem: unitSystemSchema,
  locale: z.string().min(2).max(10).default('en'),
});

export const weightEntrySchema = z.object({
  /** Canonical kilograms. The UI converts from the user's unit before this point. */
  weightKg: z.number().min(25).max(400),
  measuredAt: z.iso.datetime(),
});

export const goalPeriodSchema = z.enum(['weekly', 'monthly', 'yearly']);
export const goalTypeSchema = z.enum(['lose', 'maintain', 'gain']);
export const goalInputSchema = z.object({
  type: goalTypeSchema,
  period: goalPeriodSchema,
  targetKg: z.number().min(25).max(400).optional(),
});

export const consentPurposeSchema = z.enum([
  'health_data_processing',
  'ai_processing_of_food_photos',
  'ai_coach_personalization',
  'health_platform_sync',
  'social_sharing',
]);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;
