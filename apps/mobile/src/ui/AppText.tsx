import { Text, type TextProps } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import type { TypographyVariant } from '@/theme/tokens';

interface Props extends TextProps {
  variant?: TypographyVariant;
  muted?: boolean;
}

export function AppText({ variant = 'body', muted = false, style, ...rest }: Props) {
  const { colors, typography } = useTheme();
  // Text scales with the user's system font size (allowFontScaling is on by default); we only cap extreme sizes.
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typography[variant], { color: muted ? colors.textMuted : colors.text }, style]}
    />
  );
}
