import { Animated, Pressable } from 'react-native';
import { MIN_TOUCH_TARGET, brand } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { haptics } from './haptics';
import { usePressScale } from './motion';

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'hero';
}) {
  const { colors, radius, spacing } = useTheme();
  const primary = variant === 'primary';
  const hero = variant === 'hero';
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        disabled={disabled}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          // Light, meaningful feedback on a deliberate action only; unsupported devices are ignored.
          haptics.tap();
          onPress();
        }}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: hero ? brand.lime : primary ? colors.primary : 'transparent',
          borderWidth: primary || hero ? 0 : 1,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <AppText
          variant="label"
          style={{ color: hero ? brand.plum : primary ? colors.onPrimary : colors.text }}
        >
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
