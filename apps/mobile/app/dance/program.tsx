import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PROGRAMS, WORKOUT_BY_ID, addDaysIso, programSessions } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { useDanceData } from '@/dance/hooks';
import { programProgress } from '@/dance/programProgress';
import { ProgressBar } from '@/ui/ProgressBar';
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

  const prog = programProgress(p.id, p.schedule.length, dance.sessions, dance.todayKey);
  const earlierSessions = dance.sessions.filter(
    (x) => x.programId === p.id && x.status === 'planned' && (x.plannedFor ?? '') < dance.todayKey,
  );
  const moveEarlier = async () => {
    setErr(null);
    try {
      // One per day starting today, so nothing piles up on a single day.
      for (const [idx, x] of earlierSessions.entries())
        await store.updateSession(x.id, { plannedFor: addDaysIso(dance.todayKey, idx) });
      haptics.success();
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    }
  };
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
      {prog.started ? (
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {prog.finished ? t('prg.finished') : t('prg.progressTitle')}
          </AppText>
          <ProgressBar
            fraction={prog.total > 0 ? prog.completed / prog.total : 0}
            label={t('prg.progress', { done: prog.completed, total: prog.total })}
          />
          <AppText muted>{t('prg.progress', { done: prog.completed, total: prog.total })}</AppText>
          {prog.upcoming > 0 ? (
            <AppText variant="caption" muted>
              {t('prg.upcoming', { n: prog.upcoming })}
            </AppText>
          ) : null}
          {prog.earlier > 0 ? (
            <>
              <AppText variant="caption" muted>
                {t('prg.earlier', { n: prog.earlier })}
              </AppText>
              <Button variant="secondary" label={t('prg.moveEarlier')} onPress={moveEarlier} />
            </>
          ) : null}
        </DepthCard>
      ) : null}
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
