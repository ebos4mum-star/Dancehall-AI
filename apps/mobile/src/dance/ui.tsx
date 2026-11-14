import { Animated, Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ActivitySummary, DanceStyle, Intensity, Level, WorkoutDef } from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { haptics } from '@/ui/haptics';
import { usePressScale } from '@/ui/motion';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge, Meter } from '@/ui/kit';
import { INTENSITY_NUM, LEVEL_NUM, STYLE_ICON, STYLE_META } from './meta';

const LEVEL_DOTS: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Small pill on a gradient card. Dark translucent background keeps white text readable on every style. */
export function Chip({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: strong ? brand.ivory : 'rgba(0,0,0,0.28)',
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <AppText
        variant="caption"
        style={{ color: strong ? brand.plum : '#FFFFFF', fontWeight: '600' }}
      >
        {label}
      </AppText>
    </View>
  );
}

export const levelLabel = (l: Level) =>
  `${'●'.repeat(LEVEL_DOTS[l])}${'○'.repeat(3 - LEVEL_DOTS[l])} ${t(`level.${l}` as StringKey)}`;
export const workoutSummaryLabel = (
  w: Pick<WorkoutDef, 'title' | 'style' | 'minutes' | 'level' | 'intensity' | 'impact'>,
) =>
  `${w.title}, ${t(`style.${w.style}` as StringKey)}, ${t('dance.minutes', { n: w.minutes })}, ${t(`level.${w.level}` as StringKey)}, ${t(`intensity.${w.intensity}` as StringKey)}, ${t(`impact.${w.impact}` as StringKey)}`;

/** Workout card: a duration disc, the title and summary, and three facts (level, pace, impact) each with a meter and a text label. */
export function WorkoutCard({ w, onPress }: { w: WorkoutDef; onPress: () => void }) {
  const meta = STYLE_META[w.style];
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={workoutSummaryLabel(w)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
    >
      <Animated.View
        style={[
          press.style,
          {
            borderRadius: radius.lg,
            overflow: 'hidden',
            shadowColor: meta.to,
            shadowOpacity: 0.3,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 5,
          },
        ]}
      >
        <LinearGradient
          colors={[meta.from, meta.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: spacing.md, gap: spacing.md, minHeight: 148 }}
        >
          <Ionicons
            name={STYLE_ICON[w.style]}
            size={120}
            color="#FFFFFF"
            style={{ position: 'absolute', right: -14, bottom: -18, opacity: 0.12 }}
            accessibilityElementsHidden
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                backgroundColor: brand.ivory,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="title" style={{ color: brand.plum, fontSize: 26, lineHeight: 28 }}>
                {w.minutes}
              </AppText>
              <AppText variant="caption" style={{ color: brand.plum, lineHeight: 14 }}>
                min
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText
                variant="caption"
                style={{ color: '#FFFFFF', opacity: 0.92, letterSpacing: 1 }}
              >
                {t(`style.${w.style}` as StringKey).toUpperCase()}
              </AppText>
              <AppText variant="heading" style={{ color: '#FFFFFF' }}>
                {w.title}
              </AppText>
            </View>
          </View>
          <AppText variant="caption" numberOfLines={2} style={{ color: '#FFFFFF' }}>
            {w.summary}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Fact meter={LEVEL_NUM[w.level]} label={t(`level.${w.level}` as StringKey)} />
            <Fact
              meter={INTENSITY_NUM[w.intensity]}
              label={t(`intensity.${w.intensity}` as StringKey)}
            />
            <Fact
              icon={w.impact === 'low' ? 'leaf' : 'footsteps'}
              label={t(`impact.${w.impact}` as StringKey)}
            />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function Fact({
  meter,
  icon,
  label,
}: {
  meter?: 1 | 2 | 3;
  icon?: 'leaf' | 'footsteps' | 'time';
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 5,
      }}
    >
      {meter ? (
        <Meter level={meter} />
      ) : icon ? (
        <Ionicons name={icon} size={14} color="#FFFFFF" />
      ) : null}
      <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

/** A tall style tile: an icon badge on the style's gradient. Selected shows a lime ring, a check and a text state. */
export function StyleTile({
  style,
  selected,
  onPress,
}: {
  style: DanceStyle | 'all';
  selected: boolean;
  onPress: () => void;
}) {
  const press = usePressScale();
  const meta = style === 'all' ? null : STYLE_META[style];
  const label = style === 'all' ? t('dance.all') : t(`style.${style}` as StringKey);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
    >
      <Animated.View
        style={[
          press.style,
          {
            width: 108,
            height: 118,
            borderRadius: radius.lg,
            overflow: 'hidden',
            borderWidth: selected ? 3 : 0,
            borderColor: brand.lime,
          },
        ]}
      >
        <LinearGradient
          colors={meta ? [meta.from, meta.to] : [brand.plum, '#4A2B8C']}
          style={{ flex: 1, padding: spacing.sm, justifyContent: 'space-between' }}
        >
          <IconBadge
            name={selected ? 'checkmark' : style === 'all' ? 'apps' : STYLE_ICON[style]}
            size={40}
            fill={brand.ivory}
          />
          <AppText variant="label" style={{ color: '#FFFFFF' }}>
            {label}
          </AppText>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function StyleCarousel({
  value,
  onChange,
  styles,
}: {
  value: DanceStyle | 'all';
  onChange: (s: DanceStyle | 'all') => void;
  styles: readonly DanceStyle[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      {(['all', ...styles] as const).map((s) => (
        <StyleTile key={s} style={s} selected={value === s} onPress={() => onChange(s)} />
      ))}
    </ScrollView>
  );
}

/** Weekly minutes as simple bars. Everything is also available as text. */
export function ActivityBars({ summary }: { summary: ActivitySummary }) {
  const { colors } = useTheme();
  const max = Math.max(10, ...summary.weeks.map((w) => w.minutes));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 110 }}>
      {summary.weeks.map((w, i) => (
        <View
          key={w.weekStart}
          accessible
          accessibilityLabel={`Week of ${formatDate(w.weekStart)}: ${w.sessions} sessions, ${w.minutes} minutes`}
          style={{ flex: 1, alignItems: 'center', gap: 4 }}
        >
          <AppText variant="caption" muted>
            {w.minutes}
          </AppText>
          <View
            style={{
              width: '70%',
              height: Math.max(4, (w.minutes / max) * 64),
              borderRadius: 6,
              backgroundColor: i === summary.weeks.length - 1 ? colors.primary : colors.border,
            }}
          />
          <AppText variant="caption" muted>
            {formatDate(w.weekStart).replace(/, \d{4}$/, '')}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export const intensityOptions: Intensity[] = ['low', 'moderate', 'high'];
