import { describe, expect, it } from 'vitest';
import { en } from './en';
import { t } from './index';

describe('i18n', () => {
  it('interpolates parameters and leaves unknown ones visible', () => {
    expect(t('onb.step', { n: 2, total: 5 })).toBe('Step 2 of 5');
    expect(t('today.hello', {})).toBe('Hello, {name}');
  });
  it('has a message for every store error code', () => {
    for (const c of [
      'not_authenticated',
      'adults_only',
      'invalid_birth_date',
      'consent_required',
      'profile_incomplete',
      'goal_period_mismatch',
      'goal_direction_mismatch',
      'goal_unsafe_underweight',
      'goal_target_below_healthy_range',
      'goal_pace_too_fast',
      'active_goal_exists',
      'invalid_input',
      'ai_consent_required',
      'quota_exceeded',
      'budget_exhausted',
      'feature_disabled',
      'ai_unavailable',
      'photo_already_deleted',
      'coach_consent_required',
      'goal_blocked',
      'not_found',
      'unknown',
    ]) {
      expect(en).toHaveProperty(`err.${c}`);
    }
  });
  it('never promises exact numbers or guaranteed results', () => {
    expect(Object.values(en).join(' ')).not.toMatch(/guarantee|exact calories|burn fat/i);
  });
});
