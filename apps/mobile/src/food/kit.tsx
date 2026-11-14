import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PulseStage } from '@/pulse/PulseStage';
import type { PulseState } from '@/pulse/machine';
import { HeroScene } from '@/scene/HeroScene';
import type { World } from '@/scene/SceneBackdrop';
import { brand, radius, spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';

/**
 * The top of a food sub-screen: the food world with Pulse, a title, one calm line, and up to three real numbers on ivory chips. Replaces the
 * banner. Numbers must come from the person's own data, never from guesses.
 */
export function FoodHero({
  title,
  line,
  stats = [],
  pulse = 'idle',
  world = 'food',
  children,
}: {
  title: string;
  line: string;
  stats?: { label: string; value: string }[];
  pulse?: PulseState;
  world?: World;
  children?: ReactNode;
}) {
  return (
    <HeroScene world={world} height={stats.length > 0 || children ? 210 : 170}>
      <View style={{ position: 'absolute', left: spacing.lg, right: 132, top: spacing.lg }}>
        <AppText variant="title" accessibilityRole="header" style={{ color: brand.ivory }}>
          {title}
        </AppText>
        <AppText style={{ color: brand.ivory, marginTop: spacing.xs }}>{line}</AppText>
      </View>
      <View style={{ position: 'absolute', right: -10, top: 4 }}>
        <PulseStage state={pulse} size={124} />
      </View>
      {stats.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: spacing.md,
            flexDirection: 'row',
            gap: spacing.sm,
          }}
        >
          {stats.map((s) => (
            <View
              key={s.label}
              accessible
              accessibilityLabel={`${s.label}: ${s.value}`}
              style={{
                flex: 1,
                backgroundColor: brand.ivory,
                borderRadius: radius.md,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
              }}
            >
              <AppText variant="heading" style={{ color: brand.plum }}>
                {s.value}
              </AppText>
              <AppText variant="caption" style={{ color: brand.plum }}>
                {s.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {children}
    </HeroScene>
  );
}
