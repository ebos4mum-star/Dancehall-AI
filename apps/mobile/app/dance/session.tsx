import { useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HeroScene } from '@/scene/HeroScene';
import { IconBadge, IconChoice, InfoTile, SegmentedBar } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import {
  WORKOUT_BY_ID,
  initSession,
  sessionReduce,
  type SessionEvent,
  type SessionState,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { EFFORT_CHOICES, mmss } from '@/dance/meta';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { useDanceData } from '@/dance/hooks';
import { PulseStage } from '@/pulse/PulseStage';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Ring } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';
import { once } from '@/dance/once';
import {
  clearSnapshot,
  deviceSnapshotStore,
  readSnapshot,
  restoreSession,
  snapshotOf,
  writeSnapshot,
} from '@/dance/resume';

type Wrapped = { s: SessionState; changes: number };
const reducer = (
  w: Wrapped,
  e: SessionEvent | { type: 'restore'; state: SessionState },
): Wrapped => {
  if (e.type === 'restore') return { s: e.state, changes: w.changes };
  const r = sessionReduce(w.s, e);
  return { s: r.state, changes: w.changes + (r.segmentChanged ? 1 : 0) };
};

export default function Session() {
  const { id, low, sessionId } = useLocalSearchParams<{
    id: string;
    low?: string;
    sessionId?: string;
  }>();
  const workout = WORKOUT_BY_ID.get(String(id));
  const { store } = useApp();
  const { colors } = useTheme();
  const dance = useDanceData();
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    s: initSession(workout ?? { id: '', blocks: [] }, low === '1'),
    changes: 0,
  }));
  const [effort, setEffort] = useState<string>('moderate');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  const s = state.s;
  // One guarded save per session screen: a double tap or a retry after success can never record the workout twice.
  const saver = useRef(once(async (fn: () => Promise<void>) => fn())).current;

  // Recover an interrupted session of this same workout (always comes back paused; no time is added).
  useEffect(() => {
    if (!workout) return;
    let alive = true;
    void readSnapshot(deviceSnapshotStore).then((snap) => {
      if (!alive || !snap || snap.workoutId !== workout.id) return;
      const r = restoreSession(snap, workout);
      if (!r) return void clearSnapshot(deviceSnapshotStore);
      dispatch({ type: 'restore', state: r });
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [workout]);

  // Keep a recovery point while the session is under way; remove it once saved or discarded.
  useEffect(() => {
    if (!workout || saved) return;
    if (s.status === 'paused' || s.status === 'running') {
      if (s.elapsedS % 5 === 0 || s.status === 'paused')
        void writeSnapshot(
          deviceSnapshotStore,
          snapshotOf(s, sessionId ? String(sessionId) : null),
        );
    }
  }, [s, saved, workout, sessionId]);

  // Leaving the app pauses the workout, so time away is never counted as exercise.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') dispatch({ type: 'pause' });
    });
    return () => sub.remove();
  }, []);

  // One tick per second while running.
  useEffect(() => {
    if (s.status !== 'running') return;
    const h = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(h);
  }, [s.status]);

  // A short, meaningful buzz when the block changes and when the workout ends.
  const lastChanges = useRef(0);
  useEffect(() => {
    if (state.changes === lastChanges.current) return;
    lastChanges.current = state.changes;
    if (s.status === 'finished') haptics.success();
    else haptics.capture();
  }, [state.changes, s.status]);

  if (!workout || workout.blocks.length === 0) {
    return (
      <Screen top={false}>
        <Notice>{t('wk.notFound')}</Notice>
      </Screen>
    );
  }
  const seg = s.segments[s.index]!;
  const next = s.segments[s.index + 1];
  const fraction = seg.seconds > 0 ? 1 - s.remainingS / seg.seconds : 1;
  const totalS = s.segments.reduce((a, g) => a + g.seconds, 0);
  const doneS =
    s.segments.slice(0, s.index).reduce((a, g) => a + g.seconds, 0) + (seg.seconds - s.remainingS);
  const overall = totalS > 0 ? doneS / totalS : 0;

  const save = async () => {
    setErr(null);
    const rpe = EFFORT_CHOICES.find((e) => e.key === effort)?.value ?? 5;
    try {
      await saver.run(async () => {
        if (sessionId)
          await store.updateSession(String(sessionId), {
            status: 'completed',
            durationS: s.elapsedS,
            perceivedExertion: rpe,
            lowImpact: s.lowImpact,
          });
        else
          await store.createSession({
            workoutId: workout.id,
            title: workout.title,
            style: workout.style,
            minutes: workout.minutes,
            status: 'completed',
            durationS: s.elapsedS,
            perceivedExertion: rpe,
            lowImpact: s.lowImpact,
            source: 'manual',
          });
      });
      await clearSnapshot(deviceSnapshotStore);
      haptics.celebrate();
      setSaved(true);
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    }
  };

  const KIND_TINT = { warmup: brand.coral, main: brand.violet, cooldown: brand.lime } as const;
  const EFFORT_ICON = { easy: 'leaf', moderate: 'walk', hard: 'flame', veryHard: 'flash' } as const;

  if (s.status === 'finished') {
    const m = Math.floor(s.elapsedS / 60);
    const blocksDone = s.index + (s.status === 'finished' && s.remainingS === 0 ? 1 : 0);
    return (
      <Screen key="finished" top={false}>
        <HeroCard world="dance" style={{ alignItems: 'center' }}>
          <CharacterStage size={132} state="celebrate" />
          <AppText
            variant="title"
            accessibilityRole="header"
            style={{ color: colors.onHero, textAlign: 'center' }}
          >
            {t('ses.done')}
          </AppText>
          <AppText style={{ color: colors.onHero, textAlign: 'center' }}>
            {t('ses.doneBody', { m, s: s.elapsedS % 60 })}
          </AppText>
        </HeroCard>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <InfoTile icon="time" label={t('ses.statTime')} value={mmss(s.elapsedS)} />
          <InfoTile
            icon="layers"
            label={t('ses.statBlocks')}
            value={`${Math.min(blocksDone, s.segments.length)}/${s.segments.length}`}
          />
          {saved ? (
            <InfoTile
              icon="calendar"
              label={t('ses.statWeek')}
              value={String(dance.summary.thisWeek.sessions)}
            />
          ) : null}
        </View>
        <DepthCard>
          {s.elapsedS < 1 ? (
            <Notice>{t('ses.nothing')}</Notice>
          ) : saved ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
            >
              <IconBadge name="checkmark" size={36} fill={colors.success} color="#FFFFFF" />
              <AppText variant="label" style={{ flex: 1 }}>
                {t('ses.saved')}
              </AppText>
            </View>
          ) : (
            <>
              <AppText variant="heading" accessibilityRole="header">
                {t('ses.effort')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {EFFORT_CHOICES.map((e) => (
                  <IconChoice
                    key={e.key}
                    icon={EFFORT_ICON[e.key]}
                    label={t(`ses.effort.${e.key}` as StringKey)}
                    selected={effort === e.key}
                    onPress={() => setEffort(e.key)}
                    tint={brand.lime}
                  />
                ))}
              </View>
              <Button label={t('ses.save')} onPress={save} />
            </>
          )}
          {err ? <Notice tone="warning">{err}</Notice> : null}
          <Button
            variant="secondary"
            label={saved ? t('common.continue') : t('ses.discard')}
            onPress={async () => {
              if (!saved) await clearSnapshot(deviceSnapshotStore);
              router.replace('/(tabs)/dance');
            }}
          />
        </DepthCard>
      </Screen>
    );
  }

  const barSegments = s.segments.map((g, i) => ({
    weight: g.seconds,
    fill: i < s.index ? 1 : i === s.index ? fraction : 0,
    tint: KIND_TINT[g.kind],
  }));
  const circle = (
    icon: 'play-back' | 'play-forward',
    label: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
  return (
    <Screen top={false}>
      <HeroScene world="dance" height={376}>
        <View
          style={{ position: 'absolute', top: spacing.md, left: spacing.lg, right: spacing.lg }}
        >
          <AppText
            variant="caption"
            style={{ color: brand.ivory, opacity: 0.9 }}
            accessibilityLiveRegion="polite"
          >
            {`${workout.title} · ${t('ses.block', { n: s.index + 1, total: s.segments.length })}`}
          </AppText>
          <AppText
            variant="label"
            style={{
              color: KIND_TINT[seg.kind] === brand.violet ? brand.ivory : KIND_TINT[seg.kind],
            }}
          >
            {t(`wk.${seg.kind}` as StringKey).toUpperCase()}
          </AppText>
        </View>
        <View style={{ position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center' }}>
          <Ring
            size={232}
            stroke={16}
            fraction={fraction}
            color={KIND_TINT[seg.kind]}
            track="rgba(247,244,238,0.18)"
          >
            <View
              style={{ alignItems: 'center' }}
              accessible
              accessibilityLabel={`${mmss(s.remainingS)} ${t('ses.left')}`}
            >
              <AppText variant="title" style={{ fontSize: 50, lineHeight: 56, color: brand.ivory }}>
                {mmss(s.remainingS)}
              </AppText>
              <AppText variant="caption" style={{ color: brand.ivory, opacity: 0.85 }}>
                {t('ses.left')}
              </AppText>
            </View>
          </Ring>
        </View>
        <View style={{ position: 'absolute', right: 4, bottom: 18 }}>
          <PulseStage state={s.status === 'running' ? 'dance' : 'idle'} size={104} />
        </View>
        {restored && s.status === 'paused' ? (
          <View
            style={{ position: 'absolute', left: spacing.md, bottom: spacing.md, maxWidth: '58%' }}
          >
            <AppText variant="caption" style={{ color: brand.ivory }}>
              {t('ses.restored')}
            </AppText>
          </View>
        ) : null}
      </HeroScene>

      <SegmentedBar
        segments={barSegments}
        label={t('ses.progress', {
          n: s.index + 1,
          total: s.segments.length,
          pct: Math.round(overall * 100),
        })}
      />

      <DepthCard>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <IconBadge name="walk" size={36} fill={KIND_TINT[seg.kind]} />
          <AppText
            variant="heading"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={{ flex: 1 }}
          >
            {seg.title}
          </AppText>
        </View>
        <AppText style={{ fontSize: 18, lineHeight: 26 }}>{seg.cue}</AppText>
        {next ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Ionicons name="arrow-forward-circle" size={18} color={colors.textMuted} />
            <AppText variant="caption" muted>
              {t('ses.next', { title: next.title })}
            </AppText>
          </View>
        ) : null}
      </DepthCard>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.lg,
        }}
      >
        {circle('play-back', t('ses.back'), () => dispatch({ type: 'back' }), s.index === 0)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            s.status === 'ready'
              ? t('ses.start')
              : s.status === 'running'
                ? t('ses.pause')
                : t('ses.resume')
          }
          onPress={() => {
            if (s.status === 'ready') {
              haptics.capture();
              dispatch({ type: 'start' });
            } else if (s.status === 'running') dispatch({ type: 'pause' });
            else dispatch({ type: 'resume' });
          }}
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: brand.lime,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: brand.lime,
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <Ionicons name={s.status === 'running' ? 'pause' : 'play'} size={38} color={brand.plum} />
        </Pressable>
        {circle('play-forward', t('ses.skip'), () => dispatch({ type: 'skip' }))}
      </View>
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {s.status === 'ready'
          ? t('ses.start')
          : s.status === 'running'
            ? t('ses.pause')
            : t('ses.resume')}
      </AppText>

      <DepthCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconBadge name="leaf" size={32} fill={brand.lime} />
          <AppText variant="label" style={{ flex: 1 }}>
            {t('wk.lowImpact')}
          </AppText>
          <Switch
            accessibilityLabel={t('wk.lowImpact')}
            value={s.lowImpact}
            onValueChange={(v) => {
              haptics.tap();
              dispatch({ type: 'lowImpact', value: v });
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </DepthCard>
      <Button
        variant="secondary"
        label={t('ses.endEarly')}
        onPress={() => dispatch({ type: 'finish' })}
      />
    </Screen>
  );
}
