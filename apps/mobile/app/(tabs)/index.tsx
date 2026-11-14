import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import {
  lbToKg,
  localDateKey,
  sessionMinutes,
  summarizeWeights,
  type UnitSystem,
} from '@dancehall/shared';
import { goalFraction } from '@/progress/goalDisplay';
import { todayGlance } from '@/today/glance';
import { TodayHero, type HeroChip } from '@/today/TodayHero';
import { heroLine } from '@/today/heroLine';
import { useTodaySummary } from '@/today/hooks';
import { takeWelcome } from '@/today/welcome';
import { usePulse } from '@/pulse/PulseStage';
import { ReviewBar } from '@/preview/ReviewBar';
import { useReview } from '@/preview/review';
import { haptics } from '@/ui/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/data/AppProvider';
import { PlanCard } from '@/coach/PlanCard';
import { useDanceData } from '@/dance/hooks';
import { useFoodData } from '@/food/hooks';
import { MacroBars } from '@/food/ui';
import { Ring } from '@/ui/motion';
import { errorMessage, useLoad } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { challengeProgress } from '@/challenges/logic';
import { HabitsCard } from '@/habits/HabitsCard';
import { useProgressInsights } from '@/progress/hooks';
import { Celebration, HabitWeek } from '@/progress/ui';
import { formatChange, formatDate, formatWeight, parseDecimal } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { FadeIn } from '@/ui/FadeIn';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';
import { TextField } from '@/ui/TextField';

export default function Today() {
  const { store, profile } = useApp();
  const { spacing, colors } = useTheme();
  const units: UnitSystem = profile?.unitSystem ?? 'metric';
  const { data, loading, error } = useLoad(async (s) => ({
    weights: await s.listWeights(),
    goals: await s.listGoals(),
    readiness: await s.latestReadiness(),
    challenges: await s.listChallenges(),
  }));
  const food = useFoodData();
  const dance = useDanceData();
  const insights = useProgressInsights();
  const activeChallenge = (data?.challenges ?? []).find((c) => c.status === 'active') ?? null;
  const challengeNow = activeChallenge
    ? challengeProgress(activeChallenge, dance.sessions, profile?.timeZone ?? null, new Date())
    : null;
  const summary2 = useTodaySummary();
  const pulse = usePulse();
  const review = useReview();
  const shownPulse = review.pulse ?? pulse.state;
  const { session } = useApp();
  const todayKey = localDateKey(new Date(), profile?.timeZone ?? null);

  // Welcome once per local day; celebrate only a genuine new accomplishment (never on first load); gentle encouragement on a comeback.
  useEffect(() => {
    if (!session) return;
    let live = true;
    void takeWelcome(
      { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) },
      session.userId,
      todayKey,
    ).then((first) => live && first && pulse.send('appOpened'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, todayKey]);
  const prevScore = useRef<number | null>(null);
  useEffect(() => {
    if (!summary2.ready) return;
    if (prevScore.current !== null && summary2.score > prevScore.current) {
      pulse.send('milestone');
      haptics.success();
    }
    prevScore.current = summary2.score;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary2.ready, summary2.score]);
  const comebackSent = useRef(false);
  useEffect(() => {
    if (summary2.comeback && !comebackSent.current) {
      comebackSent.current = true;
      pulse.send('comeback');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary2.comeback]);

  const glance = todayGlance({
    doneToday: dance.doneToday.map((x) => ({ minutes: sessionMinutes(x) })),
    plannedToday: dance.todayPlanned.length,
    mealsLogged: food.todayLogs.length,
    loggedKcal: food.todayTotals.kcal,
  });
  const heroChips: HeroChip[] = [
    ...glance,
    ...(summary2.habitCount > 0
      ? [
          {
            key: 'habits',
            done: summary2.habitsDoneCount > 0,
            text: `Habits: ${summary2.habitsDoneCount} of ${summary2.habitCount} ticked`,
          },
        ]
      : []),
  ];
  const [entry, setEntry] = useState('');
  const [msg, setMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveErr, setMoveErr] = useState<string | null>(null);

  const summary = summarizeWeights(
    (data?.weights ?? []).map((w) => ({ weightKg: w.weightKg, measuredAt: w.measuredAt })),
  );
  const active = (data?.goals ?? []).filter((g) => g.status === 'active');

  const log = async () => {
    const v = parseDecimal(entry);
    const kg = v === null ? null : units === 'metric' ? v : lbToKg(v);
    if (kg === null || kg < 25 || kg > 400)
      return setMsg({
        text: t('today.weightError', { unit: units === 'metric' ? 'kg' : 'lb' }),
        warn: true,
      });
    setBusy(true);
    try {
      await store.addWeight({ weightKg: Math.round(kg * 100) / 100 });
      setEntry('');
      setMsg({ text: t('today.logged'), warn: false });
    } catch (e) {
      setMsg({ text: errorMessage(e), warn: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TodayHero
        greeting={t('today.hello', { name: profile?.displayName ?? '' })}
        line={heroLine({
          pulse: shownPulse,
          next: summary2.next,
          hour: new Date().getHours(),
          doneAnything: summary2.score > 0,
        })}
        chips={heroChips}
        pulse={shownPulse}
      />
      <ReviewBar />
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {loading && !data ? <SkeletonList label={t('common.loading')} /> : null}

      {data?.readiness?.outcome === 'low_impact_and_check_with_professional' ? (
        <FadeIn>
          <Card>
            <AppText variant="heading">{t('today.lowImpactTitle')}</AppText>
            <AppText muted>{t('today.lowImpactBody')}</AppText>
          </Card>
        </FadeIn>
      ) : null}

      <PlanCard onAccomplished={() => pulse.send('milestone')} />

      <FadeIn>
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('today.doneTitle')}
          </AppText>
          {summary2.list.length === 0 ? (
            <AppText muted>{t('today.doneEmpty')}</AppText>
          ) : (
            summary2.list.map((a) => (
              <AppText key={a.key} accessibilityLabel={`${t('today.doneToday')}: ${a.text}`}>
                {`✓ ${a.text}`}
              </AppText>
            ))
          )}
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <AppText variant="heading">{t('today.latest')}</AppText>
          {summary.latest ? (
            <>
              <AppText
                variant="title"
                accessibilityLabel={`${t('today.latest')}: ${formatWeight(summary.latest.weightKg, units)}`}
              >
                {formatWeight(summary.latest.weightKg, units)}
              </AppText>
              <AppText variant="caption" muted>
                {formatDate(summary.latest.measuredAt)}
              </AppText>
              {summary.sevenDayAverageKg !== null ? (
                <AppText
                  muted
                >{`${t('today.sevenDay')}: ${formatWeight(summary.sevenDayAverageKg, units)}`}</AppText>
              ) : null}
              {summary.change7dKg !== null ? (
                <AppText
                  muted
                >{`${t('today.change7')}: ${formatChange(summary.change7dKg, units)}`}</AppText>
              ) : null}
            </>
          ) : (
            <AppText muted>{t('today.noWeight')}</AppText>
          )}
          <TextField
            label={`${t('today.logWeight')} (${units === 'metric' ? 'kg' : 'lb'})`}
            value={entry}
            onChangeText={setEntry}
            keyboardType="decimal-pad"
            placeholder={t('today.weightPlaceholder')}
          />
          <Button
            label={t('today.logWeight')}
            onPress={log}
            disabled={busy || entry.trim() === ''}
          />
          {msg ? <Notice tone={msg.warn ? 'warning' : 'info'}>{msg.text}</Notice> : null}
          {summary.count > 0 ? (
            <Button
              variant="secondary"
              label={t('today.viewProgress')}
              onPress={() => router.push('/progress')}
            />
          ) : null}
        </Card>
      </FadeIn>

      <Celebration ids={insights.fresh} />
      <FadeIn>
        <HabitsCard />
      </FadeIn>
      {activeChallenge && challengeNow ? (
        <FadeIn>
          <Card>
            <AppText variant="heading">
              {t('chal.activeTitle', { n: activeChallenge.lengthDays })}
            </AppText>
            <ProgressBar
              fraction={challengeNow.fraction}
              label={t('chal.progress', {
                done: challengeNow.activeDays,
                target: challengeNow.targetDays,
              })}
            />
            <AppText muted>
              {t('chal.progress', {
                done: challengeNow.activeDays,
                target: challengeNow.targetDays,
              })}
            </AppText>
            <Button
              variant="secondary"
              label={t('chal.todayCta')}
              onPress={() => router.push('/challenges')}
            />
          </Card>
        </FadeIn>
      ) : null}
      <FadeIn>
        <Card>
          <AppText variant="heading">{t('habit.title')}</AppText>
          <HabitWeek habits={insights.habits} />
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <AppText variant="heading">{t('today.moveTitle')}</AppText>
          {dance.todayPlanned.length === 0 && dance.doneToday.length === 0 ? (
            <AppText muted>{t('today.moveNone')}</AppText>
          ) : null}
          {dance.doneToday.map((s) => (
            <AppText
              key={s.id}
              accessibilityLabel={`${t('today.doneToday')}: ${s.title}`}
            >{`✓ ${s.title} · ${t('today.doneToday')}`}</AppText>
          ))}
          {dance.todayPlanned.map((s) => (
            <View key={s.id} style={{ gap: spacing.xs }}>
              <AppText variant="label">{`${s.title} · ${t('dance.minutes', { n: s.minutes })}`}</AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
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
                    void store
                      .updateSession(s.id, { status: 'completed' })
                      .catch((e: unknown) => setMoveErr(errorMessage(e)))
                  }
                />
              </View>
            </View>
          ))}
          {moveErr ? <Notice tone="warning">{moveErr}</Notice> : null}
          <AppText variant="caption" muted>
            {t('today.weekLine', {
              n: dance.summary.thisWeek.sessions,
              m: dance.summary.thisWeek.minutes,
            })}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button label={t('tabs.dance')} onPress={() => router.push('/dance')} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <AppText variant="heading">{t('today.foodTitle')}</AppText>
          {food.todayLogs.length === 0 ? (
            <AppText muted>{t('today.foodEmpty')}</AppText>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Ring
                size={92}
                stroke={10}
                fraction={food.guide ? food.todayTotals.kcal / food.guide.guideKcal : 0}
                color={colors.primary}
                track={colors.border}
              >
                <AppText variant="label">{`~${food.todayTotals.kcal}`}</AppText>
              </Ring>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <AppText
                  variant="caption"
                  muted
                >{`${t('food.kcalAbout', { kcal: food.todayTotals.kcal })} ${t('food.range', { low: food.todayTotals.kcalLow, high: food.todayTotals.kcalHigh })}`}</AppText>
                <MacroBars totals={food.todayTotals} />
              </View>
            </View>
          )}
          {food.todayTotals.unreviewedEstimates > 0 ? (
            <AppText variant="caption" muted>
              {t('food.includesEstimates', { n: food.todayTotals.unreviewedEstimates })}
            </AppText>
          ) : null}
          <Button label={t('today.foodLog')} onPress={() => router.push('/food/camera')} />
        </Card>
      </FadeIn>

      <FadeIn>
        <Card>
          <AppText variant="heading">{t('today.goalsTitle')}</AppText>
          {active.length === 0 ? <AppText muted>{t('today.noGoals')}</AppText> : null}
          {active.map((g) => {
            const fraction = goalFraction(g, summary.latest?.weightKg);
            return (
              <View key={g.id} style={{ gap: spacing.xs }}>
                <AppText variant="label">{`${t(`goals.${g.type}` as StringKey)} · ${t(`goals.${g.period}` as StringKey)}`}</AppText>
                <AppText
                  variant="caption"
                  muted
                >{`${t('goals.from', { start: formatWeight(g.startKg, units), target: formatWeight(g.targetKg, units) })} ${t('goals.until', { date: formatDate(g.endDate) })}`}</AppText>
                {fraction !== null ? (
                  <ProgressBar
                    fraction={fraction}
                    label={`${t(`goals.${g.type}` as StringKey)} ${t(`goals.${g.period}` as StringKey)}`}
                  />
                ) : (
                  <AppText variant="caption" muted>
                    {t('today.goalNeedsWeight')}
                  </AppText>
                )}
              </View>
            );
          })}
          <Button
            variant="secondary"
            label={t('today.manageGoals')}
            onPress={() => router.push('/goals')}
          />
        </Card>
      </FadeIn>

      <Card>
        <AppText variant="heading">{t('today.comingTitle')}</AppText>
        <AppText muted>{t('today.comingBody')}</AppText>
      </Card>
    </Screen>
  );
}
