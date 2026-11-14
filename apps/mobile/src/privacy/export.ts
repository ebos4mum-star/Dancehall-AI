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
  habits: unknown[];
  habitCheckins: unknown[];
  /** Optional wellness logs and preferences (water, sleep, walks, strength, measurements, check-ins). */
  wellness: unknown[];
  wellnessPrefs: unknown;
  /** Ids of goal achievements Pulse has already celebrated or recorded. */
  celebrations: string[];
  /** Coach conversations, weekly reviews and shared household lists, when the adapter provides them. */
  conversations: unknown[];
  weeklyReviews: unknown[];
  household: unknown;
  householdMeals: unknown[];
  householdGrocery: unknown[];
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
    habits,
    habitCheckins,
    wellness,
    wellnessPrefs,
    celebrations,
    conversations,
    weeklyReviews,
    household,
    householdMeals,
    householdGrocery,
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
    store.listHabits(),
    store.listHabitCheckins('0000-01-01'),
    store.listWellness?.() ?? [],
    store.getWellnessPrefs?.() ?? null,
    store.listCelebrations?.() ?? [],
    store.listConversations?.() ?? [],
    store.listWeeklyReviews?.() ?? [],
    store.getHousehold?.() ?? null,
    store.listHouseholdMeals?.() ?? [],
    store.listHouseholdGrocery?.() ?? [],
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
    habits,
    habitCheckins,
    wellness,
    wellnessPrefs,
    celebrations,
    conversations,
    weeklyReviews,
    household,
    householdMeals,
    householdGrocery,
  };
}

export const exportToText = (d: DataExport): string => JSON.stringify(d, null, 2);
