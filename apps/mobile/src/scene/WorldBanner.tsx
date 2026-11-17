import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PulseStage } from '@/pulse/PulseStage';
import type { PulseState } from '@/pulse/machine';
import { brand, spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { HeroScene } from './HeroScene';
import type { World } from './SceneBackdrop';

export interface Banner {
  world: World;
  /** What this screen is for, in a few words. */
  title: string;
  /** One supportive line. */
  line?: string;
  pulse?: PulseState;
  /** Taller banners show more of the scene (Friends and Community use 200). Default 148. */
  height?: number;
}

/** The compact version of a tab's world, shown at the top of its child screens. Same scene, same Pulse, lower height. */
export function WorldBanner({ world, title, line, pulse = 'idle', height = 148 }: Banner) {
  const tall = height > 170;
  return (
    <HeroScene world={world} height={height}>
      {/* A soft plum scrim keeps the words legible over the scene's props. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(26,14,46,0.88)', 'rgba(26,14,46,0.55)', 'rgba(26,14,46,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '78%' }}
      />
      <View
        style={{ position: 'absolute', top: spacing.md, left: spacing.lg, right: tall ? 138 : 118 }}
      >
        <AppText variant="heading" accessibilityRole="header" style={{ color: brand.ivory }}>
          {title}
        </AppText>
        {line ? (
          <AppText variant="caption" style={{ color: brand.ivory, marginTop: 2, opacity: 0.92 }}>
            {line}
          </AppText>
        ) : null}
      </View>
      <View style={{ position: 'absolute', right: -2, bottom: 14 }}>
        <PulseStage state={pulse} size={tall ? 132 : 112} />
      </View>
    </HeroScene>
  );
}
