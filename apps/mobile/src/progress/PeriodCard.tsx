import { useState } from 'react';
import { View } from 'react-native';
import { periodSummary, type Period, WORKOUT_ENERGY_NOTE } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { InfoTile, SectionTitle } from '@/ui/kit';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { useNumbersHidden, useShowWeight } from '@/wellness/hooks';

/** This week or this month from recorded data only. Missing days are "not logged", never zero; workout energy is a conservative estimate with a range and is hidden without a weight. */
export function PeriodCard() {
  const { profile } = useApp();
  const { spacing } = useTheme();
  const showW = useShowWeight();
  const hideNumbers = useNumbersHidden();
  const [period, setPeriod] = useState<Period>('week');
  const { data, error } = useLoad(async (s) => ({
    sessions: await s.listSessions(),
    logs: await s.listFoodLogs(),
    weights: await s.listWeights(),
  }));
  if (error) return <Notice tone="warning">{error}</Notice>;
  if (!data) return null;
  const latest = [...data.weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const sum = periodSummary({
    period,
    now: new Date(),
    timeZone: profile?.timeZone ?? null,
    foodLogs: data.logs,
    sessions: data.sessions,
    weights: showW ? data.weights : [],
    weightKg: showW && latest ? latest.weightKg : null,
  });
  const m = sum.movement;
  return (
    <Card>
      <SectionTitle
        icon="calendar"
        title={t(period === 'week' ? 'period.weekTitle' : 'period.monthTitle')}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          variant={period === 'week' ? 'primary' : 'secondary'}
          label={t('period.week')}
          onPress={() => setPeriod('week')}
        />
        <Button
          variant={period === 'month' ? 'primary' : 'secondary'}
          label={t('period.month')}
          onPress={() => setPeriod('month')}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <InfoTile
          icon="musical-notes"
          label={t('period.workouts')}
          value={m.sessions === 0 ? t('period.none') : `${m.sessions} · ${m.minutes} min`}
        />
        <InfoTile
          icon="restaurant"
          label={t('period.foodDays')}
          value={
            sum.food.daysLogged === 0 ? t('period.none') : `${sum.food.daysLogged} / ${sum.days}`
          }
        />
        {!hideNumbers && sum.food.avgKcal !== null ? (
          <InfoTile
            icon="flame"
            label={t('period.avgKcal')}
            value={t('food.kcalAbout', { kcal: sum.food.avgKcal })}
          />
        ) : null}
        {!hideNumbers && sum.food.avgProteinG !== null ? (
          <InfoTile
            icon="nutrition"
            label={t('period.avgProtein')}
            value={`${Math.round(sum.food.avgProteinG)} g`}
          />
        ) : null}
        {!hideNumbers && m.estKcal !== null ? (
          <InfoTile
            icon="pulse"
            label={t('period.workoutEnergy')}
            value={`${m.estKcalLow}–${m.estKcalHigh}`}
          />
        ) : null}
        {sum.weight.changeKg !== null ? (
          <InfoTile
            icon="scale"
            label={t('period.weightChange')}
            value={`${sum.weight.changeKg > 0 ? '+' : ''}${sum.weight.changeKg} kg`}
          />
        ) : null}
      </View>
      {!hideNumbers && m.estKcal !== null ? (
        <AppText variant="caption" muted>
          {WORKOUT_ENERGY_NOTE}
        </AppText>
      ) : null}
      {sum.highlights.map((h) => (
        <AppText key={h} variant="caption" muted>
          {h}
        </AppText>
      ))}
    </Card>
  );
}
