import type { DataStore } from '../data/types';

export interface DataExport {
  format: 'dancehall-fit-export-v1';
  exportedAt: string;
  profile: unknown;
  private: unknown;
  consents: unknown;
  readiness: unknown;
  weights: unknown[];
  goals: unknown[];
  foodLogs: unknown[];
  savedMeals: unknown[];
  mealPlans: unknown[];
  workoutSessions: unknown[];
  challenges: unknown[];
}

/**
 * The person's own records, read through the same store the app uses (so it works in mock and Supabase mode, and row-level security
 * still applies). If any part cannot be read the whole export fails: a silently partial export would look complete.
 */
export async function buildDataExport(
  store: DataStore,
  now: Date = new Date(),
): Promise<DataExport> {
  const [
    profile,
    priv,
    consents,
    readiness,
    weights,
    goals,
    foodLogs,
    savedMeals,
    mealPlans,
    sessions,
    challenges,
  ] = await Promise.all([
    store.getProfile(),
    store.getPrivate(),
    store.getConsents(),
    store.latestReadiness(),
    store.listWeights(),
    store.listGoals(),
    store.listFoodLogs(),
    store.listSavedMeals(),
    store.listMealPlans(),
    store.listSessions(),
    store.listChallenges(),
  ]);
  return {
    format: 'dancehall-fit-export-v1',
    exportedAt: now.toISOString(),
    profile,
    private: priv,
    consents,
    readiness,
    weights,
    goals,
    foodLogs,
    savedMeals,
    mealPlans,
    workoutSessions: sessions,
    challenges,
  };
}

export const exportToText = (d: DataExport): string => JSON.stringify(d, null, 2);
