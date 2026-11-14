import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { summarizeWeights, type UnitSystem, type WeightPoint } from '@dancehall/shared';
import { t } from '@/i18n';
import { chartGeometry } from '@/lib/chart';
import { formatDate, formatWeight } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';

/**
 * Weight over time with an optional goal line. The chart is a visual aid: its meaning is available as a text label
 * (screen readers) and as the History list below it, so nothing depends on seeing the picture.
 */
export function WeightChart({
  points,
  units,
  targetKg,
}: {
  points: readonly WeightPoint[];
  units: UnitSystem;
  targetKg?: number | null;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(300);
  const height = 170;
  const g = chartGeometry(points, width, height, 16, targetKg);
  if (!g) return null;
  const s = summarizeWeights(points);
  const sorted = [...points].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const label = t('progress.chartLabel', {
    n: points.length,
    from: formatDate(sorted[0]!.measuredAt),
    to: formatDate(sorted[sorted.length - 1]!.measuredAt),
    latest: formatWeight(s.latest!.weightKg, units),
  });
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={(e) => setWidth(Math.max(200, e.nativeEvent.layout.width))}
    >
      <Svg width={width} height={height}>
        {g.targetY !== null ? (
          <Line
            x1={16}
            x2={width - 16}
            y1={g.targetY}
            y2={g.targetY}
            stroke={colors.success}
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        ) : null}
        <Path
          d={g.path}
          stroke={colors.primary}
          strokeWidth={3}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {g.dots.map((d, i) => (
          <Circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={i === g.dots.length - 1 ? 6 : 4}
            fill={colors.primary}
          />
        ))}
      </Svg>
    </View>
  );
}
