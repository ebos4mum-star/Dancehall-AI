import { Pressable, View } from 'react-native';
import { PULSE_STATES, type PulseState } from '@/pulse/machine';
import { brand, MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { REVIEW, setReview, useReview } from './review';

/** Shown only in the private design-review build. Replays Pulse's states and flips motion and theme on the real Today screen. */
export function ReviewBar() {
  const r = useReview();
  if (!REVIEW) return null;
  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: active ? brand.lime : 'transparent',
        borderWidth: 1,
        borderColor: active ? brand.lime : brand.violet,
      }}
    >
      <AppText variant="label" style={{ color: active ? brand.plum : brand.ivory }}>
        {label}
      </AppText>
    </Pressable>
  );
  const replay = (s: PulseState) => {
    // Going through idle first replays a one-shot even if it was just shown.
    setReview({ pulse: 'idle' });
    setTimeout(() => setReview({ pulse: s }), 60);
  };
  return (
    <View
      style={{
        backgroundColor: brand.plum,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: brand.violet,
      }}
    >
      <AppText variant="label" style={{ color: brand.ivory }}>
        Design review controls (this preview build only)
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {chip('Live', r.pulse === null, () => setReview({ pulse: null }))}
        {PULSE_STATES.map((s) => chip(s, r.pulse === s, () => replay(s)))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {chip('Motion: device', r.reduced === null, () => setReview({ reduced: null }))}
        {chip('Reduced motion', r.reduced === true, () => setReview({ reduced: true }))}
        {chip('Full motion', r.reduced === false, () => setReview({ reduced: false }))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {chip('Theme: device', r.dark === null, () => setReview({ dark: null }))}
        {chip('Light', r.dark === false, () => setReview({ dark: false }))}
        {chip('Dark', r.dark === true, () => setReview({ dark: true }))}
      </View>
    </View>
  );
}
