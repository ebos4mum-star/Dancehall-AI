import { Animated, Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ActivitySummary, DanceStyle, Intensity, Level, WorkoutDef } from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { haptics } from '@/ui/haptics';
import { usePressScale } from '@/ui/motion';
import { STYLE_META } from './meta';

const LEVEL_DOTS: Record<Level, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Small pill on a gradient card. Dark translucent background keeps white text readable on every style. */
export function Chip({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: strong ? '#FFFFFF' : 'rgba(0,0,0,0.28)',
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
      }}
    >
      <AppText
        variant="caption"
        style={{ color: strong ? '#1F1633' : '#FFFFFF', fontWeight: '600' }}
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

/** Rich workout card: style gradient, clear duration, level and intensity labels, press feedback. */
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
          style={{ padding: spacing.lg, gap: spacing.sm, minHeight: 148 }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, gap: 2, paddingRight: spacing.sm }}>
              <AppText variant="caption" style={{ color: '#FFFFFF', opacity: 0.9 }}>
                {t(`style.${w.style}` as StringKey).toUpperCase()}
              </AppText>
              <AppText variant="heading" style={{ color: '#FFFFFF' }}>
                {w.title}
              </AppText>
            </View>
            <AppText
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ fontSize: 40, lineHeight: 48 }}
            >
              {meta.emoji}
            </AppText>
          </View>
          <AppText variant="caption" numberOfLines={2} style={{ color: '#FFFFFF' }}>
            {w.summary}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Chip strong label={t('dance.minutes', { n: w.minutes })} />
            <Chip label={levelLabel(w.level)} />
            <Chip label={t(`intensity.${w.intensity}` as StringKey)} />
            <Chip label={t(`impact.${w.impact}` as StringKey)} />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/** A big tappable style tile for the horizontal carousel. */
export function StyleTile({
  style,
  selected,
  onPress,
}: {
  style: DanceStyle | 'all';
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const press = usePressScale();
  const meta = style === 'all' ? null : STYLE_META[style];
  const label = style === 'all' ? t('dance.all') : t(`style.${style}` as StringKey);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
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
            width: 104,
            height: 96,
            borderRadius: radius.lg,
            overflow: 'hidden',
            borderWidth: selected ? 3 : 0,
            borderColor: colors.accent,
          },
        ]}
      >
        <LinearGradient
          colors={meta ? [meta.from, meta.to] : [colors.heroFrom, colors.heroTo]}
          style={{ flex: 1, padding: spacing.sm, justifyContent: 'space-between' }}
        >
          <AppText
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ fontSize: 28, lineHeight: 34 }}
          >
            {meta?.emoji ?? '🔥'}
          </AppText>
          <AppText variant="label" style={{ color: '#FFFFFF' }}>
            {selected ? `✓ ${label}` : label}
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
