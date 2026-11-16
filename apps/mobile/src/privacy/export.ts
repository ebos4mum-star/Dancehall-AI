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
  /** Friends, requests, blocks, group goals and what the person shares with each friend (public usernames only). Null when the adapter has no Friends. */
  social: unknown;
  /** Products the person typed in from a package label (kept on this phone), when provided by the screen. */
  myProducts: unknown[];
}

/**
 * The person's own records, read through the same store the app uses (so it works in mock and Supabase mode, and row-level security
 * still applies). If any part cannot be read the whole export fails: a silently partial export would look complete.
 */
export async function buildDataExport(
  store: DataStore,
  now: Date = new Date(),
  extras: { myProducts?: unknown[] } = {},
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
    social: await readSocial(store),
    myProducts: extras.myProducts ?? [],
  };
}

/** Friends data is personal data too: who the person is connected to, who they blocked, their groups, and what they share with whom. Usernames only; never anyone's records. */
async function readSocial(store: DataStore): Promise<unknown> {
  if (!store.socialOverview) return null;
  const o = await store.socialOverview();
  const shares: Record<string, string[]> = {};
  for (const f of o.friends) shares[f] = (await store.socialSharesWith?.(f)) ?? [];
  return {
    username: o.username,
    friends: o.friends,
    requestsReceived: o.incoming,
    requestsSent: o.outgoing,
    blocked: o.blocked,
    sharingWithFriends: shares,
    groups: o.groups.map((g) => ({
      title: g.title,
      kind: g.kind,
      metric: g.metric,
      startDay: g.startDay,
      endDay: g.endDay,
      status: g.iAm,
      members: g.members,
      totals: g.byMember,
    })),
  };
}

export const exportToText = (d: DataExport): string => JSON.stringify(d, null, 2);
