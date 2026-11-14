import { Pressable, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** A single-choice row of pills. Selection is conveyed by text weight and a check, not by color alone. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              aria-checked={selected}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.surface : 'transparent',
              }}
            >
              <AppText variant="label" style={{ color: selected ? colors.primary : colors.text }}>
                {selected ? '✓ ' : ''}
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
