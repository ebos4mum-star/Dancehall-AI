import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { WORKOUT_BY_ID, addDaysIso } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { mmss, STYLE_META } from '@/dance/meta';
import { useDanceData } from '@/dance/hooks';
import { Fact } from '@/dance/ui';
import { Disclosure, IconBadge, SegmentedBar } from '@/ui/kit';
import { Ionicons } from '@expo/vector-icons';
import { INTENSITY_NUM, LEVEL_NUM, STYLE_ICON } from '@/dance/meta';
import { brand } from '@/theme/tokens';
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
  const kindTint = { warmup: brand.coral, main: brand.violet, cooldown: brand.lime } as const;
  const secs = (k: (typeof sections)[number]) =>
    w.blocks.filter((b) => b.kind === k).reduce((a, b) => a + b.seconds, 0);
  return (
    <Screen top={false}>
      <Reveal>
        <LinearGradient
          colors={[meta.from, meta.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
            overflow: 'hidden',
          }}
        >
          <Ionicons
            name={STYLE_ICON[w.style]}
            size={160}
            color="#FFFFFF"
            style={{ position: 'absolute', right: -24, top: -10, opacity: 0.1 }}
            accessibilityElementsHidden
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="caption" style={{ color: '#FFFFFF', letterSpacing: 1 }}>
                {t(`style.${w.style}` as StringKey).toUpperCase()}
              </AppText>
              <AppText variant="title" accessibilityRole="header" style={{ color: '#FFFFFF' }}>
                {w.title}
              </AppText>
            </View>
            <CharacterStage size={96} />
          </View>
          <AppText style={{ color: '#FFFFFF' }}>{w.summary}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Fact icon="time" label={t('dance.minutes', { n: w.minutes })} />
            <Fact meter={LEVEL_NUM[w.level]} label={t(`level.${w.level}` as StringKey)} />
            <Fact
              meter={INTENSITY_NUM[w.intensity]}
              label={t(`intensity.${w.intensity}` as StringKey)}
            />
            <Fact
              icon={w.impact === 'low' ? 'leaf' : 'footsteps'}
              label={t(`impact.${w.impact}` as StringKey)}
            />
          </View>
        </LinearGradient>
      </Reveal>

      <Button
        label={t('wk.start')}
        onPress={() =>
          router.push({ pathname: '/dance/session', params: { id: w.id, low: low ? '1' : '0' } })
        }
      />

      {w.level === 'beginner' ? (
        <DepthCard>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <IconBadge name="sparkles" size={36} fill={colors.primary} color={colors.onPrimary} />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {t('wk.beginnerTitle')}
            </AppText>
          </View>
          <AppText muted>{t('wk.beginnerBody')}</AppText>
        </DepthCard>
      ) : w.level === 'advanced' || w.intensity === 'high' ? (
        <DepthCard>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <IconBadge
              name="speedometer"
              size={36}
              fill={colors.primary}
              color={colors.onPrimary}
            />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {t('wk.fasterTitle')}
            </AppText>
          </View>
          <AppText muted>{t('wk.fasterBody')}</AppText>
        </DepthCard>
      ) : null}

      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('wk.shape')}
        </AppText>
        <SegmentedBar
          label={t('wk.shape')}
          segments={w.blocks.map((b) => ({ weight: b.seconds, fill: 1, tint: kindTint[b.kind] }))}
        />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: spacing.sm,
          }}
        >
          {sections.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kindTint[k] }}
              />
              <AppText variant="caption">{`${t(`wk.${k}` as StringKey)} ${mmss(secs(k))}`}</AppText>
            </View>
          ))}
        </View>
        <AppText variant="caption" muted>
          {`${t(('wk.pace.' + w.intensity) as StringKey)} ${t('wk.stepsBody')}`}
        </AppText>
        <Notice>{t('wk.textOnly')}</Notice>
      </DepthCard>

      <DepthCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconBadge name="leaf" size={40} fill={brand.lime} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{t('wk.lowImpact')}</AppText>
            <AppText variant="caption" muted>
              {t('wk.lowImpactBody')}
            </AppText>
          </View>
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

      {sections.map((kind) => (
        <Disclosure
          key={kind}
          title={t(`wk.${kind}` as StringKey)}
          summary={`${w.blocks.filter((b) => b.kind === kind).length} · ${mmss(secs(kind))}`}
          initiallyOpen={kind === 'warmup'}
        >
          {w.blocks
            .filter((b) => b.kind === kind)
            .map((b) => (
              <View key={b.title} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: kindTint[kind] }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{`${b.title} · ${mmss(b.seconds)}`}</AppText>
                  <AppText variant="caption" muted>
                    {low ? b.lowImpactAlt : b.cue}
                  </AppText>
                </View>
              </View>
            ))}
        </Disclosure>
      ))}

      <Disclosure title={t('wk.safety')} summary={`${w.safety.length}`}>
        {w.safety.map((s) => (
          <AppText key={s} variant="caption" muted>{`• ${s}`}</AppText>
        ))}
      </Disclosure>

      <Disclosure title={t('wk.schedule')}>
        <Choice
          label={t('wk.when')}
          value={when}
          onChange={setWhen}
          options={days.map((d, i) => ({ value: i === 0 ? 'today' : d, label: dayLabel(d, i) }))}
        />
        <Button variant="secondary" label={t('wk.schedule')} onPress={schedule} disabled={busy} />
        {msg ? <Notice>{msg}</Notice> : null}
        {err ? <Notice tone="warning">{err}</Notice> : null}
      </Disclosure>
    </Screen>
  );
}
