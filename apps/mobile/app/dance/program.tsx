import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PROGRAMS, WORKOUT_BY_ID, addDaysIso, programSessions } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { useDanceData } from '@/dance/hooks';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

export default function Program() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = PROGRAMS.find((x) => x.id === id);
  const { store } = useApp();
  const dance = useDanceData();
  const [when, setWhen] = useState('today');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!p)
    return (
      <Screen top={false}>
        <Notice>{t('wk.notFound')}</Notice>
      </Screen>
    );

  const already = dance.sessions.some((s) => s.programId === p.id && s.status === 'planned');
  // Next Monday on or after tomorrow.
  const dow = (new Date(`${dance.todayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  const nextMonday = addDaysIso(dance.todayKey, dow === 0 ? 7 : 7 - dow);
  const start =
    when === 'today'
      ? dance.todayKey
      : when === 'tomorrow'
        ? addDaysIso(dance.todayKey, 1)
        : nextMonday;

  const go = async () => {
    setErr(null);
    try {
      const inputs = programSessions(p, start).map((x) => {
        const w = WORKOUT_BY_ID.get(x.workoutId)!;
        return {
          workoutId: w.id,
          programId: p.id,
          title: w.title,
          style: w.style,
          minutes: w.minutes,
          plannedFor: x.plannedFor,
          lowImpact: dance.lowImpactDefault,
          source: 'program' as const,
        };
      });
      const made = await store.createSessions(inputs);
      haptics.success();
      setMsg(t('prg.started', { n: made.length, date: formatDate(start) }));
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    }
  };

  return (
    <Screen top={false}>
      <AppText variant="title" accessibilityRole="header">
        {p.title}
      </AppText>
      <AppText muted>{p.description}</AppText>
      <Notice>{t('prg.sample')}</Notice>
      {Array.from({ length: p.weeks }, (_, i) => i + 1).map((wk) => (
        <DepthCard key={wk}>
          <AppText variant="heading">{t('prg.week', { n: wk })}</AppText>
          <View style={{ gap: spacing.xs }}>
            {p.schedule
              .filter((s) => s.week === wk)
              .map((s) => {
                const w = WORKOUT_BY_ID.get(s.workoutId)!;
                return (
                  <AppText
                    key={`${wk}-${s.day}`}
                    variant="caption"
                    muted
                  >{`Day ${s.day}: ${w.title} · ${t('dance.minutes', { n: w.minutes })} · ${t(`level.${w.level}` as StringKey)}`}</AppText>
                );
              })}
          </View>
        </DepthCard>
      ))}
      <DepthCard>
        <Choice
          label={t('prg.when')}
          value={when}
          onChange={setWhen}
          options={[
            { value: 'today', label: t('wk.today') },
            { value: 'tomorrow', label: t('wk.tomorrow') },
            { value: 'monday', label: t('prg.nextMon') },
          ]}
        />
        {already ? <Notice>{t('prg.already')}</Notice> : null}
        <Button label={t('prg.start')} disabled={already} onPress={go} />
        {msg ? <Notice>{msg}</Notice> : null}
        {err ? <Notice tone="warning">{err}</Notice> : null}
      </DepthCard>
    </Screen>
  );
}
