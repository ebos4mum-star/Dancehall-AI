import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import type { CosmeticId } from '@dancehall/shared';
import { PulseFigure } from './PulseFigure';
import type { Flourish } from './moment';
import {
  ONE_SHOT_MS,
  PULSE_DESCRIPTION,
  pulseReduce,
  tapAllowed,
  type PulseEvent,
  type PulseState,
} from './machine';

/** Owns the state machine and sends `settled` when a one-shot finishes. Screens call `send` with events; nothing else. */
export function usePulse(initial: PulseState = 'idle') {
  const [state, dispatch] = useReducer(pulseReduce, initial);
  const send = useCallback((e: PulseEvent) => dispatch(e), []);
  useEffect(() => {
    if (state !== 'welcome' && state !== 'celebrate' && state !== 'encourage') return;
    const h = setTimeout(() => dispatch('settled'), ONE_SHOT_MS[state]);
    return () => clearTimeout(h);
  }, [state]);
  const taps = useRef<number[]>([]);
  /** Touch reaction with a cooldown. Returns whether Pulse reacted (so the caller can add a haptic only when it did). */
  const tap = useCallback(() => {
    const now = Date.now();
    if (!tapAllowed(taps.current, now)) return false;
    taps.current = [...taps.current.filter((t) => now - t < 20_000), now];
    dispatch('tapped');
    return true;
  }, []);
  return { state, send, tap };
}

/**
 * Renders Pulse in a state. Motion is transform and opacity only (native driver). With reduced motion on, nothing moves: the authored
 * still pose for the state is shown instead. Idle is a slow, tiny breathing loop that stops when the screen unmounts.
 */
export function PulseStage({
  state,
  size = 170,
  flourish,
  cosmetics,
}: {
  state: PulseState;
  size?: number;
  flourish?: Flourish;
  cosmetics?: readonly CosmeticId[];
}) {
  const reduced = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [beat, setBeat] = useState<0 | 1>(0);

  useEffect(() => {
    if (reduced) {
      [y, rot].forEach((v) => v.setValue(0));
      scale.setValue(1);
      fade.setValue(1);
      return;
    }
    const nat = { useNativeDriver: true } as const;
    // Vertical movement is designed for a 170 px figure; smaller figures (toasts, banners) move in proportion so they never leave their box.
    const k = size / 170;
    let anim: Animated.CompositeAnimation | null = null;
    const ease = Easing.inOut(Easing.sin);
    const breathe = () =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.025, duration: 2400, easing: ease, ...nat }),
          Animated.timing(scale, { toValue: 1, duration: 2400, easing: ease, ...nat }),
        ]),
      );
    fade.setValue(1);
    if (state === 'idle') {
      y.setValue(0);
      rot.setValue(0);
      anim = breathe();
    } else if (state === 'welcome') {
      y.setValue(34 * k);
      fade.setValue(0);
      scale.setValue(0.94);
      anim = Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 450, ...nat }),
        Animated.spring(y, { toValue: 0, speed: 8, bounciness: 9, ...nat }),
        Animated.spring(scale, { toValue: 1, speed: 8, bounciness: 7, ...nat }),
      ]);
    } else if (state === 'celebrate') {
      anim = Animated.sequence([
        Animated.spring(y, { toValue: -26 * k, speed: 22, bounciness: 8, ...nat }),
        Animated.spring(y, { toValue: 0, speed: 16, bounciness: 10, ...nat }),
        Animated.spring(y, { toValue: -12 * k, speed: 22, bounciness: 8, ...nat }),
        Animated.spring(y, { toValue: 0, speed: 16, bounciness: 9, ...nat }),
      ]);
    } else if (state === 'encourage') {
      anim = Animated.sequence([
        Animated.timing(rot, { toValue: 1, duration: 520, easing: ease, ...nat }),
        Animated.delay(900),
        Animated.timing(rot, { toValue: 0, duration: 520, easing: ease, ...nat }),
      ]);
    } else if (state === 'think') {
      // A slow, small sway: Pulse is mulling, not performing.
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(rot, { toValue: 0.7, duration: 1600, easing: ease, ...nat }),
          Animated.timing(rot, { toValue: -0.2, duration: 1600, easing: ease, ...nat }),
        ]),
      );
    } else {
      anim = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(rot, { toValue: 1, duration: 600, easing: ease, ...nat }),
            Animated.timing(y, { toValue: -8 * k, duration: 300, easing: ease, ...nat }),
          ]),
          Animated.parallel([
            Animated.timing(rot, { toValue: -1, duration: 600, easing: ease, ...nat }),
            Animated.timing(y, { toValue: 0, duration: 300, easing: ease, ...nat }),
          ]),
        ]),
      );
    }
    anim.start();
    return () => anim?.stop();
  }, [state, reduced, y, rot, scale, fade, size]);

  // The two dance poses alternate at a fixed, slow beat. Only while dancing and only without reduced motion.
  useEffect(() => {
    if (state !== 'dance' || reduced) {
      setBeat(0);
      return;
    }
    const h = setInterval(() => setBeat((b) => (b === 0 ? 1 : 0)), 600);
    return () => clearInterval(h);
  }, [state, reduced]);

  // A rare, quick blink while resting makes Pulse feel alive without ever pulling attention. Never with Reduce Motion, never during another state.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (state !== 'idle' || reduced) {
      setBlink(false);
      return;
    }
    let h: ReturnType<typeof setTimeout>;
    const schedule = () => {
      h = setTimeout(
        () => {
          setBlink(true);
          h = setTimeout(() => {
            setBlink(false);
            schedule();
          }, 140);
        },
        3800 + Math.random() * 3200,
      );
    };
    schedule();
    return () => clearTimeout(h);
  }, [state, reduced]);

  // Thinking: the three thought dots appear one after another (all three, still, with Reduce Motion).
  const [dots, setDots] = useState(3);
  useEffect(() => {
    if (state !== 'think' || reduced) {
      setDots(3);
      return;
    }
    setDots(1);
    const h = setInterval(() => setDots((d) => (d >= 3 ? 1 : d + 1)), 600);
    return () => clearInterval(h);
  }, [state, reduced]);

  const lean = state === 'encourage' ? 7 : state === 'think' ? 3 : 4;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={PULSE_DESCRIPTION[state]}
      accessibilityLiveRegion="polite"
      style={{ width: size, height: size * (262 / 280) }}
    >
      <Animated.View
        style={{
          opacity: fade,
          transform: [
            { translateY: y },
            { scale },
            {
              rotate: rot.interpolate({
                inputRange: [-1, 1],
                outputRange: [`-${lean}deg`, `${lean}deg`],
              }),
            },
          ],
        }}
      >
        <PulseFigure
          state={state}
          size={size}
          beat={beat}
          flourish={flourish}
          cosmetics={cosmetics}
          blink={blink}
          dots={dots}
        />
      </Animated.View>
    </View>
  );
}
