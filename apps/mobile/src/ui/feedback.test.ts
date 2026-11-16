import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('./haptics', () => ({
  haptics: {
    tap: () => calls.push('tap'),
    capture: () => calls.push('capture'),
    success: () => calls.push('success'),
    warning: () => calls.push('warning'),
    celebrate: () => calls.push('celebrate'),
  },
}));
import { feedbackAllowed, play, type FeedbackKind } from './feedback';

const KINDS: FeedbackKind[] = ['select', 'success', 'milestone', 'reveal', 'error'];
beforeEach(() => (calls.length = 0));

describe('haptic vocabulary', () => {
  it('Off plays nothing, ever', () => {
    for (const k of KINDS) {
      expect(feedbackAllowed('off', k)).toBe(false);
      play('off', k);
    }
    expect(calls).toEqual([]);
  });
  it('Gentle plays only select, success and error', () => {
    expect(KINDS.filter((k) => feedbackAllowed('gentle', k))).toEqual([
      'select',
      'success',
      'error',
    ]);
    KINDS.forEach((k) => play('gentle', k));
    expect(calls).toEqual(['tap', 'success', 'warning']);
  });
  it('Full plays one distinct pattern per meaning', () => {
    KINDS.forEach((k) => play('full', k));
    expect(calls).toEqual(['tap', 'success', 'celebrate', 'capture', 'warning']);
  });
});
