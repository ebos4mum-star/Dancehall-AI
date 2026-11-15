import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  METER_IDLE,
  initRunner,
  isTicking,
  meterPoll,
  meterStart,
  runnerReduce,
  type RunnerEvent,
  type RunnerState,
  type TickMeter,
  type WorkoutDef,
} from '@dancehall/shared';
import { cueText, cuesBetween } from '@/audio/cues';
import { DEFAULT_AUDIO, loadAudio, saveAudio, type AudioSettings } from '@/audio/settings';
import { createVoice } from '@/audio/voice';
import {
  clearSnapshot,
  deviceSnapshotStore,
  readSnapshot,
  restoreSession,
  snapshotOf,
  writeSnapshot,
} from '@/dance/resume';
import { haptics } from '@/ui/haptics';

/** Polling interval for the wall clock. Time is credited from elapsed milliseconds, so a slow or throttled poll never loses or invents time. */
const POLL_MS = 250;

/**
 * The player's brain, separate from rendering. It owns the runner state, drives it from the wall clock, pauses on backgrounding, keeps a
 * recovery point, and turns state changes into haptic and spoken cues. Screens only read it and send events.
 */
export function usePlayer(
  workout: Pick<WorkoutDef, 'id' | 'blocks'> | undefined,
  lowImpact: boolean,
  sessionId: string | null,
  seated = false,
) {
  const empty = { id: '', blocks: [] };
  const [r, dispatch] = useReducer(
    (s: RunnerState, e: RunnerEvent) => runnerReduce(s, e),
    undefined,
    () => initRunner(workout ?? empty, lowImpact, seated),
  );
  const [restored, setRestored] = useState(false);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO);
  const voice = useMemo(() => createVoice(), []);
  const meter = useRef<TickMeter>(METER_IDLE);
  const audioRef = useRef(audio);
  audioRef.current = audio;

  useEffect(() => {
    void loadAudio().then(setAudio);
  }, []);
  const updateAudio = useCallback((patch: Partial<AudioSettings>) => {
    setAudio((a) => {
      const n = { ...a, ...patch };
      void saveAudio(n);
      return n;
    });
  }, []);

  // Recover an interrupted session of this workout. It always returns paused and adds no time.
  useEffect(() => {
    if (!workout) return;
    let alive = true;
    void readSnapshot(deviceSnapshotStore).then((snap) => {
      if (!alive || !snap || snap.workoutId !== workout.id) return;
      const s = restoreSession(snap, workout);
      if (!s) return void clearSnapshot(deviceSnapshotStore);
      dispatch({ type: 'restore', session: s });
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [workout]);

  // Recovery point while under way.
  const s = r.session;
  useEffect(() => {
    if (!workout || r.phase !== 'active') return;
    if (s.status === 'paused' || (s.status === 'running' && s.elapsedS % 5 === 0))
      void writeSnapshot(deviceSnapshotStore, snapshotOf(s, sessionId));
  }, [s, r.phase, workout, sessionId]);

  // Leaving the app pauses; away time is never credited (the meter is dropped on pause).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') dispatch({ type: 'pause' });
    });
    return () => sub.remove();
  }, []);

  // Wall-clock driver.
  const ticking = isTicking(r);
  useEffect(() => {
    if (!ticking) {
      meter.current = METER_IDLE;
      return;
    }
    meter.current = meterStart(Date.now());
    const h = setInterval(() => {
      const p = meterPoll(meter.current, Date.now());
      meter.current = p.meter;
      if (p.seconds > 0) dispatch({ type: 'tick', seconds: p.seconds });
    }, POLL_MS);
    return () => clearInterval(h);
  }, [ticking]);

  // Cues from state changes: haptics always, speech if on and not muted.
  const prev = useRef(r);
  useEffect(() => {
    const cues = cuesBetween(prev.current, r);
    prev.current = r;
    const a = audioRef.current;
    for (const c of cues) {
      if (c.kind === 'countdown') haptics.tap();
      else if (c.kind === 'finish') haptics.success();
      else haptics.capture();
      if (!a.voiceMuted && voice.available) voice.say(cueText(c), a.voiceVolume);
    }
  }, [r, voice]);
  useEffect(() => () => voice.stop(), [voice]);
  // Muting silences anything already speaking.
  useEffect(() => {
    if (audio.voiceMuted) voice.stop();
  }, [audio.voiceMuted, voice]);

  return { r, dispatch, restored, audio, updateAudio, voiceAvailable: voice.available };
}
