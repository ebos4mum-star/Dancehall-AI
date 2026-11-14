import type {
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
  | 'unknown';

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

  latestReadiness(): Promise<ReadinessResultRecord | null>;
  saveReadiness(
    answers: Partial<Record<ReadinessQuestion, boolean>>,
  ): Promise<ReadinessResultRecord>;
}

export const CURRENT_POLICY_VERSION = 'dev-0';
export const REQUIRED_CONSENT: ConsentPurpose = 'health_data_processing';
