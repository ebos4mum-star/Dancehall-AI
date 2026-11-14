import type { ReactNode } from 'react';
import { Image, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Floating } from './motion';

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

/** The hero surface: an energetic gradient with white text. */
export function HeroCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.heroFrom, colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.sm,
          overflow: 'hidden',
          shadowColor: colors.heroTo,
          shadowOpacity: 0.35,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 6,
        },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

/**
 * Slot for the app's hero character. Detailed 3D character artwork is a separate, owner-approved deliverable: until it exists this renders a
 * restrained layered "energy core" (gradient sphere, highlight, glow, ground shadow). Pass `artwork` to replace it without touching any screen.
 */
export function CharacterStage({
  size = 120,
  artwork,
}: {
  size?: number;
  artwork?: ImageSourcePropType;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size + 16, alignItems: 'center', justifyContent: 'flex-start' }}
    >
      <Floating>
        {artwork ? (
          <Image source={artwork} style={{ width: size, height: size }} resizeMode="contain" />
        ) : (
          <View
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: brand.violet,
                opacity: 0.3,
              }}
            />
            <LinearGradient
              colors={[brand.lime, brand.violet, colors.heroTo]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                width: size * 0.74,
                height: size * 0.74,
                borderRadius: size,
                shadowColor: brand.violet,
                shadowOpacity: 0.5,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 10 },
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: size * 0.2,
                left: size * 0.26,
                width: size * 0.3,
                height: size * 0.16,
                borderRadius: size,
                backgroundColor: brand.ivory,
                opacity: 0.45,
                transform: [{ rotate: '-25deg' }],
              }}
            />
          </View>
        )}
      </Floating>
      <View
        style={{
          width: size * 0.6,
          height: 8,
          borderRadius: 8,
          backgroundColor: '#000',
          opacity: 0.12,
          marginTop: 4,
        }}
      />
    </View>
  );
}
