import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_GATES,
  AppError,
  DEFAULT_FEATURE_FLAGS,
  EXCLUDED_FEATURES,
  FEATURE_FLAGS,
  FREE_ENTITLEMENT,
  PERMISSIONS,
  STAFF_ROLES,
  activeTier,
  birthDateSchema,
  checkAiAccess,
  estimateLabel,
  hasPermission,
  isCountryActive,
  kcalRange,
  macrosForGrams,
  missingGates,
  profileInputSchema,
  sumMacros,
  toAppError,
  weightEntrySchema,
  ROLE_PERMISSIONS,
} from './index';

describe('countries', () => {
  it('requires the switch and every gate', () => {
    const gates = Object.fromEntries(ACTIVATION_GATES.map((g) => [g, true]));
    expect(isCountryActive({ country: 'GB', gates, enabled: true })).toBe(true);
    expect(isCountryActive({ country: 'GB', gates, enabled: false })).toBe(false);
    const partial = { ...gates, billing_and_tax_reviewed: false };
    expect(isCountryActive({ country: 'GB', gates: partial, enabled: true })).toBe(false);
    expect(missingGates({ country: 'GB', gates: partial, enabled: true })).toEqual([
      'billing_and_tax_reviewed',
    ]);
    expect(isCountryActive(undefined)).toBe(false);
  });
});

describe('feature flags and exclusions', () => {
  it('starts every flag off', () => {
    expect(FEATURE_FLAGS.every((f) => DEFAULT_FEATURE_FLAGS[f] === false)).toBe(true);
  });
  it('keeps money-staking out of flags and permissions', () => {
    for (const x of EXCLUDED_FEATURES) {
      expect(FEATURE_FLAGS as readonly string[]).not.toContain(x);
      expect(PERMISSIONS as readonly string[]).not.toContain(x);
    }
  });
});

describe('entitlements', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  const pro = {
    tier: 'pro' as const,
    expiresAt: '2026-07-01T00:00:00Z',
    source: 'app_store' as const,
  };
  it('expires paid tiers', () => {
    expect(activeTier(pro, now)).toBe('pro');
    expect(activeTier({ ...pro, expiresAt: '2026-06-01T00:00:00Z' }, now)).toBe('free');
    expect(activeTier({ ...pro, expiresAt: null }, now)).toBe('free');
  });
  it('gates AI on flag, tier and quota', () => {
    const flags = { ai_gateway: true };
    expect(
      checkAiAccess({
        entitlement: FREE_ENTITLEMENT,
        feature: 'food_photo',
        usedThisMonth: 0,
        flags: {},
      }).reason,
    ).toBe('feature_flag_off');
    expect(
      checkAiAccess({ entitlement: FREE_ENTITLEMENT, feature: 'voice', usedThisMonth: 0, flags })
        .reason,
    ).toBe('not_in_tier');
    expect(
      checkAiAccess({
        entitlement: FREE_ENTITLEMENT,
        feature: 'food_photo',
        usedThisMonth: 5,
        flags,
      }).reason,
    ).toBe('quota_used');
    expect(
      checkAiAccess({ entitlement: pro, feature: 'voice', usedThisMonth: 3, flags, now }),
    ).toEqual({ allowed: true, remaining: 57 });
  });
});

describe('staff permissions', () => {
  it('requires MFA for everyone, including admin', () => {
    for (const role of STAFF_ROLES)
      for (const p of ROLE_PERMISSIONS[role])
        expect(hasPermission(role, p, { mfaVerified: false })).toBe(false);
    expect(hasPermission('admin', 'audit.view', { mfaVerified: true })).toBe(true);
  });
  it('enforces least privilege', () => {
    expect(hasPermission('support', 'content.publish', { mfaVerified: true })).toBe(false);
    expect(hasPermission('moderator', 'flags.manage', { mfaVerified: true })).toBe(false);
    expect(hasPermission(null, 'audit.view', { mfaVerified: true })).toBe(false);
  });
  it('grants no health-data permission to any role', () => {
    expect((PERMISSIONS as readonly string[]).some((p) => /health|weight|food_log/.test(p))).toBe(
      false,
    );
  });
});

describe('nutrition', () => {
  const rice = { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 };
  it('scales and sums macros', () => {
    expect(macrosForGrams(rice, 200).kcal).toBeCloseTo(260);
    expect(sumMacros([rice, rice]).carbsG).toBeCloseTo(56);
  });
  it('widens ranges as confidence drops', () => {
    const hi = kcalRange(500, 'high');
    const lo = kcalRange(500, 'low');
    expect(lo.high - lo.low).toBeGreaterThan(hi.high - hi.low);
    expect(lo.low).toBeLessThan(500);
    expect(lo.high).toBeGreaterThan(500);
  });
  it('labels AI estimates honestly and never as exact', () => {
    const label = estimateLabel({ source: 'ai_estimate', confidence: 'low', userEdited: false });
    expect(label).toMatch(/estimate/i);
    expect(label).not.toMatch(/exact/i);
    expect(estimateLabel({ source: 'ai_estimate', confidence: 'low', userEdited: true })).toBe(
      'Edited by you',
    );
  });
});

describe('schemas and errors', () => {
  it('rejects under-18 birth dates', () => {
    const d = new Date();
    const young = `${d.getUTCFullYear() - 17}-01-01`;
    const adult = `${d.getUTCFullYear() - 30}-01-01`;
    expect(birthDateSchema.safeParse(young).success).toBe(false);
    expect(birthDateSchema.safeParse(adult).success).toBe(true);
    expect(birthDateSchema.safeParse('not-a-date').success).toBe(false);
  });
  it('validates profile and weight input', () => {
    expect(
      profileInputSchema.safeParse({
        displayName: 'Ama',
        country: 'GH',
        timeZone: 'Africa/Accra',
        unitSystem: 'metric',
      }).success,
    ).toBe(true);
    expect(
      profileInputSchema.safeParse({
        displayName: '',
        country: 'gh',
        timeZone: 'x',
        unitSystem: 'metric',
      }).success,
    ).toBe(false);
    expect(
      weightEntrySchema.safeParse({ weightKg: 70, measuredAt: '2026-01-01T10:00:00Z' }).success,
    ).toBe(true);
    expect(
      weightEntrySchema.safeParse({ weightKg: 5, measuredAt: '2026-01-01T10:00:00Z' }).success,
    ).toBe(false);
  });
  it('maps errors without leaking internals', () => {
    const e = toAppError(new Error('db password is hunter2'));
    expect(e.code).toBe('internal');
    expect(e.userMessage).not.toMatch(/hunter2/);
    expect(e.httpStatus).toBe(500);
    expect(new AppError('budget_exhausted', 'x').httpStatus).toBe(503);
  });
});
