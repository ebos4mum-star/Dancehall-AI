import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  DANCE_STYLES,
  LEVELS,
  MOODS,
  recommendByMood,
  type Mood,
  PROGRAMS,
  QUICK_FIT_MINUTES,
  WORKOUT_BY_ID,
  WORKOUT_DATA_NOTICE,
  filterWorkouts,
  suggestQuickFit,
  type DanceStyle,
  type Intensity,
  type Level,
  type QuickFitMinutes,
  WORKOUTS,
  isSeatedSuitable,
  levelSuggestion,
  parsePrefs,
} from '@dancehall/shared';
import { useDanceData } from '@/dance/hooks';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { HomeWorkoutCard } from '@/dance/home';
import { LevelSuggestionCard, StrengthSessions, StyleCarousel, WorkoutCard } from '@/dance/ui';
import { IconChoice, Disclosure, IconBadge, SectionTitle, type IconName } from '@/ui/kit';
import { Ionicons } from '@expo/vector-icons';
import { t, type StringKey } from '@/i18n';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { MovementCard, RecoveryCard, StrengthContentCard } from '@/wellness/trackers';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Reveal, usePressScale } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';
import {
  clearSnapshot,
  deviceSnapshotStore,
  readSnapshot,
  type SessionSnapshot,
} from '@/dance/resume';

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
  const { profile } = useApp();
  const prefs = useLoad(async (st) => (await st.getWellnessPrefs?.()) ?? null);
  const [style, setStyle] = useState<DanceStyle | 'all'>('all');
  const [level, setLevel] = useState<Level | 'any'>('any');
  const [intensity, setIntensity] = useState<Intensity | 'any'>('any');
  const [duration, setDuration] = useState<'any' | '5' | '10' | '15' | '20'>('any');
  const [lowOnly, setLowOnly] = useState(false);
  const [seatedOnly, setSeatedOnly] = useState(false);
  // Voluntary and temporary: never stored, never inferred.
  const [mood, setMood] = useState<Mood | 'none'>('none');
  const [moodSeed, setMoodSeed] = useState(0);
  const moodPicks = useMemo(
    () =>
      mood === 'none'
        ? []
        : recommendByMood(mood, { lowImpactOnly: dance.lowImpactDefault, seed: moodSeed }),
    [mood, moodSeed, dance.lowImpactDefault],
  );
  // The next-level idea comes only from the person's own sessions (never from anyone else's), and keeps low impact when they asked for it.
  const suggestion = useMemo(() => {
    const p = parsePrefs(prefs.data);
    return levelSuggestion({
      sessions: dance.sessions,
      now: new Date(),
      timeZone: profile?.timeZone ?? null,
      keepLowImpact: p.mobility.length > 0 || dance.lowImpactDefault,
    });
  }, [dance.sessions, dance.lowImpactDefault, prefs.data, profile?.timeZone]);
  const [pending, setPending] = useState<SessionSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void readSnapshot(deviceSnapshotStore).then((p) => alive && setPending(p));
    return () => {
      alive = false;
    };
  }, []);
  const pendingWorkout = pending ? WORKOUT_BY_ID.get(pending.workoutId) : undefined;

  const results = useMemo(
    () =>
      filterWorkouts({
        styles: style === 'all' ? undefined : [style],
        levels: level === 'any' ? undefined : [level],
        intensities: intensity === 'any' ? undefined : [intensity],
        minutes:
          duration === 'any' ? undefined : duration === '20' ? [20, 30, 45] : [Number(duration)],
        lowImpactOnly: lowOnly || undefined,
        seatedOnly: seatedOnly || undefined,
      }),
    [style, level, intensity, duration, lowOnly, seatedOnly],
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

  const MOOD_ICON: Record<Mood, IconName> = {
    energized: 'flash',
    tired: 'moon',
    stressed: 'water',
    happy: 'sunny',
    motivation: 'rocket',
  };
  const filterSummary = [
    level === 'any'
      ? `${t('dance.any')} ${t('dance.level').toLowerCase()}`
      : t(`level.${level}` as StringKey),
    intensity === 'any'
      ? `${t('dance.any')} ${t('dance.intensity').toLowerCase()}`
      : t(`intensity.${intensity}` as StringKey),
    duration === 'any'
      ? `${t('dance.any')} ${t('dance.duration').toLowerCase()}`
      : duration === '20'
        ? '20+ min'
        : `${duration} min`,
    ...(lowOnly ? [t('dance.lowImpactOnly')] : []),
  ].join(' · ');

  return (
    <Screen title={t('tabs.dance')}>
      <Reveal>
        <HeroCard world="dance">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="title" accessibilityRole="header" style={{ color: colors.onHero }}>
                {t('dance.heroTitle')}
              </AppText>
              <AppText style={{ color: colors.onHero }}>{t('dance.heroBody')}</AppText>
            </View>
            <CharacterStage size={112} state="dance" />
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

      {pending && pendingWorkout ? (
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconBadge name="play" size={40} fill={colors.onPrimary} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText
                variant="label"
                accessibilityRole="header"
                style={{ color: colors.onPrimary }}
              >
                {t('dance.resumeTitle')}
              </AppText>
              <AppText variant="caption" style={{ color: colors.onPrimary }}>
                {t('dance.resumeBody', { title: pendingWorkout.title })}
              </AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dance.resume')}
              onPress={() =>
                router.push({
                  pathname: '/dance/session',
                  params: {
                    id: pending.workoutId,
                    low: pending.lowImpact ? '1' : '0',
                    ...(pending.sessionId ? { sessionId: pending.sessionId } : {}),
                  },
                })
              }
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.pill,
                backgroundColor: colors.onPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="label" style={{ color: colors.primary }}>
                {t('dance.resume')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dance.resumeDiscard')}
              onPress={async () => {
                await clearSnapshot(deviceSnapshotStore);
                setPending(null);
              }}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md }}
            >
              <AppText variant="label" style={{ color: colors.onPrimary }}>
                {t('dance.resumeDiscard')}
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(
          [
            { icon: 'dice', label: t('dance.surprise'), go: surprise },
            {
              icon: 'calendar',
              label: t('dance.schedule'),
              go: () => router.push('/dance/schedule'),
            },
            {
              icon: 'stats-chart',
              label: t('dance.activity'),
              go: () => router.push('/dance/history'),
            },
          ] as Array<{ icon: IconName; label: string; go: () => void }>
        ).map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => {
              haptics.tap();
              a.go();
            }}
            style={{
              flex: 1,
              minHeight: 84,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              padding: spacing.sm,
            }}
          >
            <IconBadge name={a.icon} size={36} fill={colors.primary} color={colors.onPrimary} />
            <AppText variant="caption" style={{ fontWeight: '600', textAlign: 'center' }}>
              {a.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <DepthCard>
        <SectionTitle icon="happy" title={t('mood.title')} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
        >
          <IconChoice
            icon="remove-circle"
            label={t('mood.skip')}
            selected={mood === 'none'}
            onPress={() => {
              setMood('none');
              setMoodSeed(0);
            }}
          />
          {MOODS.map((m) => (
            <IconChoice
              key={m}
              icon={MOOD_ICON[m]}
              label={t(`mood.${m}` as StringKey)}
              selected={mood === m}
              tint={brand.lime}
              onPress={() => {
                setMood(m);
                setMoodSeed(0);
              }}
            />
          ))}
        </ScrollView>
        {mood === 'none' ? (
          <AppText variant="caption" muted>
            {t('mood.hint')}
          </AppText>
        ) : moodPicks.length === 0 ? (
          <Notice>{t('mood.none')}</Notice>
        ) : (
          <>
            <AppText variant="caption" muted accessibilityLiveRegion="polite">
              {t('mood.intro')}
            </AppText>
            {moodPicks.map((p) => (
              <View key={p.workout.id} style={{ gap: spacing.xs }}>
                <WorkoutCard
                  w={p.workout}
                  onPress={() =>
                    router.push({ pathname: '/dance/[id]', params: { id: p.workout.id } })
                  }
                />
                <View
                  style={{ flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.xs }}
                >
                  <Ionicons name="information-circle" size={16} color={colors.textMuted} />
                  <AppText variant="caption" muted style={{ flex: 1 }}>
                    {p.why}
                  </AppText>
                </View>
              </View>
            ))}
            <Button
              variant="secondary"
              label={t('mood.more')}
              onPress={() => setMoodSeed((n) => n + 1)}
            />
          </>
        )}
      </DepthCard>

      <MovementCard />
      <LevelSuggestionCard suggestion={suggestion} onSee={setLevel} />
      <StrengthSessions />
      <HomeWorkoutCard />
      <StrengthContentCard />
      <RecoveryCard />

      <Reveal delay={60}>
        <SectionTitle icon="color-palette" title={t('dance.styles')} />
        <StyleCarousel value={style} onChange={setStyle} styles={DANCE_STYLES} />
      </Reveal>

      <Disclosure title={t('dance.filters')} summary={filterSummary}>
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
        {WORKOUTS.some(isSeatedSuitable) ? (
          <Choice
            label={t('dance.seatedOnlyBody')}
            value={seatedOnly ? 'yes' : 'no'}
            onChange={(v) => setSeatedOnly(v === 'yes')}
            options={[
              { value: 'no', label: t('dance.any') },
              { value: 'yes', label: t('dance.seatedOnly') },
            ]}
          />
        ) : null}
      </Disclosure>

      <SectionTitle icon="musical-notes" title={`${t('dance.browse')} (${results.length})`} />
      {results.length === 0 ? <Notice>{t('dance.noResults')}</Notice> : null}
      {results.map((w, i) => (
        <Reveal key={w.id} delay={Math.min(i, 6) * 40}>
          <WorkoutCard
            w={w}
            onPress={() => router.push({ pathname: '/dance/[id]', params: { id: w.id } })}
          />
        </Reveal>
      ))}

      <SectionTitle icon="trail-sign" title={t('dance.programs')} />
      {PROGRAMS.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={p.title}
          onPress={() => router.push({ pathname: '/dance/program', params: { id: p.id } })}
        >
          <LinearGradient
            colors={[colors.heroFrom, colors.heroTo]}
            style={{
              borderRadius: radius.lg,
              padding: spacing.lg,
              gap: spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <IconBadge name="trail-sign" size={52} fill={brand.lime} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="heading" style={{ color: colors.onHero }}>
                {p.title}
              </AppText>
              <AppText variant="caption" style={{ color: colors.onHero }}>
                {`${p.weeks} weeks · ${p.sessionsPerWeek} sessions a week · ${t(`level.${p.level}` as StringKey)}`}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.onHero} />
          </LinearGradient>
        </Pressable>
      ))}
      <Notice>{t('dance.sampleNotice')}</Notice>
      <AppText variant="caption" muted>
        {WORKOUT_DATA_NOTICE}
      </AppText>
    </Screen>
  );
}
