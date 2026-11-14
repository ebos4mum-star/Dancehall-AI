import { View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function ProgressBar({ fraction, label }: { fraction: number; label: string }) {
  const { colors, radius } = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{
        height: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.primary }} />
    </View>
  );
}
