import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { t } from '@/i18n';
import type { CoachAction, CoachMessage } from '@/data/types';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Reveal } from '@/ui/motion';

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
  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: open ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <AppText variant="caption" muted>
        {t('coach.proposed')}
      </AppText>
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

/** A chat bubble. Assistant bubbles say they are simulated, offer the reasons behind the reply, and show what personal data (if any) was used. */
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
      <View style={{ alignSelf: 'flex-start', maxWidth: '92%', gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderBottomLeftRadius: 4,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          {m.provider === 'mock' ? (
            <AppText variant="caption" muted>
              {t('coach.simulated')}
            </AppText>
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
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <AppText variant="label" style={{ color: colors.primary }}>
                {why ? `▾ ${t('coach.hideWhy')}` : `▸ ${t('coach.why')}`}
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
    </Reveal>
  );
}
