import { withAccount } from '@/account/gate';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { brand, radius } from '@/theme/tokens';
import { SectionTitle, type IconName } from '@/ui/kit';
import { router } from 'expo-router';
import { addDaysIso } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import type { WorkoutSession } from '@/data/types';
import { useDanceData } from '@/dance/hooks';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

export function SessionRow({
  s,
  onError,
  todayKey,
}: {
  s: WorkoutSession;
  onError: (m: string) => void;
  todayKey: string;
}) {
  const { store } = useApp();
  const { colors } = useTheme();
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      haptics.warning();
      onError(errorMessage(e));
    }
  };
  const d = s.plannedFor ? new Date(`${s.plannedFor}T12:00:00`) : null;
  const act = (icon: IconName, label: string, go: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        go();
      }}
      style={{
        minHeight: 52,
        minWidth: 64,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <AppText variant="caption">{label}</AppText>
    </Pressable>
  );
  return (
    <DepthCard>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 60,
            borderRadius: radius.md,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: brand.coral,
              width: '100%',
              alignItems: 'center',
              paddingVertical: 2,
            }}
          >
            <AppText variant="caption" style={{ color: brand.plum, fontWeight: '700' }}>
              {d ? d.toLocaleDateString('en', { month: 'short' }).toUpperCase() : ''}
            </AppText>
          </View>
          <AppText variant="title" style={{ fontSize: 24, lineHeight: 30 }}>
            {d ? d.getDate() : '–'}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{s.title}</AppText>
          <AppText variant="caption" muted>
            {`${s.plannedFor ? formatDate(s.plannedFor) : ''} · ${t('dance.minutes', { n: s.minutes })}${s.lowImpact ? ` · ${t('impact.low')}` : ''}`}
          </AppText>
        </View>
      </View>
      {s.workoutId ? (
        <Button
          label={t('sch.start')}
          onPress={() =>
            router.push({
              pathname: '/dance/session',
              params: { id: s.workoutId!, low: s.lowImpact ? '1' : '0', sessionId: s.id },
            })
          }
        />
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {act('checkmark-circle', t('sch.done'), () =>
          run(async () => {
            await store.updateSession(s.id, { status: 'completed' });
            haptics.success();
          }),
        )}
        {act('arrow-redo', t('sch.tomorrow'), () =>
          run(() => store.updateSession(s.id, { plannedFor: addDaysIso(todayKey, 1) })),
        )}
        {act('play-skip-forward', t('sch.skip'), () =>
          run(() => store.updateSession(s.id, { status: 'skipped' })),
        )}
        {act('trash', t('sch.remove'), () => run(() => store.deleteSession(s.id)))}
      </View>
    </DepthCard>
  );
}

function Schedule() {
  const dance = useDanceData();
  const [err, setErr] = useState<string | null>(null);
  const empty = dance.overdue.length + dance.todayPlanned.length + dance.upcoming.length === 0;
  return (
    <Screen
      top={false}
      banner={{
        world: 'dance',
        title: t('ban.schedule.title'),
        line: t('ban.schedule.line'),
        pulse: 'idle',
      }}
    >
      {dance.error || err ? <Notice tone="warning">{String(dance.error ?? err)}</Notice> : null}
      {empty ? <Notice>{t('sch.empty')}</Notice> : null}
      {dance.overdue.length > 0 ? <SectionTitle icon="time" title={t('sch.earlier')} /> : null}
      {dance.overdue.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} todayKey={dance.todayKey} />
      ))}
      {dance.todayPlanned.length > 0 ? <SectionTitle icon="sunny" title={t('wk.today')} /> : null}
      {dance.todayPlanned.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} todayKey={dance.todayKey} />
      ))}
      {dance.upcoming.length > 0 ? (
        <SectionTitle icon="calendar" title={t('sch.upcoming')} />
      ) : null}
      {dance.upcoming.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} todayKey={dance.todayKey} />
      ))}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(Schedule, 'schedule_workout');
