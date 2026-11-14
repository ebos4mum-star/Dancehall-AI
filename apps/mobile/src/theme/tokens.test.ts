import { describe, expect, it } from 'vitest';
import { contrastRatio, darkColors, lightColors, type ColorTokens } from './tokens';

const textPairs: Array<[keyof ColorTokens, keyof ColorTokens]> = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
  ['primary', 'background'],
  ['success', 'background'],
  ['warningText', 'warningBg'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s palette', (_n, c) => {
  it.each(textPairs)('%s on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
