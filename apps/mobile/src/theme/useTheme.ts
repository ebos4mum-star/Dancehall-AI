import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, typography, type ColorTokens } from './tokens';

export function useTheme(): {
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  isDark: boolean;
} {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? darkColors : lightColors, spacing, radius, typography, isDark };
}
