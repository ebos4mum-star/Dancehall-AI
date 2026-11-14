import { useState } from 'react';
import { View } from 'react-native';
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

export function SessionRow({ s, onError }: { s: WorkoutSession; onError: (m: string) => void }) {
  const { store } = useApp();
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      haptics.warning();
      onError(errorMessage(e));
    }
  };
  return (
    <DepthCard>
      <AppText variant="heading">{s.title}</AppText>
      <AppText
        variant="caption"
        muted
      >{`${s.plannedFor ? formatDate(s.plannedFor) : ''} · ${t('dance.minutes', { n: s.minutes })}${s.lowImpact ? ` · ${t('impact.low')}` : ''}`}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
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
        <Button
          variant="secondary"
          label={t('sch.done')}
          onPress={() =>
            run(async () => {
              await store.updateSession(s.id, { status: 'completed' });
              haptics.success();
            })
          }
        />
        <Button
          variant="secondary"
          label={t('sch.tomorrow')}
          onPress={() =>
            run(() =>
              store.updateSession(s.id, {
                plannedFor: addDaysIso(s.plannedFor ?? new Date().toISOString().slice(0, 10), 1),
              }),
            )
          }
        />
        <Button
          variant="secondary"
          label={t('sch.skip')}
          onPress={() => run(() => store.updateSession(s.id, { status: 'skipped' }))}
        />
        <Button
          variant="secondary"
          label={t('sch.remove')}
          onPress={() => run(() => store.deleteSession(s.id))}
        />
      </View>
    </DepthCard>
  );
}

export default function Schedule() {
  const dance = useDanceData();
  const [err, setErr] = useState<string | null>(null);
  const empty = dance.overdue.length + dance.todayPlanned.length + dance.upcoming.length === 0;
  return (
    <Screen top={false}>
      {dance.error || err ? <Notice tone="warning">{String(dance.error ?? err)}</Notice> : null}
      {empty ? <Notice>{t('sch.empty')}</Notice> : null}
      {dance.overdue.length > 0 ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('sch.earlier')}
        </AppText>
      ) : null}
      {dance.overdue.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} />
      ))}
      {dance.todayPlanned.length > 0 ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('wk.today')}
        </AppText>
      ) : null}
      {dance.todayPlanned.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} />
      ))}
      {dance.upcoming.length > 0 ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('sch.upcoming')}
        </AppText>
      ) : null}
      {dance.upcoming.map((s) => (
        <SessionRow key={s.id} s={s} onError={setErr} />
      ))}
    </Screen>
  );
}
