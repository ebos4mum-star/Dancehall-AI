import { useColorScheme } from 'react-native';
import { useReview } from '@/preview/review';
import { darkColors, lightColors, radius, spacing, typography, type ColorTokens } from './tokens';

export function useTheme(): {
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
} {
  const device = useColorScheme() === 'dark';
  const review = useReview();
  const isDark = review.dark ?? device;
  return { colors: isDark ? darkColors : lightColors, spacing, radius, typography, isDark };
}
