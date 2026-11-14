import { useMemo, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  DANCE_STYLES,
  LEVELS,
  PROGRAMS,
  QUICK_FIT_MINUTES,
  WORKOUT_DATA_NOTICE,
  filterWorkouts,
  suggestQuickFit,
  type DanceStyle,
  type Intensity,
  type Level,
  type QuickFitMinutes,
} from '@dancehall/shared';
import { useDanceData } from '@/dance/hooks';
import { StyleCarousel, WorkoutCard } from '@/dance/ui';
import { t, type StringKey } from '@/i18n';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Reveal, usePressScale } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

let pickCounter = 0;

function QuickPill({ minutes, onPress }: { minutes: QuickFitMinutes; onPress: () => void }) {
  const press = usePressScale();
  return (
    <Pressable
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={`${t('dance.quickFit')} ${t('dance.minutes', { n: minutes })}`}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
    >
      <Animated.View
        style={[
          press.style,
          {
            minHeight: 64,
            borderRadius: radius.lg,
            backgroundColor: brand.lime,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <AppText variant="title" style={{ color: brand.plum, fontSize: 26, lineHeight: 30 }}>
          {minutes}
        </AppText>
        <AppText variant="caption" style={{ color: brand.plum }}>
          min
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

export default function Dance() {
  const { colors } = useTheme();
  const dance = useDanceData();
  const [style, setStyle] = useState<DanceStyle | 'all'>('all');
  const [level, setLevel] = useState<Level | 'any'>('any');
  const [intensity, setIntensity] = useState<Intensity | 'any'>('any');
  const [duration, setDuration] = useState<'any' | '5' | '10' | '15' | '20'>('any');
  const [lowOnly, setLowOnly] = useState(false);

  const results = useMemo(
    () =>
      filterWorkouts({
        styles: style === 'all' ? undefined : [style],
        levels: level === 'any' ? undefined : [level],
        intensities: intensity === 'any' ? undefined : [intensity],
        minutes:
          duration === 'any' ? undefined : duration === '20' ? [20, 30, 45] : [Number(duration)],
        lowImpactOnly: lowOnly || undefined,
      }),
    [style, level, intensity, duration, lowOnly],
  );

  const quick = (minutes: QuickFitMinutes) => {
    const w = suggestQuickFit({
      minutes,
      lowImpactOnly: dance.lowImpactDefault,
      style: style === 'all' ? undefined : style,
      seed: pickCounter++,
    });
    if (w) router.push({ pathname: '/dance/[id]', params: { id: w.id } });
  };
  const surprise = () => {
    const pool = results.length > 0 ? results : filterWorkouts({});
    const w = pool[(pickCounter++ * 7 + new Date().getMinutes()) % pool.length];
    if (w) router.push({ pathname: '/dance/[id]', params: { id: w.id } });
  };

  return (
    <Screen title={t('tabs.dance')}>
      <Reveal>
        <HeroCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <AppText variant="title" accessibilityRole="header" style={{ color: colors.onHero }}>
                {t('dance.heroTitle')}
              </AppText>
              <AppText style={{ color: colors.onHero }}>{t('dance.heroBody')}</AppText>
            </View>
            <CharacterStage size={92} />
          </View>
          <AppText variant="label" style={{ color: colors.onHero }}>
            {t('dance.quickFit')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {QUICK_FIT_MINUTES.map((m) => (
              <QuickPill key={m} minutes={m} onPress={() => quick(m)} />
            ))}
          </View>
          {dance.lowImpactDefault ? (
            <AppText variant="caption" style={{ color: colors.onHero }}>
              {t('dance.lowDefault')}
            </AppText>
          ) : null}
        </HeroCard>
      </Reveal>

      <Notice>{t('dance.sampleNotice')}</Notice>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button variant="secondary" label={t('dance.surprise')} onPress={surprise} />
        <Button
          variant="secondary"
          label={t('dance.schedule')}
          onPress={() => router.push('/dance/schedule')}
        />
        <Button
          variant="secondary"
          label={t('dance.activity')}
          onPress={() => router.push('/dance/history')}
        />
      </View>

      <Reveal delay={60}>
        <AppText variant="heading" accessibilityRole="header">
          {t('dance.styles')}
        </AppText>
        <StyleCarousel value={style} onChange={setStyle} styles={DANCE_STYLES} />
      </Reveal>

      <DepthCard>
        <Choice
          label={t('dance.level')}
          value={level}
          onChange={setLevel}
          options={[
            { value: 'any', label: t('dance.any') },
            ...LEVELS.map((l) => ({ value: l, label: t(`level.${l}` as StringKey) })),
          ]}
        />
        <Choice
          label={t('dance.intensity')}
          value={intensity}
          onChange={setIntensity}
          options={[
            { value: 'any', label: t('dance.any') },
            ...(['low', 'moderate', 'high'] as const).map((i) => ({
              value: i,
              label: t(`intensity.${i}` as StringKey),
            })),
          ]}
        />
        <Choice
          label={t('dance.duration')}
          value={duration}
          onChange={setDuration}
          options={[
            { value: 'any', label: t('dance.any') },
            { value: '5', label: '5' },
            { value: '10', label: '10' },
            { value: '15', label: '15' },
            { value: '20', label: '20+' },
          ]}
        />
        <Choice
          value={lowOnly ? 'yes' : 'no'}
          onChange={(v) => setLowOnly(v === 'yes')}
          options={[
            { value: 'no', label: t('dance.any') },
            { value: 'yes', label: t('dance.lowImpactOnly') },
          ]}
        />
      </DepthCard>

      <AppText
        variant="heading"
        accessibilityRole="header"
      >{`${t('dance.browse')} (${results.length})`}</AppText>
      {results.length === 0 ? <Notice>{t('dance.noResults')}</Notice> : null}
      {results.map((w, i) => (
        <Reveal key={w.id} delay={Math.min(i, 6) * 40}>
          <WorkoutCard
            w={w}
            onPress={() => router.push({ pathname: '/dance/[id]', params: { id: w.id } })}
          />
        </Reveal>
      ))}

      <AppText variant="heading" accessibilityRole="header">
        {t('dance.programs')}
      </AppText>
      {PROGRAMS.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={p.title}
          onPress={() => router.push({ pathname: '/dance/program', params: { id: p.id } })}
        >
          <LinearGradient
            colors={[colors.heroFrom, colors.heroTo]}
            style={{ borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs }}
          >
            <AppText variant="heading" style={{ color: colors.onHero }}>
              {p.title}
            </AppText>
            <AppText
              variant="caption"
              style={{ color: colors.onHero }}
            >{`${p.weeks} weeks · ${p.sessionsPerWeek} sessions a week · ${t(`level.${p.level}` as StringKey)}`}</AppText>
          </LinearGradient>
        </Pressable>
      ))}
      <AppText variant="caption" muted>
        {WORKOUT_DATA_NOTICE}
      </AppText>
    </Screen>
  );
}
