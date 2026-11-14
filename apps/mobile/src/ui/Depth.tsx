import type { ReactNode } from 'react';
import { Image, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { PulseStage } from '@/pulse/PulseStage';
import type { PulseState } from '@/pulse/machine';
import { SceneBackdrop, type World } from '@/scene/SceneBackdrop';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** A card with a soft shadow for a layered, premium feel. */
export function DepthCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
          gap: spacing.sm,
          shadowColor: brand.plum,
          shadowOpacity: 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The hero surface: a world's environment behind flowing content (white text). `world` picks the tab's scene. */
export function HeroCard({
  children,
  style,
  world = 'today',
}: {
  children: ReactNode;
  style?: ViewStyle;
  world?: World;
}) {
  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: brand.plum,
          shadowColor: brand.plum,
          shadowOpacity: 0.35,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 6,
        },
        style,
      ]}
    >
      <SceneBackdrop world={world} />
      <View style={{ padding: spacing.lg, gap: spacing.sm, alignItems: style?.alignItems }}>
        {children}
      </View>
    </View>
  );
}

/**
 * Slot for the app's hero character. Renders Pulse in the given state. Pass `artwork` to replace Pulse with a rendered image asset later
 * without touching any screen (the character-asset seam from CHARACTER_BRIEF_PULSE.md).
 */
export function CharacterStage({
  size = 120,
  artwork,
  state = 'idle',
}: {
  size?: number;
  artwork?: ImageSourcePropType;
  state?: PulseState;
}) {
  return artwork ? (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Image source={artwork} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  ) : (
    <PulseStage state={state} size={size} />
  );
}
