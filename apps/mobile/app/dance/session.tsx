import { useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Switch, View } from 'react-native';
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
import { EFFORT_CHOICES, STYLE_META, mmss } from '@/dance/meta';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { useDanceData } from '@/dance/hooks';
import { PulseStage } from '@/pulse/PulseStage';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Ring } from '@/ui/motion';
import { ProgressBar } from '@/ui/ProgressBar';
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
  const meta = STYLE_META[workout.style];
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

  if (s.status === 'finished') {
    const m = Math.floor(s.elapsedS / 60);
    return (
      <Screen top={false}>
        <HeroCard world="dance" style={{ alignItems: 'center' }}>
          <CharacterStage size={120} state="celebrate" />
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
          {saved ? (
            <AppText
              variant="label"
              style={{ color: colors.onHero }}
              accessibilityLiveRegion="polite"
            >
              {t('ses.weekCount', { n: dance.summary.thisWeek.sessions })}
            </AppText>
          ) : null}
        </HeroCard>
        <DepthCard>
          {s.elapsedS < 1 ? (
            <Notice>{t('ses.nothing')}</Notice>
          ) : saved ? (
            <Notice>{t('ses.saved')}</Notice>
          ) : (
            <>
              <Choice
                label={t('ses.effort')}
                value={effort}
                onChange={setEffort}
                options={EFFORT_CHOICES.map((e) => ({
                  value: e.key,
                  label: t(`ses.effort.${e.key}` as StringKey),
                }))}
              />
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

  return (
    <Screen top={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText
            variant="caption"
            muted
            accessibilityLiveRegion="polite"
          >{`${workout.title} · ${t('ses.block', { n: s.index + 1, total: s.segments.length })} · ${t(`wk.${seg.kind}` as StringKey)}`}</AppText>
        </View>
        <View style={{ width: 72, height: 66, overflow: 'hidden' }}>
          <PulseStage state={s.status === 'running' ? 'dance' : 'idle'} size={72} />
        </View>
      </View>
      <ProgressBar
        fraction={overall}
        label={t('ses.progress', {
          n: s.index + 1,
          total: s.segments.length,
          pct: Math.round(overall * 100),
        })}
      />
      {restored && s.status === 'paused' ? <Notice>{t('ses.restored')}</Notice> : null}
      <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        <Ring
          size={220}
          stroke={16}
          fraction={fraction}
          color={meta.from === '#1F1633' ? colors.primary : meta.from}
          track={colors.border}
        >
          <View
            style={{ alignItems: 'center' }}
            accessible
            accessibilityLabel={`${mmss(s.remainingS)} ${t('ses.left')}`}
          >
            <AppText variant="title" style={{ fontSize: 44, lineHeight: 52 }}>
              {mmss(s.remainingS)}
            </AppText>
            <AppText variant="caption" muted>
              {t('ses.left')}
            </AppText>
          </View>
        </Ring>
      </View>
      <DepthCard>
        <AppText variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
          {seg.title}
        </AppText>
        <AppText style={{ fontSize: 18, lineHeight: 26 }}>{seg.cue}</AppText>
        {next ? (
          <AppText variant="caption" muted>
            {t('ses.next', { title: next.title })}
          </AppText>
        ) : null}
      </DepthCard>
      <View style={{ gap: spacing.sm }}>
        {s.status === 'ready' ? (
          <Button
            label={t('ses.start')}
            onPress={() => {
              haptics.capture();
              dispatch({ type: 'start' });
            }}
          />
        ) : null}
        {s.status === 'running' ? (
          <Button label={t('ses.pause')} onPress={() => dispatch({ type: 'pause' })} />
        ) : null}
        {s.status === 'paused' ? (
          <Button label={t('ses.resume')} onPress={() => dispatch({ type: 'resume' })} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label={t('ses.back')}
              disabled={s.index === 0}
              onPress={() => dispatch({ type: 'back' })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label={t('ses.skip')}
              onPress={() => dispatch({ type: 'skip' })}
            />
          </View>
        </View>
      </View>
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
