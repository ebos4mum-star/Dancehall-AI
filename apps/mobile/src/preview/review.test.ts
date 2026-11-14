import { describe, expect, it } from 'vitest';
import { reviewEnabled } from './review';

describe('review aids are preview-only', () => {
  it('need the explicit flag, a non-production environment and mock authentication', () => {
    expect(reviewEnabled({})).toBe(false);
    expect(reviewEnabled({ EXPO_PUBLIC_PREVIEW_REVIEW: '1' })).toBe(true);
    expect(
      reviewEnabled({ EXPO_PUBLIC_PREVIEW_REVIEW: '1', EXPO_PUBLIC_APP_ENV: 'production' }),
    ).toBe(false);
    expect(
      reviewEnabled({ EXPO_PUBLIC_PREVIEW_REVIEW: '1', EXPO_PUBLIC_AUTH_MODE: 'supabase' }),
    ).toBe(false);
    expect(reviewEnabled({ EXPO_PUBLIC_PREVIEW_REVIEW: 'true' })).toBe(false);
  });
});
