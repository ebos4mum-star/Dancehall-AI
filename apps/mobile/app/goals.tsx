import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  ageYearsOn,
  goalEndDate,
  goalProgress,
  lbToKg,
  proposeGoal,
  summarizeWeights,
  type GoalPeriod,
  type GoalType,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import type { Goal } from '@/data/types';
import { t, type StringKey } from '@/i18n';
import { formatDate, formatWeight, parseDecimal, todayIso } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

export default function Goals() {
  const { store, profile } = useApp();
  const { spacing } = useTheme();
  const units = profile?.unitSystem ?? 'metric';
  const unitWord = units === 'metric' ? 'kg' : 'lb';
  const { data, error } = useLoad(async (s) => ({
    weights: await s.listWeights(),
    goals: await s.listGoals(),
    priv: await s.getPrivate(),
  }));
  const [type, setType] = useState<GoalType>('lose');
  const [period, setPeriod] = useState<GoalPeriod>('monthly');
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = summarizeWeights(
    (data?.weights ?? []).map((w) => ({ weightKg: w.weightKg, measuredAt: w.measuredAt })),
  );
  const startKg = summary.latest?.weightKg ?? null;

  const proposal = useMemo(() => {
    if (!data?.priv || startKg === null) return null;
    const v = type === 'maintain' || target.trim() === '' ? undefined : parseDecimal(target);
    if (v === null) return null;
    return proposeGoal({
      type,
      period,
      startDate: todayIso(),
      startKg,
      targetKg: v === undefined ? undefined : units === 'metric' ? v : lbToKg(v),
      heightCm: data.priv.heightCm,
      ageYears: ageYearsOn(data.priv.birthDate, new Date()),
    });
  }, [data?.priv, startKg, type, period, target, units]);

  const activeSamePeriod = (data?.goals ?? []).some(
    (g) => g.status === 'active' && g.period === period,
  );

  const create = async () => {
    if (!proposal?.goal) return;
    setBusy(true);
    setMsg(null);
    try {
      await store.createGoal(proposal.goal);
      setTarget('');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (g: Goal, status: 'completed' | 'abandoned') => {
    try {
      await store.setGoalStatus(g.id, status);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  const goals = data?.goals ?? [];
  return (
    <Screen top={false}>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {goals.length === 0 ? <AppText muted>{t('goals.empty')}</AppText> : null}
      {goals.map((g) => {
        const p = summary.latest
          ? goalProgress(g, summary.latest.weightKg)
          : { fraction: 0, onTrack: false };
        return (
          <Card key={g.id}>
            <AppText variant="heading">{`${t(`goals.${g.type}` as StringKey)} · ${t(`goals.${g.period}` as StringKey)}`}</AppText>
            <AppText
              muted
            >{`${t('goals.from', { start: formatWeight(g.startKg, units), target: formatWeight(g.targetKg, units) })} ${t('goals.until', { date: formatDate(g.endDate) })}`}</AppText>
            <AppText variant="caption" muted>
              {t(`goals.${g.status}` as StringKey)}
            </AppText>
            {g.status === 'active' ? (
              <>
                <ProgressBar
                  fraction={p.fraction}
                  label={`${t(`goals.${g.type}` as StringKey)} ${t(`goals.${g.period}` as StringKey)}`}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Button label={t('goals.complete')} onPress={() => setStatus(g, 'completed')} />
                  <Button
                    variant="secondary"
                    label={t('goals.end')}
                    onPress={() => setStatus(g, 'abandoned')}
                  />
                </View>
              </>
            ) : null}
          </Card>
        );
      })}

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('goals.new')}
        </AppText>
        {startKg === null || !data?.priv ? (
          <Notice>{t('goals.needWeight')}</Notice>
        ) : (
          <>
            <Choice
              label={t('goals.type')}
              value={type}
              onChange={setType}
              options={(['lose', 'maintain', 'gain'] as const).map((v) => ({
                value: v,
                label: t(`goals.${v}` as StringKey),
              }))}
            />
            <Choice
              label={t('goals.period')}
              value={period}
              onChange={setPeriod}
              options={(['weekly', 'monthly', 'yearly'] as const).map((v) => ({
                value: v,
                label: t(`goals.${v}` as StringKey),
              }))}
            />
            {type !== 'maintain' ? (
              <TextField
                label={t('goals.target', { unit: unitWord })}
                hint={t('goals.targetHint')}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
              />
            ) : null}
            {proposal ? (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="label">
                  {t(proposal.status === 'block' ? 'goals.blocked' : 'goals.preview')}
                </AppText>
                {proposal.goal ? (
                  <AppText>{`${formatWeight(proposal.goal.startKg, units)} → ${formatWeight(proposal.goal.targetKg, units)} (${t('goals.until', { date: formatDate(goalEndDate(todayIso(), period)) })})`}</AppText>
                ) : null}
                {proposal.reasons.map((r) => (
                  <AppText key={r} variant="caption" muted>
                    {r}
                  </AppText>
                ))}
              </View>
            ) : null}
            {activeSamePeriod ? (
              <Notice>
                {t('goals.exists', { period: t(`goals.${period}` as StringKey).toLowerCase() })}
              </Notice>
            ) : null}
            {msg ? <Notice tone="warning">{msg}</Notice> : null}
            <Button
              label={t('goals.create')}
              onPress={create}
              disabled={busy || !proposal?.goal || proposal.status === 'block' || activeSamePeriod}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}
