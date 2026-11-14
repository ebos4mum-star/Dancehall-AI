import { Switch, View } from 'react-native';
import { spacing, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { IconBadge, type IconName } from './kit';
import { haptics } from './haptics';

/** One setting: icon, what it is, what it does in a sentence, and a switch. The switch is named by the title. */
export function SettingRow({
  icon,
  title,
  body,
  value,
  onChange,
  disabled,
}: {
  icon: IconName;
  title: string;
  body?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: value ? colors.primary : colors.border,
        padding: spacing.md,
      }}
    >
      <IconBadge name={icon} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        {body ? (
          <AppText variant="caption" muted>
            {body}
          </AppText>
        ) : null}
        <AppText variant="caption" style={{ fontWeight: '700' }}>
          {value ? 'On' : 'Off'}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          haptics.tap();
          onChange(v);
        }}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}
