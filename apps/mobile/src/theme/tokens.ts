/**
 * Design tokens. Pure data (no React Native imports) so they can be unit-tested, including contrast.
 * Pairs below are verified to meet WCAG AA (4.5:1 for text) by tokens.test.ts.
 * The final visual identity requires owner approval; these are a foundation, not the brand.
 */
export interface ColorTokens {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  success: string;
  warningBg: string;
  warningText: string;
  border: string;
  /** Hero gradient (premium, energetic). White text is verified on both stops. */
  heroFrom: string;
  heroTo: string;
  onHero: string;
  successBg: string;
}

export const lightColors: ColorTokens = {
  background: '#FFF9F4',
  surface: '#FFFFFF',
  text: '#1F1633',
  textMuted: '#5B5170',
  primary: '#B3124F',
  onPrimary: '#FFFFFF',
  accent: '#FFD166',
  onAccent: '#1F1633',
  success: '#0B6B4F',
  warningBg: '#FFF1D6',
  warningText: '#8A4B00',
  border: '#E6DCEB',
  heroFrom: '#B3124F',
  heroTo: '#4B1D9E',
  onHero: '#FFFFFF',
  successBg: '#E3F5EE',
};

export const darkColors: ColorTokens = {
  background: '#150E26',
  surface: '#241A3D',
  text: '#F6F0FF',
  textMuted: '#B9AED0',
  primary: '#FF7AA8',
  onPrimary: '#150E26',
  accent: '#FFD166',
  onAccent: '#150E26',
  success: '#6EE7B7',
  warningBg: '#3A2A12',
  warningText: '#FFD166',
  border: '#3A2D5C',
  heroFrom: '#9C1A55',
  heroTo: '#36207F',
  onHero: '#FFFFFF',
  successBg: '#12382E',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;
export type TypographyVariant = keyof typeof typography;

/** Motion: short and purposeful. With reduced motion enabled, durations collapse to 0 (no animation). */
export const motion = { fast: 150, normal: 250, slow: 400 } as const;

/** Minimum touch target (points), per platform accessibility guidance. */
export const MIN_TOUCH_TARGET = 44;

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
