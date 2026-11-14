import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PROGRAMS, WORKOUT_BY_ID, addDaysIso, programSessions } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { useDanceData } from '@/dance/hooks';
import { programProgress, programSlots } from '@/dance/programProgress';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SectionTitle } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';
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
  const { colors } = useTheme();
  const [when, setWhen] = useState('today');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!p)
    return (
      <Screen top={false}>
        <Notice>{t('wk.notFound')}</Notice>
      </Screen>
    );

  const slots = programSlots(p.schedule, dance.sessions, p.id);
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
    <Screen
      top={false}
      banner={{
        world: 'dance',
        title: t('ban.program.title'),
        line: t('ban.program.line'),
        pulse: 'dance',
      }}
    >
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
          <SectionTitle icon="calendar" title={t('prg.week', { n: wk })} />
          <View style={{ gap: spacing.xs }}>
            {slots
              .filter((sl) => sl.week === wk)
              .map((sl) => {
                const w = WORKOUT_BY_ID.get(sl.workoutId)!;
                const icon =
                  sl.status === 'completed'
                    ? 'checkmark-circle'
                    : sl.status === 'skipped'
                      ? 'play-skip-forward-circle'
                      : sl.status === 'planned'
                        ? 'time'
                        : 'ellipse-outline';
                return (
                  <Pressable
                    key={`${wk}-${sl.day}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Day ${sl.day}: ${w.title}, ${t(`prg.slot.${sl.status}` as StringKey)}`}
                    onPress={() => router.push({ pathname: '/dance/[id]', params: { id: w.id } })}
                    style={{
                      minHeight: 52,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                    }}
                  >
                    <Ionicons
                      name={icon}
                      size={26}
                      color={sl.status === 'completed' ? colors.success : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">{`Day ${sl.day}: ${w.title}`}</AppText>
                      <AppText variant="caption" muted>
                        {`${t('dance.minutes', { n: w.minutes })} · ${t(`level.${w.level}` as StringKey)} · ${t(`prg.slot.${sl.status}` as StringKey)}`}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
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
