import { Pressable, View } from 'react-native';
import { PIN_LENGTH } from '@dancehall/shared';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { haptics } from '@/ui/haptics';

/**
 * A number pad for the six-digit PIN. Each key is a labelled button with a large target; the dots report how many digits are in, never which. Nothing is echoed to
 * the screen reader except the count.
 */
export function PinPad({
  length,
  onDigit,
  onDelete,
  disabled = false,
  label,
}: {
  /** How many digits have been entered. */
  length: number;
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  label: string;
}) {
  const { colors } = useTheme();
  const key = (content: string, onPress: () => void, a11y: string) => (
    <Pressable
      key={a11y}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 76,
        height: 64,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.border : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <AppText variant="title">{content}</AppText>
    </Pressable>
  );
  return (
    <View style={{ alignItems: 'center', gap: spacing.md }}>
      <View
        accessible
        accessibilityLabel={`${label}. ${t('pin.entered', { n: length, total: PIN_LENGTH })}`}
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', gap: spacing.md }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 2,
              borderColor: colors.text,
              backgroundColor: i < length ? colors.text : 'transparent',
            }}
          />
        ))}
      </View>
      {[
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
      ].map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap: spacing.md }}>
          {row.map((d) => key(d, () => onDigit(d), d))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ width: 76, height: 64 }} />
        {key('0', () => onDigit('0'), '0')}
        {key('⌫', onDelete, t('pin.delete'))}
      </View>
    </View>
  );
}
