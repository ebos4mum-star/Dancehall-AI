import { useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { haptics } from './haptics';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** A round icon on a tinted disc. Decorative: the label next to it carries the meaning. */
export function IconBadge({
  name,
  size = 40,
  fill = brand.violet,
  color = brand.plum,
}: {
  name: IconName;
  size?: number;
  fill?: string;
  color?: string;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.52} color={color} />
    </View>
  );
}

/** A section heading with an icon, an optional trailing action and a consistent rhythm. */
export function SectionTitle({
  icon,
  title,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {icon ? (
        <IconBadge name={icon} size={28} fill={colors.primary} color={colors.onPrimary} />
      ) : null}
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingHorizontal: spacing.xs,
          }}
        >
          <AppText variant="label" style={{ color: colors.primary }}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Three bars that fill up to a level (1-3). Always paired with a text label by the caller, so colour and shape are never the only signal. */
export function Meter({ level, tint = '#FFFFFF' }: { level: 1 | 2 | 3; tint?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 }}
    >
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          style={{
            width: 4,
            height: 5 + n * 3,
            borderRadius: 2,
            backgroundColor: tint,
            opacity: n <= level ? 1 : 0.28,
          }}
        />
      ))}
    </View>
  );
}

/** A small stat: icon, big value, label. For rows of two or three facts. */
export function InfoTile({
  icon,
  label,
  value,
  style,
}: {
  icon: IconName;
  label: string;
  value: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[
        {
          flex: 1,
          minWidth: 96,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.xs,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} accessibilityElementsHidden />
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}

/** A tappable card-style choice with an icon, used for moods and styles. Selection shows as a ring, a check and a state, not colour alone. */
export function IconChoice({
  icon,
  label,
  selected,
  onPress,
  tint = brand.violet,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  tint?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={{
        minWidth: 84,
        minHeight: MIN_TOUCH_TARGET + 28,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <IconBadge name={selected ? 'checkmark' : icon} size={36} fill={tint} />
      <AppText variant="caption" style={{ fontWeight: selected ? '700' : '500' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A collapsible section with a one-line summary, so rarely-used controls do not crowd the screen. */
export function Disclosure({
  title,
  summary,
  children,
  initiallyOpen = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${summary ? `, ${summary}` : ''}`}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: MIN_TOUCH_TARGET + 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="label">{title}</AppText>
          {summary ? (
            <AppText variant="caption" muted>
              {summary}
            </AppText>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}>{children}</View>
      ) : null}
    </View>
  );
}

/** A horizontal bar split into weighted segments (for example warm-up, dance blocks, cool-down). */
export function SegmentedBar({
  segments,
  label,
}: {
  segments: Array<{ weight: number; fill: number; tint: string }>;
  label: string;
}) {
  const { colors } = useTheme();
  const total = segments.reduce((a, s) => a + s.weight, 0) || 1;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 3, height: 10 }}
    >
      {segments.map((s, i) => (
        <View
          key={i}
          style={{
            flex: s.weight / total,
            borderRadius: 5,
            backgroundColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, s.fill)) * 100)}%`,
              height: '100%',
              backgroundColor: s.tint,
            }}
          />
        </View>
      ))}
    </View>
  );
}
