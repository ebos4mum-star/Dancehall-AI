/**
 * Design tokens. Pure data (no React Native imports) so they can be unit-tested, including contrast.
 * Pairs below are verified to meet WCAG AA (4.5:1 for text) by tokens.test.ts.
 * Palette: Midnight Plum, Electric Lime, Warm Coral, Warm Ivory, Soft Violet (owner-specified; final values remain subject to owner approval).
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

/** Approved brand palette (docs/UI_UX_DESIGN_DIRECTION.md section 2). Lime, Coral and Violet are never text on a light surface. */
export const brand = {
  plum: '#24143D',
  lime: '#B8F244',
  coral: '#FF785E',
  ivory: '#F7F4EE',
  violet: '#9D80EB',
} as const;

/** Light: plum actions with lime labels on ivory. `primary` is also the text-safe accent, so it is plum here. */
export const lightColors: ColorTokens = {
  background: brand.ivory,
  surface: '#FFFFFF',
  text: brand.plum,
  textMuted: '#5A4B73',
  primary: brand.plum,
  onPrimary: brand.lime,
  accent: brand.coral,
  onAccent: brand.plum,
  success: '#0B6B4F',
  warningBg: '#FFF1D6',
  warningText: '#8A4B00',
  border: '#DDD3EA',
  heroFrom: brand.plum,
  heroTo: '#4A2B8C',
  onHero: brand.ivory,
  successBg: '#E3F5EE',
};

/** Dark: midnight plum surfaces, ivory text, lime actions. */
export const darkColors: ColorTokens = {
  background: '#1A0E2E',
  surface: brand.plum,
  text: brand.ivory,
  textMuted: '#C5B8DD',
  primary: brand.lime,
  onPrimary: brand.plum,
  accent: brand.coral,
  onAccent: brand.plum,
  success: brand.lime,
  warningBg: '#3A2A12',
  warningText: '#FFD166',
  border: '#3D2C63',
  heroFrom: brand.plum,
  heroTo: '#4A2B8C',
  onHero: brand.ivory,
  successBg: '#26401A',
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
