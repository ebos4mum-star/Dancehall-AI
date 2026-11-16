import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, radius, spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Reveal } from '@/ui/motion';
import { MOMENT_MS, dismissMoment, useMoment } from './moment';
import { PulseStage } from './PulseStage';

/** Mounted once at the root. Shows Pulse reacting to a real accomplishment, over the top of the screen, never blocking controls below it. */
export function MomentHost() {
  const m = useMoment();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!m) return;
    const id = m.id;
    const h = setTimeout(() => dismissMoment(id), MOMENT_MS);
    return () => clearTimeout(h);
  }, [m]);
  if (!m) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing.sm,
        left: spacing.md,
        right: spacing.md,
        zIndex: 50,
      }}
    >
      <Reveal key={m.id}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={m.message}
          accessibilityHint="Tap to dismiss"
          onPress={() => dismissMoment(m.id)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: brand.plum,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: brand.violet,
            paddingVertical: spacing.xs,
            paddingLeft: spacing.xs,
            paddingRight: spacing.md,
            minHeight: 64,
            shadowColor: brand.plum,
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          <View style={{ width: 64, height: 60, overflow: 'hidden', alignItems: 'center' }}>
            <PulseStage state={m.state} size={64} flourish={m.flourish} />
          </View>
          <AppText variant="label" style={{ color: brand.ivory, flex: 1 }}>
            {m.message}
          </AppText>
        </Pressable>
      </Reveal>
    </View>
  );
}
