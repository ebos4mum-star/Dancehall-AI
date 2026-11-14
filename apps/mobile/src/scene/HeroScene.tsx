import type { ReactNode } from 'react';
import { View } from 'react-native';
import { brand, radius } from '@/theme/tokens';
import { SceneBackdrop, type World } from './SceneBackdrop';

/** A fixed-height hero over a world's environment. Children are laid over the scene (usually absolutely positioned). */
export function HeroScene({
  children,
  height = 320,
  world = 'today',
}: {
  children: ReactNode;
  height?: number;
  world?: World;
}) {
  return (
    <View
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: brand.plum,
        shadowColor: brand.plum,
        shadowOpacity: 0.35,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
      }}
    >
      <SceneBackdrop world={world} />
      {children}
    </View>
  );
}
