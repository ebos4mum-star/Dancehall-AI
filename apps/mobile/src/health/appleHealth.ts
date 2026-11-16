import { Platform } from 'react-native';
import type { ExternalWorkout, HealthProvider } from './contract';
import { prettyActivity } from './activityName';

/**
 * The real Apple Health provider (HealthKit through @kingstinct/react-native-healthkit). It can only run in a native iOS build that carries the HealthKit entitlement, so
 * it cannot be exercised on Linux, the web or Expo Go: there it reports 'unavailable'. It requests READ access to workouts only (never write, never calories, heart
 * rate or routes) and returns only a workout's id, type, start and end.
 */
import type * as HealthKit from '@kingstinct/react-native-healthkit';

type Lib = typeof HealthKit;

const loadLib = async (): Promise<Lib | null> => {
  if (Platform.OS !== 'ios') return null;
  try {
    return await import('@kingstinct/react-native-healthkit');
  } catch {
    return null;
  }
};

export function createAppleHealthProvider(
  load: () => Promise<Lib | null> = loadLib,
): HealthProvider {
  return {
    source: 'apple_health',
    async status() {
      const lib = await load();
      if (!lib) return 'unavailable';
      try {
        return (await lib.isHealthDataAvailableAsync()) ? 'ready' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
    async authorize() {
      const lib = await load();
      if (!lib) return false;
      try {
        await lib.requestAuthorization({ toRead: ['HKWorkoutTypeIdentifier'] });
        return true;
      } catch {
        return false;
      }
    },
    async readWorkouts(sinceIso) {
      const lib = await load();
      if (!lib) return [];
      const since = new Date(sinceIso);
      if (!Number.isFinite(since.getTime())) return [];
      try {
        const rows = await lib.queryWorkoutSamples({
          filter: { date: { startDate: since } },
          limit: 200,
          ascending: true,
        });
        const out: ExternalWorkout[] = [];
        for (const w of rows) {
          if (!w.uuid || !(w.startDate instanceof Date) || !(w.endDate instanceof Date)) continue;
          out.push({
            source: 'apple_health',
            externalId: w.uuid,
            startedAt: w.startDate.toISOString(),
            endedAt: w.endDate.toISOString(),
            activity: prettyActivity(lib.WorkoutActivityType[w.workoutActivityType]),
          });
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}
