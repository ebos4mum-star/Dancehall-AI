import { View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export function Notice({
  children,
  tone = 'info',
}: {
  children: string;
  tone?: 'info' | 'warning';
}) {
  const { colors, radius, spacing } = useTheme();
  const bg = tone === 'warning' ? colors.warningBg : colors.surface;
  const fg = tone === 'warning' ? colors.warningText : colors.text;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: bg,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AppText variant="caption" style={{ color: fg }}>
        {children}
      </AppText>
    </View>
  );
}
