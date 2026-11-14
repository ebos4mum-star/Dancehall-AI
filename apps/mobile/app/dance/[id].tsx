import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { WORKOUT_BY_ID, addDaysIso, workoutSeconds } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { mmss, STYLE_META } from '@/dance/meta';
import { useDanceData } from '@/dance/hooks';
import { Chip, levelLabel } from '@/dance/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { CharacterStage, DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Reveal } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const w = WORKOUT_BY_ID.get(String(id));
  const { store } = useApp();
  const { colors } = useTheme();
  const dance = useDanceData();
  const [low, setLow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [when, setWhen] = useState('today');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start in the low-impact version when the readiness screening asked for it (until the person chooses otherwise).
  useEffect(() => {
    if (!touched && dance.lowImpactDefault) setLow(true);
  }, [dance.lowImpactDefault, touched]);

  if (!w) {
    return (
      <Screen top={false}>
        <Notice>{t('wk.notFound')}</Notice>
      </Screen>
    );
  }
  const meta = STYLE_META[w.style];
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(dance.todayKey, i));
  const dayLabel = (d: string, i: number) =>
    i === 0
      ? t('wk.today')
      : i === 1
        ? t('wk.tomorrow')
        : new Date(`${d}T12:00:00`).toLocaleDateString('en', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });

  const schedule = async () => {
    setErr(null);
    if (busy) return;
    setBusy(true);
    try {
      const date = when === 'today' ? dance.todayKey : when;
      await store.createSession({
        workoutId: w.id,
        title: w.title,
        style: w.style,
        minutes: w.minutes,
        plannedFor: date,
        lowImpact: low,
        source: 'manual',
      });
      haptics.success();
      setMsg(t('wk.scheduled', { date: formatDate(date) }));
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sections = ['warmup', 'main', 'cooldown'] as const;
  return (
    <Screen top={false}>
      <Reveal>
        <LinearGradient
          colors={[meta.from, meta.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="caption" style={{ color: '#FFFFFF' }}>
                {t(`style.${w.style}` as StringKey).toUpperCase()}
              </AppText>
              <AppText variant="title" accessibilityRole="header" style={{ color: '#FFFFFF' }}>
                {w.title}
              </AppText>
            </View>
            <CharacterStage size={96} />
          </View>
          <AppText style={{ color: '#FFFFFF' }}>{w.summary}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Chip strong label={t('dance.minutes', { n: w.minutes })} />
            <Chip label={levelLabel(w.level)} />
            <Chip label={t(`intensity.${w.intensity}` as StringKey)} />
            <Chip label={t(`impact.${w.impact}` as StringKey)} />
            <Chip label={t('wk.sample')} />
          </View>
        </LinearGradient>
      </Reveal>

      <Notice>{t('wk.textOnly')}</Notice>

      {w.level === 'beginner' ? (
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('wk.beginnerTitle')}
          </AppText>
          <AppText muted>{t('wk.beginnerBody')}</AppText>
        </DepthCard>
      ) : w.level === 'advanced' || w.intensity === 'high' ? (
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('wk.fasterTitle')}
          </AppText>
          <AppText muted>{t('wk.fasterBody')}</AppText>
        </DepthCard>
      ) : null}
      <AppText
        variant="caption"
        muted
      >{`${t(`wk.pace.${w.intensity}` as StringKey)} ${t('wk.stepsBody')}`}</AppText>

      <DepthCard>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <AppText variant="label" style={{ flex: 1 }}>
            {t('wk.lowImpact')}
          </AppText>
          <Switch
            accessibilityLabel={t('wk.lowImpact')}
            value={low}
            onValueChange={(v) => {
              setTouched(true);
              setLow(v);
              haptics.tap();
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <AppText variant="caption" muted>
          {t('wk.lowImpactBody')}
        </AppText>
        {dance.lowImpactDefault && !touched ? (
          <AppText variant="caption" muted>
            {t('wk.readinessHint')}
          </AppText>
        ) : null}
        {w.impact === 'high' && !low ? (
          <AppText variant="caption" style={{ color: colors.warningText }}>
            {t('wk.highImpactHint')}
          </AppText>
        ) : null}
      </DepthCard>

      <View style={{ gap: spacing.sm }}>
        <Button
          label={t('wk.start')}
          onPress={() =>
            router.push({ pathname: '/dance/session', params: { id: w.id, low: low ? '1' : '0' } })
          }
        />
      </View>

      {sections.map((kind) => (
        <DepthCard key={kind}>
          <AppText variant="heading" accessibilityRole="header">
            {t(`wk.${kind}` as StringKey)}
          </AppText>
          {w.blocks
            .filter((b) => b.kind === kind)
            .map((b) => (
              <View key={b.title} style={{ gap: 2 }}>
                <AppText variant="label">{`${b.title} · ${mmss(b.seconds)}`}</AppText>
                <AppText variant="caption" muted>
                  {low ? b.lowImpactAlt : b.cue}
                </AppText>
              </View>
            ))}
        </DepthCard>
      ))}
      <AppText
        variant="caption"
        muted
      >{`${t('dance.minutes', { n: Math.round(workoutSeconds(w) / 60) })} total`}</AppText>

      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('wk.safety')}
        </AppText>
        {w.safety.map((s) => (
          <AppText key={s} variant="caption" muted>{`• ${s}`}</AppText>
        ))}
      </DepthCard>

      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('wk.schedule')}
        </AppText>
        <Choice
          label={t('wk.when')}
          value={when}
          onChange={setWhen}
          options={days.map((d, i) => ({ value: i === 0 ? 'today' : d, label: dayLabel(d, i) }))}
        />
        <Button variant="secondary" label={t('wk.schedule')} onPress={schedule} disabled={busy} />
        {msg ? <Notice>{msg}</Notice> : null}
        {err ? <Notice tone="warning">{err}</Notice> : null}
      </DepthCard>
    </Screen>
  );
}
