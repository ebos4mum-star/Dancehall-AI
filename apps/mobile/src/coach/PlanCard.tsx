import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { PLAN_MODES, type PlanMode } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { haptics } from '@/ui/haptics';
import { SkeletonList } from '@/ui/Skeleton';

/** The Daily Fit Plan: a few optional, explained suggestions. Ticking an item is the person's own action (no confirmation needed). */
export function PlanCard() {
  const { store } = useApp();
  const { colors } = useTheme();
  const supported = typeof store.getDailyPlan === 'function';
  const {
    data: plan,
    loading: planLoading,
    error: planError,
  } = useLoad(async (s) => (s.getDailyPlan ? s.getDailyPlan() : null));
  const { data: comeback } = useLoad(async (s) => (s.comebackStatus ? s.comebackStatus() : null));
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!supported) return null;

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    }
  };

  return (
    <View style={{ gap: spacing.md }}>
      {comeback && plan?.mode !== 'comeback' ? (
        <DepthCard>
          <AppText variant="heading">{t('dfp.comebackTitle')}</AppText>
          <AppText muted>{t('dfp.comebackBody')}</AppText>
          <Button
            label={t('dfp.comebackCta')}
            onPress={() =>
              router.push({ pathname: '/coach', params: { prompt: t('coach.prompt.comeback') } })
            }
          />
        </DepthCard>
      ) : null}
      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('dfp.title')}
        </AppText>
        <AppText variant="caption" muted>
          {t('dfp.intro')}
        </AppText>
        {planLoading && !plan ? <SkeletonList label={t('common.loading')} cards={1} /> : null}
        {planError ? <Notice tone="warning">{planError}</Notice> : null}
        {plan && plan.items.length > 0 ? (
          <AppText
            variant="label"
            accessibilityLiveRegion="polite"
            style={{ color: colors.primary }}
          >
            {plan.items.every((i) => i.doneAt !== null)
              ? t('dfp.allDone')
              : t('dfp.nextUp', { title: plan.items.find((i) => i.doneAt === null)!.title })}
          </AppText>
        ) : null}
        {plan ? (
          <>
            <Choice
              value={plan.mode}
              onChange={(m: PlanMode) => guard(() => store.regenerateDailyPlan!(m))}
              options={PLAN_MODES.map((m) => ({
                value: m,
                label: t(`dfp.mode.${m}` as StringKey),
              }))}
            />
            {plan.items.map((it) => {
              const done = it.doneAt !== null;
              return (
                <View key={it.id} style={{ gap: spacing.xs }}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    aria-checked={done}
                    accessibilityLabel={it.title}
                    onPress={() =>
                      guard(async () => {
                        await store.setPlanItemDone!(it.id, !done);
                        if (!done) haptics.tap();
                      })
                    }
                    style={{
                      minHeight: MIN_TOUCH_TARGET,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: radius.sm,
                        borderWidth: 2,
                        borderColor: done ? colors.success : colors.border,
                        backgroundColor: done ? colors.successBg : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {done ? (
                        <AppText variant="label" style={{ color: colors.success }}>
                          ✓
                        </AppText>
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText
                        variant="label"
                        style={{ textDecorationLine: done ? 'line-through' : 'none' }}
                      >
                        {it.title}
                      </AppText>
                      <AppText variant="caption" muted>
                        {it.detail}
                      </AppText>
                    </View>
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    {it.kind === 'workout' && !done && it.ref?.workoutId ? (
                      <Button
                        label={t('dfp.start')}
                        onPress={() =>
                          router.push(
                            it.ref!.sessionId
                              ? {
                                  pathname: '/dance/session',
                                  params: {
                                    id: it.ref!.workoutId!,
                                    low: it.ref!.lowImpact ? '1' : '0',
                                    sessionId: it.ref!.sessionId!,
                                  },
                                }
                              : { pathname: '/dance/[id]', params: { id: it.ref!.workoutId! } },
                          )
                        }
                      />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open === it.id }}
                      aria-expanded={open === it.id}
                      accessibilityLabel={`${t('dfp.why')} ${it.title}`}
                      onPress={() => setOpen(open === it.id ? null : it.id)}
                      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
                    >
                      <AppText variant="label" style={{ color: colors.primary }}>
                        {open === it.id ? `▾ ${t('dfp.why')}` : `▸ ${t('dfp.why')}`}
                      </AppText>
                    </Pressable>
                  </View>
                  {open === it.id ? (
                    <AppText variant="caption" muted>
                      {it.why}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
        {err ? <Notice tone="warning">{err}</Notice> : null}
        <Button variant="secondary" label={t('dfp.ask')} onPress={() => router.push('/coach')} />
      </DepthCard>
    </View>
  );
}
