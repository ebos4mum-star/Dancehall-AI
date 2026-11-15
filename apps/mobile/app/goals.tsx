import { showMoment } from '@/pulse/moment';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  ageYearsOn,
  goalEndDate,
  lbToKg,
  proposeGoal,
  summarizeWeights,
  type GoalPeriod,
  type GoalType,
} from '@dancehall/shared';
import { IconAction, IconBadge, SectionTitle } from '@/ui/kit';
import { EmptyState } from '@/ui/EmptyState';
import { Ring } from '@/ui/motion';
import { brand } from '@/theme/tokens';
import { goalFraction } from '@/progress/goalDisplay';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import type { Goal } from '@/data/types';
import { FocusCard } from '@/wellness/ui';
import { ApproachCard } from '@/wellness/approach';
import { useShowWeight } from '@/wellness/hooks';
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
  const { spacing, colors } = useTheme();
  const showW = useShowWeight();
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
      showMoment(t('moment.goalSet'), 'welcome');
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
    <Screen
      top={false}
      banner={{
        world: 'me',
        title: t('ban.goals.title'),
        line: t('ban.goals.line'),
        pulse: 'idle',
      }}
    >
      <FocusCard part="goals" />
      <ApproachCard />
      <FocusCard part="rest" />
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {showW && goals.length === 0 ? (
        <EmptyState icon="flag" title={t('goals.emptyTitle')} body={t('goals.empty')} />
      ) : null}
      {(showW ? goals : []).map((g) => {
        const fraction = goalFraction(g, summary.latest?.weightKg);
        const label = `${t(`goals.${g.type}` as StringKey)} · ${t(`goals.${g.period}` as StringKey)}`;
        return (
          <Card key={g.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              {g.status === 'active' && fraction !== null ? (
                <Ring
                  size={84}
                  stroke={9}
                  fraction={fraction}
                  color={colors.primary}
                  track={colors.border}
                >
                  <AppText variant="label">{`${Math.round(fraction * 100)}%`}</AppText>
                </Ring>
              ) : (
                <IconBadge
                  name={
                    g.status === 'completed'
                      ? 'checkmark-circle'
                      : g.status === 'abandoned'
                        ? 'pause-circle'
                        : 'flag'
                  }
                  size={56}
                  fill={g.status === 'completed' ? colors.successBg : brand.violet}
                  color={g.status === 'completed' ? colors.success : brand.plum}
                />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading">{label}</AppText>
                <AppText
                  variant="caption"
                  muted
                >{`${t('goals.from', { start: formatWeight(g.startKg, units), target: formatWeight(g.targetKg, units) })} ${t('goals.until', { date: formatDate(g.endDate) })}`}</AppText>
                <AppText variant="caption" muted>
                  {t(`goals.${g.status}` as StringKey)}
                </AppText>
              </View>
            </View>
            {g.status === 'active' ? (
              <>
                {fraction === null ? (
                  <AppText variant="caption" muted>
                    {t('today.goalNeedsWeight')}
                  </AppText>
                ) : (
                  <ProgressBar fraction={fraction} label={label} />
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <IconAction
                    icon="checkmark-circle"
                    label={t('goals.complete')}
                    onPress={() => setStatus(g, 'completed')}
                  />
                  <IconAction
                    icon="pause-circle"
                    label={t('goals.end')}
                    onPress={() => setStatus(g, 'abandoned')}
                  />
                </View>
              </>
            ) : null}
          </Card>
        );
      })}

      {showW ? (
        <Card>
          <SectionTitle icon="add-circle" title={t('goals.new')} />
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
                disabled={
                  busy || !proposal?.goal || proposal.status === 'block' || activeSamePeriod
                }
              />
            </>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
