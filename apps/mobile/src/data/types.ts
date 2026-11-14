import type {
  BudgetLevel,
  FoodItemValues,
  GroundedItem,
  MealType,
  MealPlanDraft,
  ConsentPurpose,
  GoalPeriod,
  GoalType,
  ReadinessQuestion,
  ReadinessOutcome,
  Sex,
  ActivityLevel,
  UnitSystem,
} from '@dancehall/shared';

export interface Session {
  userId: string;
  email: string | null;
  /** 'mock' sessions exist only in development builds and hold synthetic data on this device. */
  mode: 'mock' | 'supabase';
}
export interface Profile {
  displayName: string | null;
  country: string | null;
  timeZone: string | null;
  locale: string;
  unitSystem: UnitSystem;
  onboardedAt: string | null;
}
export interface PrivateProfile {
  birthDate: string;
  heightCm: number;
  sex: Sex;
  activityLevel: ActivityLevel;
}
export interface WeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
  source: 'manual' | 'health_platform';
}
export type GoalStatus = 'active' | 'completed' | 'abandoned';
export interface Goal {
  id: string;
  type: GoalType;
  period: GoalPeriod;
  startDate: string;
  endDate: string;
  startKg: number;
  targetKg: number;
  plannedWeeklyChangeKg: number;
  status: GoalStatus;
  createdAt: string;
}
export type NewGoal = Pick<
  Goal,
  'type' | 'period' | 'startDate' | 'endDate' | 'startKg' | 'targetKg'
>;
export interface ReadinessResultRecord {
  answers: Partial<Record<ReadinessQuestion, boolean>>;
  outcome: ReadinessOutcome;
  createdAt: string;
}
export type Consents = Record<ConsentPurpose, boolean>;

/** Error codes match the database exception prefixes so both adapters fail the same way. */
export type StoreErrorCode =
  | 'not_authenticated'
  | 'adults_only'
  | 'invalid_birth_date'
  | 'consent_required'
  | 'profile_incomplete'
  | 'goal_period_mismatch'
  | 'goal_direction_mismatch'
  | 'goal_unsafe_underweight'
  | 'goal_target_below_healthy_range'
  | 'goal_pace_too_fast'
  | 'active_goal_exists'
  | 'invalid_input'
  | 'not_found'
  | 'unknown'
  | 'ai_consent_required'
  | 'quota_exceeded'
  | 'budget_exhausted'
  | 'feature_disabled'
  | 'ai_unavailable'
  | 'photo_already_deleted';

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'StoreError';
  }
}

/**
 * The single seam between the app and its data. Two adapters exist: an offline development mock and a Supabase adapter.
 * The mock enforces the same rules as the database (consent-gated writes, adults only, goal safety limits).
 */
export interface DataStore {
  readonly mode: 'mock' | 'supabase';
  subscribe(listener: () => void): () => void;
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
  /** Development-only (mock). */
  signInDev?(): Promise<Session>;
  resetDevData?(): Promise<void>;
  /** Supabase email one-time code. */
  sendEmailCode?(email: string): Promise<void>;
  verifyEmailCode?(email: string, code: string): Promise<Session>;

  getProfile(): Promise<Profile>;
  updateProfile(
    patch: Partial<Pick<Profile, 'displayName' | 'country' | 'timeZone' | 'locale' | 'unitSystem'>>,
  ): Promise<Profile>;
  getPrivate(): Promise<PrivateProfile | null>;
  savePrivate(p: PrivateProfile): Promise<void>;
  getConsents(): Promise<Consents>;
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  completeOnboarding(): Promise<void>;

  listWeights(): Promise<WeightEntry[]>;
  addWeight(input: { weightKg: number; measuredAt?: string }): Promise<WeightEntry>;
  deleteWeight(id: string): Promise<void>;

  listGoals(): Promise<Goal[]>;
  createGoal(g: NewGoal): Promise<Goal>;
  setGoalStatus(id: string, status: GoalStatus): Promise<void>;

  listFoodLogs(range?: { fromIso?: string; toIso?: string }): Promise<FoodLog[]>;
  createFoodLog(input: NewFoodLog): Promise<FoodLog>;
  updateFoodItem(id: string, values: FoodItemValues): Promise<void>;
  deleteFoodItem(id: string): Promise<void>;
  deleteFoodLog(id: string): Promise<void>;
  listSavedMeals(): Promise<SavedMeal[]>;
  saveMeal(input: {
    name: string;
    mealType: MealType | null;
    items: FoodItemValues[];
  }): Promise<SavedMeal>;
  deleteSavedMeal(id: string): Promise<void>;

  /** Meal photo analysis. In development this is SIMULATED (mock); the Supabase adapter has no analysis service yet. */
  analyzeMealPhoto?(input: { seed: number }): Promise<PhotoAnalysisResult>;
  listPhotoAnalyses?(): Promise<PhotoAnalysisRecord[]>;
  setPhotoSaved?(analysisId: string, saved: boolean): Promise<void>;
  /** Marks temporary photos whose retention window has passed as deleted. Returns how many. */
  purgeExpiredPhotos?(): Promise<number>;

  listMealPlans(): Promise<MealPlan[]>;
  createMealPlan(input: NewMealPlan): Promise<MealPlan>;
  deleteMealPlan(id: string): Promise<void>;

  listSessions(): Promise<WorkoutSession[]>;
  createSession(input: NewSession): Promise<WorkoutSession>;
  /** Creates several planned sessions at once (used to schedule a program). */
  createSessions(inputs: NewSession[]): Promise<WorkoutSession[]>;
  updateSession(id: string, patch: SessionPatch): Promise<WorkoutSession>;
  deleteSession(id: string): Promise<void>;

  latestReadiness(): Promise<ReadinessResultRecord | null>;
  saveReadiness(
    answers: Partial<Record<ReadinessQuestion, boolean>>,
  ): Promise<ReadinessResultRecord>;
}

// ---------- Food ----------
export type FoodLogSource = 'manual' | 'photo' | 'saved_meal' | 'plan';
export interface FoodLogItem extends FoodItemValues {
  id: string;
  logId: string;
}
export interface FoodLog {
  id: string;
  loggedAt: string;
  mealType: MealType;
  source: FoodLogSource;
  photoAnalysisId: string | null;
  items: FoodLogItem[];
}
export interface NewFoodLog {
  mealType: MealType;
  loggedAt?: string;
  source: FoodLogSource;
  items: FoodItemValues[];
  photoAnalysisId?: string | null;
}
export interface SavedMeal {
  id: string;
  name: string;
  mealType: MealType | null;
  items: FoodItemValues[];
  createdAt: string;
}
export interface PhotoAnalysisRecord {
  id: string;
  status: 'uploaded' | 'succeeded' | 'failed' | 'deleted';
  provider: 'mock' | 'live';
  requestedAt: string;
  analyzedAt: string | null;
  /** When the temporary stored original is deleted (24 hours after a successful analysis unless saved). */
  deleteAfter: string | null;
  saved: boolean;
  deletedAt: string | null;
}
export interface PhotoAnalysisResult {
  analysisId: string;
  /** 'mock' means SIMULATED recognition: it does not look at the image. The UI must say so. */
  provider: 'mock' | 'live';
  items: GroundedItem[];
  notes: string | null;
}
export interface PlanItemRecord {
  dayIndex: number;
  mealType: MealType;
  foodId: string | null;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  costTier: number | null;
}
export interface MealPlan {
  id: string;
  name: string;
  startDate: string;
  days: number;
  budgetLevel: BudgetLevel;
  budgetCents: number | null;
  currency: string | null;
  targetKcal: number;
  createdAt: string;
  items: PlanItemRecord[];
}
export interface NewMealPlan {
  name: string;
  startDate: string;
  budgetLevel: BudgetLevel;
  budgetCents?: number | null;
  currency?: string | null;
  plan: MealPlanDraft;
}

// ---------- Dance sessions ----------
export type SessionStatus = 'planned' | 'completed' | 'skipped';
export type SessionSource = 'manual' | 'quick_fit' | 'program' | 'plan';
export interface WorkoutSession {
  id: string;
  workoutId: string | null;
  programId: string | null;
  /** Snapshot of the workout name so history stays readable if the catalog changes. */
  title: string;
  style: string | null;
  minutes: number;
  plannedFor: string | null;
  status: SessionStatus;
  completedAt: string | null;
  durationS: number | null;
  perceivedExertion: number | null;
  lowImpact: boolean;
  source: SessionSource;
  createdAt: string;
}
export interface NewSession {
  workoutId?: string | null;
  programId?: string | null;
  title: string;
  style?: string | null;
  minutes: number;
  plannedFor?: string | null;
  status?: 'planned' | 'completed';
  completedAt?: string | null;
  durationS?: number | null;
  perceivedExertion?: number | null;
  lowImpact?: boolean;
  source?: SessionSource;
}
export interface SessionPatch {
  plannedFor?: string | null;
  status?: SessionStatus;
  durationS?: number | null;
  perceivedExertion?: number | null;
  lowImpact?: boolean;
}

export const CURRENT_POLICY_VERSION = 'dev-0';
export const REQUIRED_CONSENT: ConsentPurpose = 'health_data_processing';
