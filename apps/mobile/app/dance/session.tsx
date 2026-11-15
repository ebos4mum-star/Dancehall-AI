import { withAccount } from '@/account/gate';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HeroScene } from '@/scene/HeroScene';
import { Disclosure, IconBadge, IconChoice, InfoTile, SegmentedBar } from '@/ui/kit';
import { brand, radius, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import {
  INSTRUCTORS,
  completionSummary,
  movementId,
  resolvePresentation,
  strengthEntryLabel,
  type Presentation,
} from '@dancehall/shared';
import { DemoPanel, hasDemo } from '@/demo/DemoPlayer';
import { previewBanner } from '@/dance/preview';
import { resolveContent } from '@/dance/content';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { EFFORT_CHOICES, mmss } from '@/dance/meta';
import { t, type StringKey } from '@/i18n';
import { todayIso } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { useDanceData } from '@/dance/hooks';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { PulseStage } from '@/pulse/PulseStage';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Ring } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';
import { once } from '@/dance/once';
import { clearSnapshot, deviceSnapshotStore } from '@/dance/resume';
import { usePlayer } from '@/player/usePlayer';
import { INSTRUCTION_LICENCES, INSTRUCTION_TRACKS, stageRendererFor } from '@/player/catalog';
import { AudioPanel, MovementPreview, PresentationPicker } from '@/player/ui';

function Session() {
  const { id, low, sessionId, seated } = useLocalSearchParams<{
    id: string;
    low?: string;
    sessionId?: string;
    seated?: string;
  }>();
  // A dance workout or a strength workout (strength is returned only while it passes the review gate, or as an internal fixture in development).
  // Resolved once per id: the player's effects depend on this object, so a new object on every render would restart them in a loop.
  const workout = useMemo(() => resolveContent(String(id)), [id]);
  const strength = workout?.kind === 'strength';
  const { store, profile } = useApp();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const dance = useDanceData();
  const { r, dispatch, restored, audio, updateAudio, voiceAvailable } = usePlayer(
    workout,
    low === '1',
    sessionId ? String(sessionId) : null,
    seated === '1',
  );
  const [effort, setEffort] = useState<string>('moderate');
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [requested, setRequested] = useState<Presentation>('guided_text');
  const s = r.session;
  // One guarded save per session screen: a double tap or a retry after success can never record the workout twice.
  const saver = useRef(once(async (fn: () => Promise<void>) => fn())).current;
  // A track with no renderer registered cannot play, so it is reported as unable to load rather than offered.
  const missing = useMemo(
    () =>
      new Set(
        INSTRUCTION_TRACKS.filter((tr) => !stageRendererFor(tr.presentation)).map((tr) => tr.id),
      ),
    [],
  );
  const resolution = useMemo(
    () =>
      resolvePresentation({
        workout: workout ?? { id: '', blocks: [] },
        tracks: INSTRUCTION_TRACKS,
        licences: INSTRUCTION_LICENCES,
        country: profile?.country ?? null,
        today: todayIso(),
        lowImpact: s.lowImpact,
        requested,
        missing,
      }),
    [workout, profile?.country, s.lowImpact, requested, missing],
  );

  if (!workout || workout.blocks.length === 0) {
    return (
      <Screen top={false}>
        <Notice>{t('wk.notFound')}</Notice>
      </Screen>
    );
  }
  const seg = s.segments[s.index]!;
  // A strength set shows its exercise; a dance block shows the movement at that position of the workout.
  const demoSubject = seg.exerciseId ?? movementId(workout.id, s.index);
  const next = s.segments[s.index + 1];
  const fraction = seg.manual ? 1 : seg.seconds > 0 ? 1 - s.remainingS / seg.seconds : 1;
  const totalS = s.segments.reduce((a, g) => a + g.seconds, 0);
  const doneS =
    s.segments.slice(0, s.index).reduce((a, g) => a + g.seconds, 0) + (seg.seconds - s.remainingS);
  const overall = totalS > 0 ? doneS / totalS : 0;
  const summary = completionSummary(r);
  const instructor = INSTRUCTORS.find((i) => i.id === workout.instructorId);

  const save = async () => {
    setErr(null);
    const rpe = EFFORT_CHOICES.find((e) => e.key === effort)?.value ?? 5;
    try {
      await saver.run(async () => {
        if (workout.kind === 'strength') {
          // Strength is recorded with the existing strength entry (minutes and equipment), so the plan, challenges and Pulse already count it.
          await store.addWellness?.({
            kind: 'strength',
            day: todayIso(),
            amount: Math.max(1, Math.round(s.elapsedS / 60)),
            label: strengthEntryLabel(workout.strength!),
            clientKey: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          });
        } else if (sessionId)
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
            style: workout.style ?? undefined,
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

  const KIND_TINT = {
    warmup: brand.coral,
    main: brand.violet,
    cooldown: brand.lime,
    rest: '#B9B2C9',
  } as const;
  const EFFORT_ICON = { easy: 'leaf', moderate: 'walk', hard: 'flame', veryHard: 'flash' } as const;

  // ---- After the session -------------------------------------------------------------------------------------------------------
  if (s.status === 'finished') {
    const m = Math.floor(s.elapsedS / 60);
    return (
      <Screen key="finished" top={false}>
        <HeroCard world="dance" style={{ alignItems: 'center' }}>
          <CharacterStage
            size={132}
            state={summary.finishedNaturally ? 'celebrate' : 'encourage'}
          />
          <AppText
            variant="title"
            accessibilityRole="header"
            style={{ color: colors.onHero, textAlign: 'center' }}
          >
            {summary.finishedNaturally ? t('ses.done') : t('pl.endedTitle')}
          </AppText>
          <AppText style={{ color: colors.onHero, textAlign: 'center' }}>
            {t('ses.doneBody', { m, s: s.elapsedS % 60 })}
          </AppText>
        </HeroCard>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <InfoTile icon="time" label={t('ses.statTime')} value={mmss(s.elapsedS)} />
          <InfoTile
            icon="layers"
            label={t('pl.stepsDone')}
            value={`${summary.segmentsCompleted}/${summary.segmentsTotal}`}
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
          {!summary.recordable ? (
            <Notice>{t('ses.nothing')}</Notice>
          ) : saved ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
            >
              <IconBadge name="checkmark" size={36} fill={colors.success} color="#FFFFFF" />
              <AppText variant="label" style={{ flex: 1 }}>
                {strength ? t('st.saved') : t('ses.saved')}
              </AppText>
            </View>
          ) : (
            <>
              {!summary.finishedNaturally ? <Notice>{t('pl.endedEarly')}</Notice> : null}
              {!strength ? (
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
                </>
              ) : null}
              <Button
                label={summary.finishedNaturally ? t('ses.save') : t('pl.saveEarly')}
                onPress={save}
              />
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

  // ---- Before the session ------------------------------------------------------------------------------------------------------
  if (r.phase === 'ready') {
    return (
      <Screen top={false}>
        <HeroScene world="dance" height={230}>
          <View style={{ position: 'absolute', left: spacing.lg, right: 120, top: spacing.lg }}>
            <AppText
              variant="caption"
              style={{ color: brand.lime, fontWeight: '700', letterSpacing: 1.2 }}
            >
              {(workout.style
                ? t(`style.${workout.style}` as StringKey)
                : t('st.kind')
              ).toUpperCase()}
            </AppText>
            <AppText variant="title" accessibilityRole="header" style={{ color: brand.ivory }}>
              {workout.title}
            </AppText>
            <AppText style={{ color: brand.ivory, marginTop: spacing.xs }} numberOfLines={3}>
              {workout.summary}
            </AppText>
          </View>
          <View style={{ position: 'absolute', right: -8, bottom: 6 }}>
            <PulseStage state="welcome" size={112} />
          </View>
        </HeroScene>
        {previewBanner(workout) ? <Notice tone="warning">{previewBanner(workout)!}</Notice> : null}
        {restored ? <Notice>{t('ses.restored')}</Notice> : null}
        <DepthCard>
          {[
            ['time', t('pl.facts.time'), t('dance.minutes', { n: workout.minutes })],
            ['trending-up', t('pl.facts.level'), t(`level.${workout.level}` as StringKey)],
            workout.impact
              ? ['footsteps', t('pl.facts.impact'), t(`impact.${workout.impact}` as StringKey)]
              : [
                  'layers',
                  t('st.setsTotal'),
                  String(workout.blocks.filter((b) => b.kind === 'main').length),
                ],
            ['fitness', t('pl.facts.kit'), workout.equipment],
            [
              'person',
              t('pl.facts.guide'),
              instructor ? instructor.displayName : t('pl.guideText'),
            ],
          ].map(([icon, label, value]) => (
            <View
              key={label}
              accessible
              accessibilityLabel={`${label}: ${value}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <IconBadge name={icon as 'time'} size={32} fill={brand.violet} />
              <AppText variant="caption" muted style={{ width: 64 }}>
                {label}
              </AppText>
              <AppText variant="label" style={{ flex: 1 }}>
                {value}
              </AppText>
            </View>
          ))}
        </DepthCard>
        <Button label={t('ses.start')} onPress={() => dispatch({ type: 'begin' })} />
        <AppText variant="heading" accessibilityRole="header">
          {t('pl.presentation')}
        </AppText>
        <DepthCard>
          <PresentationPicker resolution={resolution} onPick={setRequested} />
        </DepthCard>
        <Disclosure
          title={strength ? t('st.easier') : t('wk.lowImpact')}
          summary={s.lowImpact ? t('pl.on') : t('pl.off')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconBadge name="leaf" size={32} fill={brand.lime} />
            <AppText variant="label" style={{ flex: 1 }}>
              {strength ? t('st.easier') : t('wk.lowImpact')}
            </AppText>
            <Button
              variant="secondary"
              label={s.lowImpact ? t('pl.turnOff') : t('pl.turnOn')}
              onPress={() => dispatch({ type: 'lowImpact', value: !s.lowImpact })}
            />
          </View>
          <AppText variant="caption" muted>
            {strength ? t('st.easierBody') : t('wk.lowImpactBody')}
          </AppText>
        </Disclosure>
        {workout.seatedSuitable && !workout.seatedOnly ? (
          <Disclosure title={t('wk.seated')} summary={s.seated ? t('pl.on') : t('pl.off')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge name="accessibility" size={32} fill={brand.lime} />
              <AppText variant="label" style={{ flex: 1 }}>
                {t('wk.seated')}
              </AppText>
              <Button
                variant="secondary"
                label={s.seated ? t('pl.turnOff') : t('pl.turnOn')}
                onPress={() => dispatch({ type: 'seated', value: !s.seated })}
              />
            </View>
            <AppText variant="caption" muted>
              {t('wk.seatedBody')}
            </AppText>
          </Disclosure>
        ) : null}
        <AppText variant="heading" accessibilityRole="header">
          {t('pl.preview')}
        </AppText>
        <DepthCard>
          <MovementPreview w={workout} lowImpact={s.lowImpact} />
        </DepthCard>
        {workout.safety.length > 0 ? (
          <Disclosure title={t('wk.safety')} initiallyOpen>
            {workout.safety.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Ionicons name="shield-checkmark" size={18} color={colors.success} />
                <AppText variant="caption" style={{ flex: 1 }}>
                  {x}
                </AppText>
              </View>
            ))}
          </Disclosure>
        ) : null}
        <Disclosure title={t('pl.audio')}>
          <AudioPanel audio={audio} onChange={updateAudio} voiceAvailable={voiceAvailable} />
        </Disclosure>
      </Screen>
    );
  }

  // ---- Preparation countdown ---------------------------------------------------------------------------------------------------
  if (r.phase === 'prep') {
    return (
      <Screen top={false}>
        <HeroScene world="dance" height={400}>
          <View
            style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, right: spacing.lg }}
          >
            <AppText variant="label" style={{ color: brand.ivory }}>
              {workout.title}
            </AppText>
          </View>
          <View style={{ position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center' }}>
            <View
              accessible
              accessibilityLiveRegion="assertive"
              accessibilityLabel={`${t('pl.getReady')} ${r.prepS}`}
              style={{ alignItems: 'center' }}
            >
              <AppText
                variant="caption"
                style={{ color: brand.lime, fontWeight: '700', letterSpacing: 1.2 }}
              >
                {t('pl.getReady').toUpperCase()}
              </AppText>
              <AppText
                variant="title"
                style={{ fontSize: 120, lineHeight: 132, color: brand.ivory }}
              >
                {String(r.prepS)}
              </AppText>
              <AppText
                style={{ color: brand.ivory, textAlign: 'center', paddingHorizontal: spacing.lg }}
              >
                {seg.title}
              </AppText>
            </View>
          </View>
        </HeroScene>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Button
            label={r.prepPaused ? t('ses.resume') : t('ses.pause')}
            variant="secondary"
            onPress={() => dispatch({ type: r.prepPaused ? 'resume' : 'pause' })}
          />
          <Button
            variant="secondary"
            label={t('pl.skipPrep')}
            onPress={() => dispatch({ type: 'skipPrep' })}
          />
        </View>
      </Screen>
    );
  }

  // ---- During the session ------------------------------------------------------------------------------------------------------
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
  const Renderer =
    resolution.active !== 'guided_text' ? stageRendererFor(resolution.active) : undefined;
  const activeTrack = resolution.options.find((o) => o.kind === resolution.active)?.track;
  return (
    <Screen top={false}>
      <HeroScene world="dance" height={420}>
        {Renderer && activeTrack ? (
          <Renderer
            track={activeTrack}
            positionS={doneS}
            playing={s.status === 'running'}
            reducedMotion={reduced}
            onError={() => undefined}
          />
        ) : null}
        <View
          style={{ position: 'absolute', top: spacing.md, left: spacing.lg, right: spacing.lg }}
        >
          <AppText variant="caption" style={{ color: brand.ivory, opacity: 0.9 }}>
            {`${workout.title} · ${t('ses.block', { n: s.index + 1, total: s.segments.length })}`}
          </AppText>
          <AppText
            variant="label"
            style={{
              color: KIND_TINT[seg.kind] === brand.violet ? brand.ivory : KIND_TINT[seg.kind],
            }}
          >
            {s.status === 'paused'
              ? `${t('pl.paused').toUpperCase()} · ${t(`wk.${seg.kind}` as StringKey).toUpperCase()}`
              : t(`wk.${seg.kind}` as StringKey).toUpperCase()}
          </AppText>
        </View>
        <View style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center' }}>
          <Ring
            size={196}
            stroke={14}
            fraction={fraction}
            color={KIND_TINT[seg.kind]}
            track="rgba(247,244,238,0.18)"
          >
            <View
              style={{ alignItems: 'center' }}
              accessible
              accessibilityLabel={
                seg.manual
                  ? `${t('st.sets', { n: seg.setNumber ?? 1, total: seg.setsTotal ?? 1 })}, ${t('st.reps', { n: seg.reps ?? 0 })}`
                  : `${mmss(s.remainingS)} ${t('ses.left')}`
              }
            >
              {seg.manual ? (
                <>
                  <AppText
                    variant="title"
                    style={{ fontSize: 30, lineHeight: 36, color: brand.ivory }}
                  >
                    {t('st.sets', { n: seg.setNumber ?? 1, total: seg.setsTotal ?? 1 })}
                  </AppText>
                  <AppText variant="caption" style={{ color: brand.ivory, opacity: 0.85 }}>
                    {t('st.reps', { n: seg.reps ?? 0 })}
                  </AppText>
                </>
              ) : (
                <>
                  <AppText
                    variant="title"
                    style={{ fontSize: 46, lineHeight: 52, color: brand.ivory }}
                  >
                    {mmss(s.remainingS)}
                  </AppText>
                  <AppText variant="caption" style={{ color: brand.ivory, opacity: 0.85 }}>
                    {seg.setNumber
                      ? t('st.sets', { n: seg.setNumber, total: seg.setsTotal ?? 1 })
                      : t('ses.left')}
                  </AppText>
                </>
              )}
            </View>
          </Ring>
        </View>
        <View
          style={{
            position: 'absolute',
            left: spacing.md,
            right: 100,
            bottom: spacing.md,
            backgroundColor: 'rgba(36,20,61,0.82)',
            borderRadius: radius.md,
            padding: spacing.sm,
          }}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="heading" accessibilityRole="header" style={{ color: brand.ivory }}>
            {seg.title}
          </AppText>
          <AppText style={{ color: brand.ivory, fontSize: 17, lineHeight: 24 }} numberOfLines={4}>
            {seg.cue}
          </AppText>
        </View>
        <View style={{ position: 'absolute', right: -6, bottom: 6 }}>
          <PulseStage state={s.status === 'running' ? 'dance' : 'idle'} size={92} />
        </View>
        {!seg.manual && s.remainingS <= 3 && s.status === 'running' ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: spacing.lg, top: spacing.md }}
            accessibilityElementsHidden
          >
            <View
              style={{
                backgroundColor: brand.lime,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 2,
              }}
            >
              <AppText variant="label" style={{ color: brand.plum }}>
                {String(s.remainingS)}
              </AppText>
            </View>
          </View>
        ) : null}
      </HeroScene>

      {seg.exerciseId || hasDemo(demoSubject, profile?.country ?? null) ? (
        <DepthCard>
          <AppText variant="label" accessibilityRole="header">
            {t('home.howTo')}
          </AppText>
          <AppText variant="caption">{seg.cue}</AppText>
          <DemoPanel
            key={demoSubject}
            subjectId={demoSubject}
            hideWhenNone={!seg.exerciseId}
            seated={s.seated}
            easier={s.lowImpact}
          />
        </DepthCard>
      ) : null}

      <SegmentedBar
        segments={barSegments}
        label={t('ses.progress', {
          n: s.index + 1,
          total: s.segments.length,
          pct: Math.round(overall * 100),
        })}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Ionicons name="arrow-forward-circle" size={18} color={colors.textMuted} />
        <AppText variant="caption" muted style={{ flex: 1 }}>
          {next ? `${t('pl.upNext')}: ${next.title}` : t('pl.lastOne')}
        </AppText>
        <AppText variant="caption" muted>
          {t(`pl.active.${resolution.active}` as StringKey).split('.')[0]}
        </AppText>
      </View>

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
          accessibilityLabel={s.status === 'running' ? t('ses.pause') : t('ses.resume')}
          onPress={() => {
            haptics.tap();
            dispatch({ type: s.status === 'running' ? 'pause' : 'resume' });
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
        {s.status === 'running' ? t('ses.pause') : t('ses.resume')}
      </AppText>
      {seg.manual ? (
        <Button
          label={t('st.doneSet')}
          disabled={s.status !== 'running'}
          onPress={() => {
            haptics.success();
            dispatch({ type: 'done' });
          }}
        />
      ) : null}
      {previewBanner(workout) ? <Notice tone="warning">{previewBanner(workout)!}</Notice> : null}

      <Disclosure title={t('pl.audio')}>
        <AudioPanel audio={audio} onChange={updateAudio} voiceAvailable={voiceAvailable} />
      </Disclosure>
      <Disclosure
        title={strength ? t('st.easier') : t('wk.lowImpact')}
        summary={s.lowImpact ? t('pl.on') : t('pl.off')}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconBadge name="leaf" size={32} fill={brand.lime} />
          <AppText variant="label" style={{ flex: 1 }}>
            {strength ? t('st.easier') : t('wk.lowImpact')}
          </AppText>
          <Button
            variant="secondary"
            label={s.lowImpact ? t('pl.turnOff') : t('pl.turnOn')}
            onPress={() => dispatch({ type: 'lowImpact', value: !s.lowImpact })}
          />
        </View>
      </Disclosure>
      {workout.seatedSuitable && !workout.seatedOnly ? (
        <Disclosure title={t('wk.seated')} summary={s.seated ? t('pl.on') : t('pl.off')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <IconBadge name="accessibility" size={32} fill={brand.lime} />
            <AppText variant="label" style={{ flex: 1 }}>
              {t('wk.seated')}
            </AppText>
            <Button
              variant="secondary"
              label={s.seated ? t('pl.turnOff') : t('pl.turnOn')}
              onPress={() => dispatch({ type: 'seated', value: !s.seated })}
            />
          </View>
        </Disclosure>
      ) : null}
      {confirmEnd ? (
        <DepthCard>
          <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
            <AppText variant="heading" accessibilityRole="header">
              {t('pl.endTitle')}
            </AppText>
            <AppText muted>{t('pl.endBody')}</AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button label={t('pl.endConfirm')} onPress={() => dispatch({ type: 'finish' })} />
              <Button
                variant="secondary"
                label={t('pl.keepGoing')}
                onPress={() => setConfirmEnd(false)}
              />
            </View>
          </View>
        </DepthCard>
      ) : (
        <Button variant="secondary" label={t('ses.endEarly')} onPress={() => setConfirmEnd(true)} />
      )}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(Session, 'start_workout');
