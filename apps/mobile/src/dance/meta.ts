import type { DanceStyle } from '@dancehall/shared';

/** Look of each dance style. White text is used on both gradient stops (verified by a test). */
export const STYLE_META: Record<DanceStyle, { emoji: string; from: string; to: string }> = {
  afrobeats: { emoji: '🥁', from: '#B3124F', to: '#C2410C' },
  amapiano: { emoji: '🎹', from: '#4B1D9E', to: '#1D4ED8' },
  hip_hop: { emoji: '🎧', from: '#1F1633', to: '#5B21B6' },
  latin: { emoji: '💃', from: '#BE123C', to: '#7C2D12' },
  bollywood: { emoji: '✨', from: '#9D174D', to: '#6D28D9' },
  low_impact: { emoji: '🌿', from: '#0B6B4F', to: '#0E7490' },
};

export const mmss = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Effort choices shown after a session, mapped onto a 1-10 scale. */
export const EFFORT_CHOICES = [
  { key: 'easy', value: 3 },
  { key: 'moderate', value: 5 },
  { key: 'hard', value: 7 },
  { key: 'veryHard', value: 9 },
] as const;
export const effortKey = (v: number | null): (typeof EFFORT_CHOICES)[number]['key'] | null => {
  if (v == null) return null;
  return v <= 3 ? 'easy' : v <= 5 ? 'moderate' : v <= 7 ? 'hard' : 'veryHard';
};
