/**
 * When the AI Coach can be used. The Coach code, screens and navigation stay in place; this only decides whether the screen
 * lets a person send anything.
 *
 * - Development mock mode: the labelled, on-device simulation (never sent anywhere), used by the browser regression.
 * - Live (Supabase) mode: only when a server AI gateway address is configured. The first TestFlight round configures none, so the Coach shows
 *   a friendly "getting ready" state, submits nothing and makes no request.
 */
export function coachAvailable(config: {
  authMode: 'mock' | 'supabase';
  aiApiUrl?: string;
}): boolean {
  return config.authMode === 'mock' || Boolean(config.aiApiUrl);
}
