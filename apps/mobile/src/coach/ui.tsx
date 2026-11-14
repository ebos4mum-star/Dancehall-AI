import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PulseStage } from '@/pulse/PulseStage';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { IconBadge } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import { t } from '@/i18n';
import type { CoachAction, CoachMessage } from '@/data/types';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Reveal } from '@/ui/motion';

/** The coach's avatar: Pulse's head and shoulders in a round frame. */
export function CoachAvatar({ size = 40 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: brand.plum,
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      <View style={{ marginTop: -size * 0.04 }}>
        <PulseStage state="idle" size={size * 1.15} />
      </View>
    </View>
  );
}

/** Three dots that pulse while the coach is "thinking" (static under reduced motion). */
export function TypingBubble({ label }: { label: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduced, v]);
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <CoachAvatar />
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.lg,
          borderBottomLeftRadius: 4,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        {[0, 1, 2].map((n) => (
          <Animated.View
            key={n}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.textMuted,
              opacity: reduced
                ? 0.7
                : v.interpolate({ inputRange: [0, 1], outputRange: n === 1 ? [1, 0.3] : [0.3, 1] }),
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** One proposed change. Nothing happens until the person taps Apply. */
export function ActionCard({
  action,
  onDecide,
  busy,
}: {
  action: CoachAction;
  onDecide: (d: 'applied' | 'dismissed') => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const open = action.status === 'proposed';
  const icon =
    action.status === 'applied'
      ? 'checkmark-circle'
      : action.status === 'dismissed'
        ? 'close-circle'
        : 'flash';
  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: open ? 2 : 1,
        borderColor: open ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <IconBadge
          name={icon}
          size={32}
          fill={action.status === 'applied' ? colors.success : open ? brand.lime : colors.border}
          color={action.status === 'applied' ? '#FFFFFF' : brand.plum}
        />
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {t('coach.proposed')}
        </AppText>
      </View>
      <AppText variant="label">{action.summary}</AppText>
      {open ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button label={t('coach.apply')} disabled={busy} onPress={() => onDecide('applied')} />
            <Button
              variant="secondary"
              label={t('coach.notNow')}
              disabled={busy}
              onPress={() => onDecide('dismissed')}
            />
          </View>
          <AppText variant="caption" muted>
            {t('coach.confirmNote')}
          </AppText>
        </>
      ) : (
        <AppText
          variant="caption"
          style={{ color: action.status === 'applied' ? colors.success : colors.textMuted }}
        >
          {action.status === 'applied' ? t('coach.applied') : t('coach.dismissed')}
        </AppText>
      )}
    </View>
  );
}

/** A chat bubble. Coach bubbles lead with the avatar, carry a visible "simulated" tag, offer the reasons behind the reply, and show what personal data (if any) was used. */
export function Bubble({
  m,
  summaryLines,
  onDecide,
  busy,
}: {
  m: CoachMessage;
  summaryLines: string[];
  onDecide: (a: CoachAction, d: 'applied' | 'dismissed') => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const [why, setWhy] = useState(false);
  if (m.role === 'user') {
    return (
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          backgroundColor: colors.primary,
          borderRadius: radius.lg,
          borderBottomRightRadius: 4,
          padding: spacing.md,
        }}
      >
        <AppText style={{ color: colors.onPrimary }}>{m.content}</AppText>
      </View>
    );
  }
  return (
    <Reveal>
      <View
        style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', maxWidth: '96%' }}
      >
        <CoachAvatar />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderTopLeftRadius: 4,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
            {m.provider === 'mock' ? (
              <View
                accessible
                accessibilityLabel={t('coach.simulated')}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  gap: 4,
                  alignItems: 'center',
                  backgroundColor: brand.coral,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                }}
              >
                <Ionicons name="flask" size={12} color={brand.plum} />
                <AppText variant="caption" style={{ color: brand.plum, fontWeight: '700' }}>
                  {t('coach.simulatedTag')}
                </AppText>
              </View>
            ) : null}
            <AppText>{m.content}</AppText>
            {m.supportReferral ? (
              <View
                style={{
                  backgroundColor: colors.warningBg,
                  borderRadius: radius.md,
                  padding: spacing.sm,
                  gap: 2,
                }}
                accessibilityRole="alert"
              >
                <AppText variant="label" style={{ color: colors.warningText }}>
                  {t('coach.support')}
                </AppText>
                <AppText variant="caption" style={{ color: colors.warningText }}>
                  {t('coach.supportBody')}
                </AppText>
              </View>
            ) : null}
            {m.because.length > 0 || summaryLines.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: why }}
                aria-expanded={why}
                accessibilityLabel={why ? t('coach.hideWhy') : t('coach.why')}
                onPress={() => setWhy(!why)}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons
                  name={why ? 'chevron-up-circle' : 'help-circle'}
                  size={20}
                  color={colors.primary}
                />
                <AppText variant="label" style={{ color: colors.primary }}>
                  {why ? t('coach.hideWhy') : t('coach.why')}
                </AppText>
              </Pressable>
            ) : null}
            {why ? (
              <View style={{ gap: spacing.xs }}>
                {m.because.map((b) => (
                  <AppText key={b} variant="caption" muted>{`• ${b}`}</AppText>
                ))}
                <AppText variant="caption" style={{ fontWeight: '600' }}>
                  {t('coach.used')}
                </AppText>
                {(m.usedPersonalData ? summaryLines : [t('coach.usedNothing')]).map((l) => (
                  <AppText key={l} variant="caption" muted>{`• ${l}`}</AppText>
                ))}
              </View>
            ) : null}
          </View>
          {m.actions.map((a) => (
            <ActionCard key={a.id} action={a} busy={busy} onDecide={(d) => onDecide(a, d)} />
          ))}
        </View>
      </View>
    </Reveal>
  );
}
