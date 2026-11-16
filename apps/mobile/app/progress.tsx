import { withAccount } from '@/account/gate';
import { BadgesCard } from '@/gamification/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { lbToKg, summarizeWeights } from '@dancehall/shared';
import { EmptyState } from '@/ui/EmptyState';
import { InfoTile, SectionTitle } from '@/ui/kit';
import { MaintenanceCard } from '@/progress/MaintenanceCard';
import { RecapCard } from '@/progress/RecapCard';
import { useApp } from '@/data/AppProvider';
import { useWeightState } from '@/wellness/hooks';
import { useDanceData } from '@/dance/hooks';
import { ActivityBars } from '@/dance/ui';
import { errorMessage, useLoad } from '@/data/hooks';
import { t } from '@/i18n';
import { useProgressInsights } from '@/progress/hooks';
import { AchievementList, Celebration, HabitWeek } from '@/progress/ui';
import { formatChange, formatDate, formatWeight, parseDecimal } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';
import { TextField } from '@/ui/TextField';
import { WeightChart } from '@/ui/WeightChart';
import { PeriodCard } from '@/progress/PeriodCard';
import { MeasurementsCard, SleepCard } from '@/wellness/trackers';

function Progress() {
  const { store, profile } = useApp();
  const dance = useDanceData();
  const insights = useProgressInsights();
  const { spacing } = useTheme();
  const units = profile?.unitSystem ?? 'metric';
  // Weight and body measurements are opt-in; with tracking off or numbers hidden this screen shows neither and asks for neither.
  const weight = useWeightState();
  const showW = weight.shown;
  const { data, error, loading } = useLoad(async (s) => ({
    weights: await s.listWeights(),
    goals: await s.listGoals(),
  }));
  const [entry, setEntry] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const weights = data?.weights ?? [];
  const points = weights.map((w) => ({ weightKg: w.weightKg, measuredAt: w.measuredAt }));
  const s = summarizeWeights(points);
  const target =
    (data?.goals ?? [])
      .filter((g) => g.status === 'active')
      .sort((a, b) => a.endDate.localeCompare(b.endDate))[0]?.targetKg ?? null;

  const add = async () => {
    const v = parseDecimal(entry);
    const kg = v === null ? null : units === 'metric' ? v : lbToKg(v);
    if (kg === null || kg < 25 || kg > 400)
      return setMsg(t('today.weightError', { unit: units === 'metric' ? 'kg' : 'lb' }));
    if (adding) return;
    setAdding(true);
    try {
      await store.addWeight({ weightKg: Math.round(kg * 100) / 100 });
      setEntry('');
      setMsg(null);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Screen
      top={false}
      banner={{
        world: 'me',
        title: t('ban.progress.title'),
        line: t('ban.progress.line'),
        pulse: 'idle',
      }}
    >
      <RecapCard />
      <BadgesCard />
      <PeriodCard />
      <MaintenanceCard />
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {loading && !data ? <SkeletonList label={t('common.loading')} cards={2} /> : null}
      {!showW ? (
        weight.on ? null : (
          <AppText variant="caption" muted>
            {t('progress.weightOffNote')}
          </AppText>
        )
      ) : !data ? null : weights.length === 0 ? (
        <EmptyState icon="scale" title={t('progress.emptyTitle')} body={t('progress.empty')} />
      ) : (
        <Card>
          <SectionTitle icon="scale" title={t('progress.weightTitle')} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <InfoTile
              icon="scale"
              label={t('today.latest')}
              value={formatWeight(s.latest!.weightKg, units)}
            />
            {s.change7dKg !== null ? (
              <InfoTile
                icon="swap-vertical"
                label={t('today.change7')}
                value={formatChange(s.change7dKg, units) ?? ''}
              />
            ) : null}
          </View>
          {points.length >= 2 ? (
            <WeightChart points={points} units={units} targetKg={target} />
          ) : (
            <AppText muted>{t('progress.moreData')}</AppText>
          )}
          {target !== null ? (
            <AppText
              variant="caption"
              muted
            >{`- - ${t('progress.target')}: ${formatWeight(target, units)}`}</AppText>
          ) : null}
          <View style={{ gap: spacing.xs }}>
            {s.weeklyRateKg !== null ? (
              <AppText muted>
                {t('progress.rate', { rate: formatChange(s.weeklyRateKg, units) ?? '' })}
              </AppText>
            ) : null}
          </View>
          <AppText variant="caption" muted>
            {t('progress.trendNote')}
          </AppText>
        </Card>
      )}
      <Celebration ids={insights.fresh} />
      <Card>
        <SectionTitle icon="leaf" title={t('habit.title')} />
        <HabitWeek habits={insights.habits} />
      </Card>
      {showW ? <MeasurementsCard /> : null}
      <SleepCard />
      <AchievementList items={insights.achievements} />
      <Card>
        <SectionTitle icon="musical-notes" title={t('dance.activity')} />
        <AppText>{`${t('hst.sessions', { n: dance.summary.thisWeek.sessions })} · ${t('hst.minutes', { n: dance.summary.thisWeek.minutes })} · ${t('hst.days', { n: dance.summary.thisWeek.activeDays })}`}</AppText>
        <ActivityBars summary={dance.summary} />
        <AppText variant="caption" muted>
          {t('hst.gentle')}
        </AppText>
      </Card>
      {showW ? (
        <>
          <Card>
            <AppText variant="heading">{t('progress.add')}</AppText>
            <TextField
              label={`${t('today.logWeight')} (${units === 'metric' ? 'kg' : 'lb'})`}
              value={entry}
              onChangeText={setEntry}
              keyboardType="decimal-pad"
            />
            <Button
              label={t('today.logWeight')}
              onPress={add}
              disabled={adding || entry.trim() === ''}
            />
            {msg ? <Notice tone="warning">{msg}</Notice> : null}
          </Card>
          {weights.length > 0 ? (
            <Card>
              <AppText variant="heading" accessibilityRole="header">
                {t('progress.history')}
              </AppText>
              {weights.map((w) => (
                <View
                  key={w.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{formatWeight(w.weightKg, units)}</AppText>
                    <AppText variant="caption" muted>
                      {formatDate(w.measuredAt)}
                    </AppText>
                  </View>
                  {confirming === w.id ? (
                    <Button
                      label={`${t('common.delete')}?`}
                      onPress={async () => {
                        setConfirming(null);
                        try {
                          await store.deleteWeight(w.id);
                        } catch (e) {
                          setMsg(errorMessage(e));
                        }
                      }}
                    />
                  ) : (
                    <Button
                      variant="secondary"
                      label={t('progress.delete')}
                      onPress={() => setConfirming(w.id)}
                    />
                  )}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(Progress, 'save_progress');
