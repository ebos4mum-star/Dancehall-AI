import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Pressable, Switch, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  DEMO_RATES,
  activeCaption,
  clockText,
  demoFor,
  initPlayback,
  playbackReduce,
  type DemoClip,
  type DemoEvent,
  type DemoRate,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { ProgressBar } from '@/ui/ProgressBar';

/**
 * ONE demonstration player for every place a movement is shown: dance blocks, chair dance, strength exercises and "Use what you have". The rules live in the
 * shared package (demo-media.ts decides what may be shown, demo-playback.ts is the state machine); this file only draws them. The written instructions are always
 * on screen, because a clip illustrates them and never replaces them. Nothing autoplays, nothing loops, and with reduced motion on nothing moves until Play is
 * pressed. A draft clip is labelled as a draft; a missing or failed clip falls back to the written steps with a plain explanation.
 */
interface SurfaceControl {
  play: () => void;
  pause: () => void;
  replay: () => void;
  setRate: (r: DemoRate) => void;
  seek: (s: number) => void;
}
interface SurfaceProps {
  clip: DemoClip;
  status: string;
  onSync: (positionS: number) => void;
  onEnded: () => void;
  onError: () => void;
}

/** The built-in surface for `fixture:` clips: no file, only a labelled frame. The shared clock (below) moves the position. */
const PlaceholderSurface = forwardRef<SurfaceControl, SurfaceProps>(function PlaceholderSurface(
  { clip },
  ref,
) {
  const { colors } = useTheme();
  useImperativeHandle(
    ref,
    () => ({ play() {}, pause() {}, replay() {}, setRate() {}, seek() {} }),
    [],
  );
  return (
    <View
      accessible
      accessibilityLabel={`${t('demo.placeholder')} ${clip.audioDescription ?? ''}`.trim()}
      style={{
        height: 150,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
      }}
    >
      <AppText variant="label">{t('demo.placeholder')}</AppText>
    </View>
  );
});

/** A real video or audio file through expo-video. The player's own clock is reported back so the state stays true. */
const VideoSurface = forwardRef<SurfaceControl, SurfaceProps>(function VideoSurface(
  { clip, onSync, onEnded, onError },
  ref,
) {
  const player = useVideoPlayer(clip.uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  useImperativeHandle(
    ref,
    () => ({
      play: () => player.play(),
      pause: () => player.pause(),
      replay: () => player.replay(),
      setRate: (r) => {
        player.playbackRate = r;
      },
      seek: (s) => {
        player.currentTime = s;
      },
    }),
    [player],
  );
  useEffect(() => {
    const subs = [
      player.addListener('timeUpdate', (e) => onSync(e.currentTime)),
      player.addListener('playToEnd', () => onEnded()),
      player.addListener('statusChange', (e) => {
        if (e.status === 'error') onError();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, onSync, onEnded, onError]);
  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="contain"
      accessibilityLabel={clip.audioDescription ?? t('demo.title')}
      style={{ height: 180, borderRadius: radius.md, backgroundColor: '#000' }}
    />
  );
});

function Chip({
  label,
  selected,
  onPress,
  role = 'button',
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  role?: 'button' | 'radio';
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      aria-checked={role === 'radio' ? selected === true : undefined}
      accessibilityState={
        selected === undefined ? undefined : role === 'radio' ? { checked: selected } : { selected }
      }
      onPress={onPress}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}

const rateLabel = (r: DemoRate): string => `${r}×`;

export function DemoPlayer({ clip, onFailed }: { clip: DemoClip; onFailed: (id: string) => void }) {
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const [state, dispatch] = useReducer(playbackReduce, undefined, () =>
    initPlayback(clip.durationS, { reducedMotion: reduced }),
  );
  // A ref, not state: the surface hands over its controls through the ref, and state here would re-render in a loop.
  const surfaceRef = useRef<SurfaceControl | null>(null);
  const isFixture = clip.uri.startsWith('fixture:');

  // The system setting is read asynchronously, so keep the state in step with it.
  useEffect(() => dispatch({ type: 'motion', reduced }), [reduced]);

  // The placeholder has no clock of its own, so the shared clock moves it while it plays.
  useEffect(() => {
    if (!isFixture || state.status !== 'playing') return;
    const id = setInterval(() => dispatch({ type: 'tick', seconds: 0.25 }), 250);
    return () => clearInterval(id);
  }, [isFixture, state.status]);

  const act = useCallback(
    (e: DemoEvent) => {
      dispatch(e);
      const surface = surfaceRef.current;
      if (!surface) return;
      if (e.type === 'play') {
        if (state.status === 'ended') surface.replay();
        else surface.play();
      } else if (e.type === 'pause') surface.pause();
      else if (e.type === 'toggle') {
        if (state.status === 'playing') surface.pause();
        else if (state.status === 'ended') surface.replay();
        else surface.play();
      } else if (e.type === 'replay') surface.replay();
      else if (e.type === 'rate') surface.setRate(e.rate);
      else if (e.type === 'seek') surface.seek(e.positionS);
    },
    [state.status],
  );
  const onSync = useCallback((p: number) => dispatch({ type: 'sync', positionS: p }), []);
  const onEnded = useCallback(() => dispatch({ type: 'ended' }), []);
  const onError = useCallback(() => {
    dispatch({ type: 'error' });
    onFailed(clip.id);
  }, [clip.id, onFailed]);

  const Surface = isFixture ? PlaceholderSurface : VideoSurface;
  const caption = activeCaption(clip, state.positionS, state.captionsOn);
  const playing = state.status === 'playing';
  const progress = `${clockText(state.positionS)} / ${clockText(state.durationS)}`;

  return (
    <View style={{ gap: spacing.sm }}>
      <Surface
        ref={surfaceRef}
        clip={clip}
        status={state.status}
        onSync={onSync}
        onEnded={onEnded}
        onError={onError}
      />
      <ProgressBar
        fraction={state.durationS > 0 ? state.positionS / state.durationS : 0}
        label={`${t('demo.title')}: ${progress}`}
      />
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {state.status === 'ended' ? t('demo.ended') : progress}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Chip
          label={playing ? t('demo.pause') : t('demo.play')}
          onPress={() => act({ type: 'toggle' })}
        />
        <Chip label={t('demo.replay')} onPress={() => act({ type: 'replay' })} />
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('demo.speed')}
        style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <AppText variant="caption" muted>
          {t('demo.speed')}
        </AppText>
        {DEMO_RATES.map((r) => (
          <Chip
            key={r}
            role="radio"
            label={`${t('demo.speed')} ${rateLabel(r)}`}
            selected={state.rate === r}
            onPress={() => act({ type: 'rate', rate: r })}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText style={{ flex: 1 }} variant="label">
          {t('demo.captions')}
        </AppText>
        <Switch
          accessibilityLabel={t('demo.captions')}
          value={state.captionsOn}
          onValueChange={(v) => act({ type: 'captions', on: v })}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {caption ? (
        <View accessible accessibilityLabel={`${t('demo.captions')}: ${caption}`}>
          <AppText variant="caption">{caption}</AppText>
        </View>
      ) : null}
      {clip.audioDescription ? (
        <AppText
          variant="caption"
          muted
        >{`${t('demo.audioDescription')}: ${clip.audioDescription}`}</AppText>
      ) : null}
      {state.reducedMotion ? (
        <AppText variant="caption" muted>
          {t('demo.reduced')}
        </AppText>
      ) : null}
      <AppText variant="caption" muted>
        {clip.attribution.creditLine}
      </AppText>
    </View>
  );
}

/**
 * What to show for a movement: the player when a clip may be shown (labelled if it is a draft), otherwise the plain fallback. `hideWhenNone` is for places where
 * a note on every block would be noise (dance blocks): the written cue is already there. The caller shows the written instructions; this adds the demonstration.
 */
export function DemoPanel({
  subjectId,
  hideWhenNone = false,
}: {
  subjectId: string;
  hideWhenNone?: boolean;
}) {
  const { profile } = useApp();
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const r = demoFor(subjectId, profile?.country ?? null, today, missing);
  const failed = useCallback((id: string) => setMissing((m) => new Set([...m, id])), []);
  if (r.state === 'none') {
    if (hideWhenNone) return null;
    return (
      <AppText variant="caption" muted>
        {r.reason === 'media_missing' ? t('demo.missing') : t('demo.none')}
      </AppText>
    );
  }
  return (
    <View style={{ gap: spacing.sm }} accessibilityLabel={t('demo.title')}>
      <AppText variant="label" accessibilityRole="header">
        {t('demo.title')}
      </AppText>
      {r.state === 'draft' ? <Notice tone="warning">{t('demo.draftBadge')}</Notice> : null}
      <DemoPlayer key={r.clip.id} clip={r.clip} onFailed={failed} />
    </View>
  );
}

/** True when this subject has anything to show (used to avoid empty cards). */
export function hasDemo(
  subjectId: string,
  country: string | null,
  missing?: ReadonlySet<string>,
): boolean {
  return (
    demoFor(subjectId, country, new Date().toISOString().slice(0, 10), missing).state !== 'none'
  );
}
