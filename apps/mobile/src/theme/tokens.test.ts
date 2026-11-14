import { describe, expect, it } from 'vitest';
import { brand, contrastRatio, darkColors, lightColors, type ColorTokens } from './tokens';

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
  ['onHero', 'heroFrom'],
  ['onHero', 'heroTo'],
  ['success', 'successBg'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s palette', (_n, c) => {
  it.each(textPairs)('%s on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('brand palette', () => {
  it('uses the approved values', () => {
    expect(brand).toEqual({
      plum: '#24143D',
      lime: '#B8F244',
      coral: '#FF785E',
      ivory: '#F7F4EE',
      violet: '#9D80EB',
    });
  });
  it('text on brand fills meets AA', () => {
    expect(contrastRatio(brand.plum, brand.lime)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.plum, brand.coral)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.plum, brand.violet)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.plum, brand.ivory)).toBeGreaterThanOrEqual(4.5);
  });
  it('documents that lime, coral and violet fail as text on ivory (so they are never used that way)', () => {
    for (const c of [brand.lime, brand.coral, brand.violet])
      expect(contrastRatio(c, brand.ivory)).toBeLessThan(4.5);
  });
  it('the light primary action is text-safe everywhere it doubles as an accent', () => {
    expect(contrastRatio(lightColors.primary, lightColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightColors.primary, lightColors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColors.primary, darkColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColors.primary, darkColors.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it('text on the accent and warning surfaces is readable in both modes', () => {
    for (const c of [lightColors, darkColors]) {
      expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.text, c.warningBg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('contrast of the pairs used by the redesign', () => {
  it('ivory text on the scene plum and on the legibility scrim', () => {
    expect(contrastRatio(brand.ivory, brand.plum)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.ivory, '#1A0E2E')).toBeGreaterThanOrEqual(4.5);
  });
  it('plum on lime (play button, send button, active tab) and plum on coral (simulated tags)', () => {
    expect(contrastRatio(brand.plum, brand.lime)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.plum, brand.coral)).toBeGreaterThanOrEqual(4.5);
  });
  it('lime on plum (Next up block, dark-mode primary) in both directions of the pair', () => {
    expect(contrastRatio(brand.lime, brand.plum)).toBeGreaterThanOrEqual(4.5);
  });
  it('status tiles: success on its background and warning text on its background, both themes', () => {
    for (const c of [lightColors, darkColors]) {
      expect(contrastRatio(c.success, c.successBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.warningText, c.warningBg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
