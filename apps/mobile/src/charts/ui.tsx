import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { brand, MIN_TOUCH_TARGET, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import {
  describeSeries,
  niceMax,
  slotAt,
  tableRows,
  type CalendarCell,
  type ChartPoint,
} from './data';
import { useFeedback, useMotionAllowed } from './useFeedback';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const fmt = (v: number | null, unit: string) =>
  v === null ? 'nothing recorded' : `${v.toLocaleString('en-US')} ${unit}`;

/**
 * The frame every chart lives in: a title, a one-line meaning, the chart, what the touched point says, and a plain "show values" list. The chart region is
 * described in words for screen readers and the same facts are available as text, so a chart is never the only way to learn something.
 */
export function ChartCard({
  icon,
  title,
  summary,
  points,
  unit,
  zeroMeansNone,
  control,
  footnote,
  selected,
  children,
}: {
  icon: IconName;
  title: string;
  summary: string;
  points: readonly ChartPoint[];
  unit: string;
  zeroMeansNone?: boolean;
  /** A small control row (for example a Week/Month switch). */
  control?: ReactNode;
  footnote?: string;
  selected: ChartPoint | null;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const feedback = useFeedback();
  const words = describeSeries(summary, points, unit, { zeroMeansNone });
  return (
    <Card>
      <SectionTitle icon={icon} title={title} />
      {control}
      <View accessible accessibilityRole="image" accessibilityLabel={words}>
        {children}
      </View>
      <View style={{ minHeight: 40, justifyContent: 'center' }} accessibilityLiveRegion="polite">
        {selected ? (
          <>
            <AppText variant="label">
              {selected.full}: {fmt(selected.value, unit)}
            </AppText>
            {selected.note ? (
              <AppText variant="caption" muted>
                {selected.note}
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText variant="caption" muted>
            {summary}. Touch the chart to see each value.
          </AppText>
        )}
      </View>
      {footnote ? (
        <AppText variant="caption" muted>
          {footnote}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide values' : 'Show values'}
        onPress={() => {
          feedback('select');
          setOpen((v) => !v);
        }}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        <AppText variant="label" style={{ color: colors.primary }}>
          {open ? 'Hide values' : 'Show values'}
        </AppText>
      </Pressable>
      {open ? (
        <View style={{ gap: 2 }}>
          {tableRows(points, unit).map((r) => (
            <AppText key={r} variant="caption">
              {r}
            </AppText>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Touch/drag to explore: a tap selects, a horizontal drag scrubs. Returns handlers for the chart surface. */
function useScrub(n: number, width: number, onSelect: (i: number) => void) {
  const ref = useRef({ n, width, onSelect });
  ref.current = { n, width, onSelect };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: (e) =>
          ref.current.onSelect(slotAt(e.nativeEvent.locationX, ref.current.width, ref.current.n)),
        onPanResponderMove: (e) =>
          ref.current.onSelect(slotAt(e.nativeEvent.locationX, ref.current.width, ref.current.n)),
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );
  return pan.panHandlers;
}

/** Bars from zero, so heights are honest. Tap a bar, or drag across the chart, to read it. A missing value draws no bar. */
export function BarChart({
  points,
  unit,
  selected,
  onSelect,
  height = 120,
  color,
  highlightLast = true,
}: {
  points: readonly ChartPoint[];
  unit: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
  height?: number;
  color?: string;
  highlightLast?: boolean;
}) {
  const { colors } = useTheme();
  const motion = useMotionAllowed();
  const feedback = useFeedback();
  const [width, setWidth] = useState(300);
  const grow = useRef(new Animated.Value(motion ? 0 : 1)).current;
  useEffect(() => {
    if (!motion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [motion, grow, points.length]);
  const top = niceMax(points.map((p) => p.value));
  const select = (i: number) => {
    if (i !== selected) feedback('select');
    onSelect(i);
  };
  const handlers = useScrub(points.length, width, select);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...handlers}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        {points.map((p, i) => {
          const h =
            p.value === null ? 0 : Math.max(p.value > 0 ? 4 : 0, (p.value / top) * (height - 8));
          const on = selected === i;
          const last = highlightLast && i === points.length - 1;
          return (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityLabel={`${p.full}: ${fmt(p.value, unit)}${p.note ? `, ${p.note}` : ''}`}
              accessibilityState={{ selected: on }}
              onPress={() => select(i)}
              style={{ flex: 1, height, justifyContent: 'flex-end', minWidth: 20 }}
            >
              <Animated.View
                style={{
                  height: h,
                  borderRadius: 6,
                  backgroundColor: on ? brand.coral : (color ?? (last ? brand.violet : '#BBA5F6')),
                  opacity: p.value === null ? 0.25 : 1,
                  transform: [
                    {
                      translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [h / 2, 0] }),
                    },
                    { scaleY: grow },
                  ],
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
        {points.map((p, i) => (
          <AppText
            key={p.key}
            variant="caption"
            muted
            style={{
              flex: 1,
              textAlign: 'center',
              fontWeight: selected === i ? '800' : '400',
              color: selected === i ? colors.text : undefined,
            }}
            numberOfLines={1}
          >
            {p.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/** A line over a baseline of zero. Days with nothing recorded leave a gap in the line (never a drop to zero). Drag across it to read each day. */
export function LineChart({
  points,
  unit,
  selected,
  onSelect,
  height = 140,
  color,
  zeroBaseline = true,
}: {
  points: readonly ChartPoint[];
  unit: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
  height?: number;
  color?: string;
  zeroBaseline?: boolean;
}) {
  const { colors } = useTheme();
  const feedback = useFeedback();
  const [width, setWidth] = useState(300);
  const pad = 14;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const hi = niceMax(points.map((p) => p.value));
  const lo = zeroBaseline ? 0 : vals.length ? Math.min(...vals) : 0;
  const span = Math.max(1e-9, hi - lo);
  const n = points.length;
  const xAt = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2));
  const yAt = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  // Break the line wherever a value is missing.
  const segments: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segments.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)} `;
  });
  if (cur) segments.push(cur);
  const select = (i: number) => {
    if (i !== selected) feedback('select');
    onSelect(i);
  };
  const handlers = useScrub(n, width, select);
  const sel = selected !== null ? points[selected] : null;
  return (
    <View onLayout={(e) => setWidth(Math.max(200, e.nativeEvent.layout.width))} {...handlers}>
      <Pressable
        accessible={false}
        onPress={(e) => select(slotAt(e.nativeEvent.locationX, width, n))}
        style={{ height }}
      >
        <Svg width={width} height={height}>
          <Line
            x1={pad}
            x2={width - pad}
            y1={yAt(lo)}
            y2={yAt(lo)}
            stroke={colors.border}
            strokeWidth={1}
          />
          <Line
            x1={pad}
            x2={width - pad}
            y1={yAt(hi)}
            y2={yAt(hi)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray="3 5"
          />
          {segments.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={color ?? colors.primary}
              strokeWidth={3}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <Circle
                key={p.key}
                cx={xAt(i)}
                cy={yAt(p.value)}
                r={selected === i ? 6 : 3.5}
                fill={selected === i ? brand.coral : (color ?? colors.primary)}
              />
            ),
          )}
          {sel && sel.value !== null ? (
            <Line
              x1={xAt(selected!)}
              x2={xAt(selected!)}
              y1={pad}
              y2={height - pad}
              stroke={brand.coral}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          ) : null}
        </Svg>
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="caption" muted>
          {points[0]?.label}
        </AppText>
        <AppText variant="caption" muted>
          {hi.toLocaleString('en-US')} {unit} top
        </AppText>
        <AppText variant="caption" muted>
          {points[n - 1]?.label}
        </AppText>
      </View>
      {/* Every point is also reachable one at a time, for screen readers and anyone who cannot drag. */}
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          disabled={selected === 0}
          onPress={() => select(Math.max(0, (selected ?? n) - 1))}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: MIN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: selected === 0 ? 0.4 : 1,
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          disabled={selected === n - 1}
          onPress={() => select(Math.min(n - 1, (selected ?? -1) + 1))}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: MIN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: selected === n - 1 ? 0.4 : 1,
          }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** A progress ring that fills with an ease (and not at all with Reduce Motion). Tap for a short explanation through `onPress`. */
export function ProgressRing({
  fraction,
  size = 84,
  stroke = 10,
  color,
  label,
  children,
  onPress,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  children?: ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const motion = useMotionAllowed();
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(motion ? 0 : f)).current;
  const [dash, setDash] = useState(motion ? 0 : f);
  useEffect(() => {
    if (!motion) {
      v.setValue(f);
      setDash(f);
      return;
    }
    const id = v.addListener(({ value }) => setDash(value));
    Animated.timing(v, {
      toValue: f,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => v.removeListener(id);
  }, [f, motion, v]);
  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? brand.violet}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * dash} ${c}`}
        />
      </Svg>
      {children}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
    >
      {body}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}
    >
      {body}
    </View>
  );
}

const CELL_STYLE: Record<CalendarCell['state'], { bg: string; border: string }> = {
  active: { bg: brand.lime, border: brand.lime },
  rest: { bg: brand.violet, border: brand.violet },
  missed: { bg: 'transparent', border: '#D5CFE3' },
  today: { bg: 'transparent', border: brand.plum },
  future: { bg: 'transparent', border: 'transparent' },
};
const STATE_WORD: Record<CalendarCell['state'], string> = {
  active: 'active',
  rest: 'planned rest day',
  missed: 'no activity recorded',
  today: 'today, still open',
  future: 'still to come',
};

/** A calendar of recent weeks. Active days are filled, planned rest days are a calm moon, and nothing on the calendar is ever red or shaming. */
export function CalendarGrid({
  cells,
  selected,
  onSelect,
}: {
  cells: readonly CalendarCell[];
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const feedback = useFeedback();
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {letters.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <AppText variant="caption" muted>
              {l}
            </AppText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((c, i) => {
          const st = CELL_STYLE[c.state];
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityLabel={`${c.full}: ${STATE_WORD[c.state]}`}
              accessibilityState={{ selected: selected === i }}
              disabled={c.state === 'future'}
              onPress={() => {
                feedback('select');
                onSelect(i);
              }}
              style={{
                width: `${100 / 7}%`,
                minHeight: MIN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: selected === i ? 3 : 2,
                  borderColor: selected === i ? brand.coral : st.border,
                  backgroundColor: st.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {c.state === 'active' ? (
                  <Ionicons name="checkmark" size={18} color={brand.plum} />
                ) : null}
                {c.state === 'rest' ? <Ionicons name="moon" size={14} color={brand.ivory} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { SectionTitle, spacing };
