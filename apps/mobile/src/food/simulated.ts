import type { AppConfig } from '@/lib/env';

/**
 * Recognition is SIMULATED unless a live AI gateway is configured. In this state no estimate in the app comes from real AI analysis of a photo, so every estimate
 * label says "Simulated". (When a live gateway exists the labels go back to plain "Estimate".) Nothing here switches anything on.
 */
export const isSimulatedRecognition = (config: Pick<AppConfig, 'aiApiUrl'>): boolean =>
  !config.aiApiUrl;
