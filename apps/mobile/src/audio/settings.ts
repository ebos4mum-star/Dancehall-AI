import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AudioSettings {
  /** 0..1. Applies only when licensed music exists; kept so the choice survives until it does. */
  musicVolume: number;
  musicMuted: boolean;
  voiceVolume: number;
  voiceMuted: boolean;
}
export const DEFAULT_AUDIO: AudioSettings = {
  musicVolume: 0.7,
  musicMuted: false,
  voiceVolume: 1,
  voiceMuted: false,
};
const KEY = 'dh.audio.settings';
export const clamp01 = (n: unknown, d: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;

export function parseAudio(raw: string | null): AudioSettings {
  if (!raw) return DEFAULT_AUDIO;
  try {
    const j = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicVolume: clamp01(j.musicVolume, DEFAULT_AUDIO.musicVolume),
      musicMuted: j.musicMuted === true,
      voiceVolume: clamp01(j.voiceVolume, DEFAULT_AUDIO.voiceVolume),
      voiceMuted: j.voiceMuted === true,
    };
  } catch {
    return DEFAULT_AUDIO;
  }
}
export const loadAudio = async (): Promise<AudioSettings> =>
  parseAudio(await AsyncStorage.getItem(KEY).catch(() => null));
export const saveAudio = (s: AudioSettings): Promise<void> =>
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => undefined);

/** Licensed or original workout music. None exists yet: the music controls are shown disabled with that explanation. */
export const MUSIC_CATALOG: readonly { id: string; uri: string }[] = [];
export const musicAvailable = (): boolean => MUSIC_CATALOG.length > 0;
