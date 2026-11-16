import { TextInput, View, type TextInputProps } from 'react-native';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { useFormField } from './formFocus';
import type { FieldKind } from './inputBehavior';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  /** What the field is for; sets the right keyboard, capitalisation, autocorrect and return key. Explicit props still win. */
  kind?: FieldKind;
  hint?: string;
  error?: string | null;
}

export function TextField({ label, hint, error, kind, ...rest }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const f = useFormField({ kind, props: rest });
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        {...rest}
        {...f}
        accessibilityState={{
          ...(rest.accessibilityState ?? {}),
          disabled: rest.editable === false,
        }}
        style={[
          typography.body,
          {
            minHeight: MIN_TOUCH_TARGET,
            color: colors.text,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? colors.warningText : colors.border,
            paddingHorizontal: spacing.md,
          },
        ]}
      />
      {error ? (
        <AppText
          variant="caption"
          style={{ color: colors.warningText }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
