import { Platform } from 'react-native';

/**
 * Spoken cues. On web this uses the browser's speech synthesis, which is real and testable. Native speech needs an Expo module that has not
 * been evaluated or added, so on iOS/Android this reports itself unavailable and the player relies on the visual and haptic cues.
 */
export interface Voice {
  available: boolean;
  say(text: string, volume: number): void;
  stop(): void;
}
type Synth = {
  speak(u: unknown): void;
  cancel(): void;
};
type Utter = new (text: string) => { volume: number; rate: number };

export function createVoice(): Voice {
  const g = globalThis as unknown as { speechSynthesis?: Synth; SpeechSynthesisUtterance?: Utter };
  if (Platform.OS !== 'web' || !g.speechSynthesis || !g.SpeechSynthesisUtterance)
    return { available: false, say: () => undefined, stop: () => undefined };
  const synth = g.speechSynthesis;
  const U = g.SpeechSynthesisUtterance;
  return {
    available: true,
    say(text, volume) {
      try {
        synth.cancel(); // never queue stale countdown numbers behind newer cues
        const u = new U(text);
        u.volume = Math.min(1, Math.max(0, volume));
        u.rate = 1.05;
        synth.speak(u);
      } catch {
        /* an audio failure must never interrupt a workout */
      }
    },
    stop() {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    },
  };
}
