import { View } from 'react-native';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { useCountUp } from './motion';

/** A number with a label. The number counts up when it changes (instantly with reduced motion). */
export function StatTile({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const shown = useCountUp(value);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.xs,
        alignItems: 'center',
      }}
    >
      <AppText variant="title" style={{ color: colors.onHero }}>
        {String(shown)}
      </AppText>
      <AppText variant="caption" style={{ color: colors.onHero, textAlign: 'center' }}>
        {label}
      </AppText>
    </View>
  );
}
