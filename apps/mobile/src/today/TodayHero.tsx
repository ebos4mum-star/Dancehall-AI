import { Pressable, View } from 'react-native';
import { PulseStage } from '@/pulse/PulseStage';
import type { PulseState } from '@/pulse/machine';
import { HeroScene } from '@/scene/HeroScene';
import { brand, radius, spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';

export interface HeroChip {
  key: string;
  done: boolean;
  text: string;
}

/**
 * Today's hero. Answers "how am I doing today?" with real status chips, and "what now?" with one supportive line. Pulse sits to the right,
 * leaving the left side of the stage free for a future user avatar. All text is plain, scalable text on the plum scene.
 */
export function TodayHero({
  greeting,
  line,
  chips,
  pulse,
  onPulseTap,
}: {
  greeting: string;
  line: string;
  chips: HeroChip[];
  pulse: PulseState;
  /** Touching Pulse. Omit to leave Pulse as plain art. */
  onPulseTap?: () => void;
}) {
  return (
    <HeroScene height={348}>
      <View style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, right: 130 }}>
        <AppText
          variant="title"
          accessibilityRole="header"
          style={{ color: brand.ivory, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 }}
        >
          {greeting}
        </AppText>
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: brand.ivory, marginTop: spacing.xs, opacity: 0.92 }}
        >
          {line}
        </AppText>
      </View>
      <View style={{ position: 'absolute', right: -4, bottom: 30 }}>
        {onPulseTap ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Say hi to Pulse"
            accessibilityHint="Pulse waves back"
            onPress={onPulseTap}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <PulseStage state={pulse} size={212} />
          </Pressable>
        ) : (
          <PulseStage state={pulse} size={212} />
        )}
      </View>
      <View
        style={{
          position: 'absolute',
          left: spacing.md,
          bottom: spacing.md,
          gap: spacing.xs,
          maxWidth: '54%',
        }}
      >
        {chips.map((c) => (
          <View
            key={c.key}
            accessible
            accessibilityLabel={`${c.done ? 'Done: ' : ''}${c.text}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              backgroundColor: 'rgba(36,20,61,0.78)',
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: c.done ? 'rgba(184,242,68,0.55)' : 'rgba(157,128,235,0.45)',
              paddingVertical: 6,
              paddingHorizontal: spacing.sm + 2,
            }}
          >
            <AppText variant="caption" style={{ color: c.done ? brand.lime : brand.violet }}>
              {c.done ? '✓' : '○'}
            </AppText>
            <AppText variant="caption" style={{ color: brand.ivory, flexShrink: 1 }}>
              {c.text}
            </AppText>
          </View>
        ))}
      </View>
    </HeroScene>
  );
}
