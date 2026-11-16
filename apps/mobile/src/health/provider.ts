import type { AppConfig } from '@/lib/env';
import { createAppleHealthProvider } from './appleHealth';
import { disabledHealthProvider, type ExternalWorkout, type HealthProvider } from './contract';

/** Development mock only: two clearly labelled SYNTHETIC workouts so the import flow can be tried without a phone. Never used in a Supabase build. */
export function createSimulatedHealthProvider(now: () => Date = () => new Date()): HealthProvider {
  const day = 86_400_000;
  return {
    source: 'apple_health',
    status: async () => 'ready',
    authorize: async () => true,
    async readWorkouts() {
      const t = now().getTime();
      const w = (id: string, ago: number, mins: number, activity: string): ExternalWorkout => ({
        source: 'apple_health',
        externalId: `simulated-${id}`,
        startedAt: new Date(t - ago - mins * 60_000).toISOString(),
        endedAt: new Date(t - ago).toISOString(),
        activity,
      });
      return [w('walk', day, 35, 'Simulated walk'), w('cycle', 2 * day, 50, 'Simulated cycling')];
    },
  };
}

/** The provider for this build: simulated in the development mock, the real one where the owner switched it on, otherwise nothing at all (nothing is asked or read). */
export function healthProviderFor(
  config: Pick<AppConfig, 'authMode' | 'appleHealth'>,
): HealthProvider {
  if (!config.appleHealth) return disabledHealthProvider;
  return config.authMode === 'mock' ? createSimulatedHealthProvider() : createAppleHealthProvider();
}
