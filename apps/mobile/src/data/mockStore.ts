import {
  AiGateway,
  InMemoryUsageStore,
  MockAiProvider,
  newBudget,
  type BudgetState,
  type UsageEvent,
  buildCoachPrompt,
  buildReviewPrompt,
  conciergeResponseSchema,
  proposedChangeSchema,
  weeklyReviewResponseSchema,
  type AiProvider,
} from '@dancehall/ai';
import {
  CommunityEngine,
  sampleCommunity,
  type CommunityState,
  type NewPostInput,
  type ReportReason,
  AppError,
  FREE_ENTITLEMENT,
  MEAL_TYPES,
  WORKOUT_BY_ID,
  ageYearsOn,
  consentPurposeSchema,
  evaluateReadiness,
  goalWeeks,
  groundPhotoItems,
  hardCheckGoal,
  type ConsentPurpose,
  type FoodItemValues,
  type MealType,
  type ReadinessQuestion,
  FOOD_BY_ID,
  PLAN_MODES,
  buildCoachContext,
  buildWeekFacts,
  contextSummaryLines,
  detectComeback,
  calorieNeedsFromRecords,
  energyGuideFromTargets,
  generateDailyPlan,
  readinessState,
  resolvePathways,
  recentActiveDayCount,
  localDateKey,
  monthlyAllowance,
  proposeGoal,
  summarizeWeights,
  weekStartOf,
  entryProblem,
  coachWellnessContext,
  parsePrefs,
  wellnessPlanContext,
  type PlanMode,
  type WellnessEntry,
  type WellnessEntryInput,
  type WellnessPrefs,
} from '@dancehall/shared';
import {
  StoreError,
  type Consents,
  type DataStore,
  type FoodLog,
  type Goal,
  type GoalStatus,
  type MealPlan,
  type NewFoodLog,
  type NewGoal,
  type NewMealPlan,
  type NewSession,
  type SessionPatch,
  type WorkoutSession,
  type ChallengeStatus,
  type FitChallenge,
  type Habit,
  type HabitCheckin,
  type Household,
  type HouseholdGroceryItem,
  type HouseholdMeal,
  type HouseholdMealType,
  type NewFitChallenge,
  type PhotoAnalysisRecord,
  type PhotoAnalysisResult,
  type PrivateProfile,
  type Profile,
  type ReadinessResultRecord,
  type SavedMeal,
  type Session,
  type StoreErrorCode,
  type WeightEntry,
  type AiUsageSummary,
  type CoachAction,
  type CoachMessage,
  type Conversation,
  type DailyPlan,
  type DailyPlanItem,
  type WeeklyReviewRecord,
} from './types';
import { isValidChallenge } from '../challenges/logic';
import { MAX_HABITS, cleanHabitName } from '../habits/logic';
import {
  HOUSEHOLD_MEAL_TYPES,
  cleanGroceryName,
  cleanHouseholdName,
  cleanMealTitle,
  cleanQuantity,
  isDay,
  isDuplicateGrocery,
  normalizeInviteCode,
} from '../food/householdLogic';

export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

interface State {
  signedIn: boolean;
  profile: Profile;
  private: PrivateProfile | null;
  consentLog: Array<{ purpose: ConsentPurpose; granted: boolean; at: string }>;
  weights: WeightEntry[];
  goals: Goal[];
  readiness: ReadinessResultRecord[];
  foodLogs: FoodLog[];
  savedMeals: SavedMeal[];
  photos: PhotoAnalysisRecord[];
  plans: MealPlan[];
  aiEvents: UsageEvent[];
  aiBudget: BudgetState;
  sessions: WorkoutSession[];
  challenges: FitChallenge[];
  habits: Array<Habit & { archivedAt: string | null }>;
  habitCheckins: HabitCheckin[];
  wellness?: Array<WellnessEntry & { clientKey: string | null }>;
  wellnessPrefs?: unknown;
  /** Celebrations already handled (first write wins), mirroring the `celebrations` table. */
  celebrations?: Array<{ id: string; mode: 'full' | 'gentle' | 'off'; at: string }>;
  /** Development mock: a household of one (there is no second synthetic person to join). */
  household?: { id: string; name: string; inviteCode: string | null } | null;
  /** Times of incorrect invite codes (mirrors the database limit: 5 in 15 minutes). */
  joinAttempts?: string[];
  householdMeals?: Array<Omit<HouseholdMeal, 'addedByMe'>>;
  householdGrocery?: Array<Omit<HouseholdGroceryItem, 'addedByMe'>>;
  conversations: Conversation[];
  dailyPlans: DailyPlan[];
  weeklyReviews: WeeklyReviewRecord[];
  aiControls: { killAll: boolean; userPaused?: boolean };
  deletionRequest?: { id: string; scheduledFor: string; status: 'requested' } | null;
  /** Development Community: synthetic sample members and posts plus the one real local member. Mirrors the rules in `CommunityEngine`. */
  community?: CommunityState;
}

const KEY = 'dh.mock.v1';
const DEV_USER = 'dev-user-synthetic';
const emptyState = (): State => ({
  signedIn: false,
  profile: {
    displayName: null,
    country: null,
    timeZone: null,
    locale: 'en',
    unitSystem: 'metric',
    onboardedAt: null,
  },
  private: null,
  consentLog: [],
  weights: [],
  goals: [],
  readiness: [],
  foodLogs: [],
  savedMeals: [],
  photos: [],
  plans: [],
  aiEvents: [],
  aiBudget: newBudget(),
  sessions: [],
  challenges: [],
  habits: [],
  habitCheckins: [],
  conversations: [],
  dailyPlans: [],
  weeklyReviews: [],
  aiControls: { killAll: false },
});

const DAY_MS = 86_400_000;
/** Development stand-in for public.app_config 'account_deletion_grace_days' (provisional, not a final policy). */
const DEV_DELETION_GRACE_DAYS = 30;
const AI_PHOTO: ConsentPurpose = 'ai_processing_of_food_photos';

function checkItem(i: FoodItemValues): void {
  const bad =
    !(i.name.trim().length >= 1 && i.name.length <= 80) ||
    !(i.grams > 0 && i.grams <= 5000) ||
    !(i.kcal >= 0 && i.kcal <= 10000) ||
    !(i.proteinG >= 0 && i.carbsG >= 0 && i.fatG >= 0) ||
    !(i.kcalLow >= 0 && i.kcalLow <= i.kcal && i.kcal <= i.kcalHigh) ||
    !['curated', 'usda_fdc', 'open_food_facts', 'user_manual', 'ai_estimate'].includes(i.source) ||
    !['low', 'medium', 'high'].includes(i.confidence);
  if (bad) throw new StoreError('invalid_input', 'food item');
}

function checkSession(i: NewSession, now: Date): void {
  const status = i.status ?? 'planned';
  const bad =
    (status !== 'planned' && status !== 'completed') ||
    i.title.trim().length < 1 ||
    i.title.length > 80 ||
    !(i.minutes >= 1 && i.minutes <= 180) ||
    (i.workoutId != null && !WORKOUT_BY_ID.has(i.workoutId)) ||
    (i.durationS != null && !(i.durationS >= 1 && i.durationS <= 14400)) ||
    (i.perceivedExertion != null && !(i.perceivedExertion >= 1 && i.perceivedExertion <= 10)) ||
    ((i.status ?? 'planned') === 'planned' && !i.plannedFor) ||
    (i.plannedFor != null && !/^\d{4}-\d{2}-\d{2}$/.test(i.plannedFor)) ||
    (i.completedAt != null && Date.parse(i.completedAt) > now.getTime() + DAY_MS);
  if (bad) throw new StoreError('invalid_input', 'session');
}

function mapAiError(e: unknown): StoreError {
  if (e instanceof AppError) {
    const code: StoreErrorCode =
      e.code === 'quota_exceeded'
        ? 'quota_exceeded'
        : e.code === 'budget_exhausted'
          ? 'budget_exhausted'
          : e.code === 'feature_disabled'
            ? 'feature_disabled'
            : e.code === 'ai_paused'
              ? 'ai_paused'
              : 'ai_unavailable';
    return new StoreError(code, e.userMessage);
  }
  return new StoreError('ai_unavailable');
}

let counter = 0;
const newId = () =>
  `mock-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * DEVELOPMENT-ONLY offline store. Data is synthetic and lives on this device. It enforces the same rules as the database so
 * screens behave the same way against either adapter. It is refused in production builds (see lib/env.ts).
 */
export class MockStore implements DataStore {
  readonly mode = 'mock' as const;
  private state: State = emptyState();
  private loaded = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly kv: KeyValue,
    private readonly now: () => Date = () => new Date(),
    private readonly ai: AiProvider = new MockAiProvider(),
  ) {}

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private async load() {
    if (this.loaded) return;
    const raw = await this.kv.get(KEY).catch(() => null);
    if (raw) {
      try {
        this.state = { ...emptyState(), ...(JSON.parse(raw) as Partial<State>) };
      } catch {
        this.state = emptyState();
      }
    }
    this.loaded = true;
  }
  private async commit() {
    await this.kv.set(KEY, JSON.stringify(this.state));
    this.listeners.forEach((l) => l());
  }
  private async authed(): Promise<State> {
    await this.load();
    if (!this.state.signedIn) throw new StoreError('not_authenticated');
    return this.state;
  }
  private consented(s: State, purpose: ConsentPurpose = 'health_data_processing'): boolean {
    const last = [...s.consentLog].reverse().find((c) => c.purpose === purpose);
    return last?.granted === true;
  }
  private requireConsent(s: State) {
    if (!this.consented(s)) throw new StoreError('consent_required');
  }

  // ---------- Community (development mock) ----------
  /** The Community engine over local state. Sample members are created once and labelled as samples; they are not real people. */
  private async engine(): Promise<CommunityEngine> {
    await this.load();
    let seeded = false;
    if (!this.state.community) {
      this.state.community = sampleCommunity(this.now().toISOString());
      seeded = true;
    }
    if (seeded) await this.commit();
    return new CommunityEngine(this.state.community, this.now);
  }
  private memberId(): string | null {
    return this.state.signedIn ? DEV_USER : null;
  }
  private async member(): Promise<string> {
    await this.load();
    if (!this.state.signedIn) throw new StoreError('not_authenticated');
    return DEV_USER;
  }
  async communityProfile() {
    const e = await this.engine();
    const u = this.memberId() ? e.usernameOf(DEV_USER) : null;
    return u
      ? { username: u, canChangeAt: e.usernameChangeAvailableAt(DEV_USER), restriction: null }
      : null;
  }
  async communityStatus() {
    // The local simulation has no moderators and no uploads server: everything is open.
    return { mode: 'open' as const, videoEnabled: true };
  }
  async communityChangeUsername(raw: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.changeUsername(uid, raw);
    if (r.ok) await this.commit();
    return r;
  }
  async communityLeave() {
    const uid = await this.member();
    const e = await this.engine();
    e.deleteMember(uid);
    await this.commit();
    return { ok: true as const };
  }
  async communityClaimUsername(raw: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.claimUsername(uid, raw);
    if (r.ok) await this.commit();
    return r;
  }
  /** Public: works for a guest. */
  async communityFeed(opts: { cursor?: string | null; limit?: number } = {}) {
    const e = await this.engine();
    return e.feed(this.memberId(), opts);
  }
  /** Public: works for a guest. */
  async communityComments(postId: string) {
    const e = await this.engine();
    return e.comments(this.memberId(), postId);
  }
  async communityPost(input: NewPostInput, opts: { confirmed: boolean }) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.createPost(uid, input, opts);
    if (r.ok) await this.commit();
    return r;
  }
  async communityDeletePost(postId: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.deletePost(uid, postId);
    if (r.ok) await this.commit();
    return r;
  }
  async communityComment(postId: string, text: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.addComment(uid, postId, text);
    if (r.ok) await this.commit();
    return r;
  }
  async communityDeleteComment(commentId: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.deleteComment(uid, commentId);
    if (r.ok) await this.commit();
    return r;
  }
  async communityEncourage(postId: string, on: boolean) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.setEncourage(uid, postId, on);
    if (r.ok) await this.commit();
    return r;
  }
  async communityReport(input: {
    targetType: 'post' | 'comment';
    targetId: string;
    reason: ReportReason;
    note?: string;
  }) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.report(uid, input);
    if (r.ok) await this.commit();
    return r;
  }
  async communityBlock(username: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.block(uid, username);
    if (r.ok) await this.commit();
    return r;
  }
  async communityUnblock(username: string) {
    const uid = await this.member();
    const e = await this.engine();
    const r = e.unblock(uid, username);
    if (r.ok) await this.commit();
    return r;
  }
  async communityBlocked() {
    const uid = await this.member();
    return (await this.engine()).blockedUsernames(uid);
  }

  async getSession(): Promise<Session | null> {
    await this.load();
    return this.state.signedIn ? { userId: DEV_USER, email: null, mode: 'mock' } : null;
  }
  async signInDev(): Promise<Session> {
    await this.load();
    this.state.signedIn = true;
    await this.commit();
    return { userId: DEV_USER, email: null, mode: 'mock' };
  }
  /** The mock has one development user: signing in with a device credential is the same as signing in for development. */
  async signInWithDevice(): Promise<Session> {
    return this.signInDev();
  }
  async signOut() {
    await this.load();
    this.state.signedIn = false;
    await this.commit();
  }
  async resetDevData() {
    this.state = { ...emptyState(), signedIn: this.state.signedIn };
    this.loaded = true;
    await this.commit();
  }

  async getProfile(): Promise<Profile> {
    return { ...(await this.authed()).profile };
  }
  async updateProfile(patch: Parameters<DataStore['updateProfile']>[0]): Promise<Profile> {
    const s = await this.authed();
    const next = { ...s.profile, ...patch };
    if (next.displayName !== null && (next.displayName.length < 1 || next.displayName.length > 40))
      throw new StoreError('invalid_input', 'display name');
    if (next.country !== null && !/^[A-Z]{2}$/.test(next.country))
      throw new StoreError('invalid_input', 'country');
    if (next.unitSystem !== 'metric' && next.unitSystem !== 'imperial')
      throw new StoreError('invalid_input', 'units');
    s.profile = next;
    await this.commit();
    return { ...next };
  }
  async getPrivate() {
    const s = await this.authed();
    return s.private ? { ...s.private } : null;
  }
  async savePrivate(p: PrivateProfile) {
    const s = await this.authed();
    this.requireConsent(s);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) ||
      Number.isNaN(Date.parse(`${p.birthDate}T00:00:00Z`))
    )
      throw new StoreError('invalid_birth_date');
    const age = ageYearsOn(p.birthDate, this.now());
    if (age < 18) throw new StoreError('adults_only');
    if (age > 120) throw new StoreError('invalid_birth_date');
    if (!(p.heightCm >= 100 && p.heightCm <= 250)) throw new StoreError('invalid_input', 'height');
    s.private = { ...p };
    await this.commit();
  }
  async getConsents(): Promise<Consents> {
    const s = await this.authed();
    return Object.fromEntries(
      consentPurposeSchema.options.map((p) => [p, this.consented(s, p)]),
    ) as Consents;
  }
  async setConsent(purpose: ConsentPurpose, granted: boolean) {
    const s = await this.authed();
    s.consentLog.push({ purpose, granted, at: this.now().toISOString() });
    await this.commit();
  }
  async completeOnboarding() {
    const s = await this.authed();
    const p = s.profile;
    if (!p.displayName || !p.country || !p.timeZone || !s.private)
      throw new StoreError('profile_incomplete');
    if (!this.consented(s)) throw new StoreError('consent_required');
    s.profile = { ...p, onboardedAt: p.onboardedAt ?? this.now().toISOString() };
    await this.commit();
  }

  async listWeights() {
    const s = await this.authed();
    return [...s.weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  }
  async addWeight(input: { weightKg: number; measuredAt?: string }) {
    const s = await this.authed();
    this.requireConsent(s);
    if (!(input.weightKg >= 25 && input.weightKg <= 400))
      throw new StoreError('invalid_input', 'weight');
    const at = input.measuredAt ?? this.now().toISOString();
    if (Date.parse(at) > this.now().getTime() + 86_400_000)
      throw new StoreError('invalid_input', 'weight_not_in_future');
    const entry: WeightEntry = {
      id: newId(),
      weightKg: Math.round(input.weightKg * 100) / 100,
      measuredAt: at,
      source: 'manual',
    };
    s.weights.push(entry);
    await this.commit();
    return entry;
  }
  async deleteWeight(id: string) {
    const s = await this.authed();
    s.weights = s.weights.filter((w) => w.id !== id);
    await this.commit();
  }

  async listGoals() {
    const s = await this.authed();
    return [...s.goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createGoal(g: NewGoal): Promise<Goal> {
    const s = await this.authed();
    this.requireConsent(s);
    if (!s.private) throw new StoreError('profile_incomplete');
    const code = hardCheckGoal(g, {
      heightCm: s.private.heightCm,
      ageYears: ageYearsOn(s.private.birthDate, this.now()),
    });
    if (code) throw new StoreError(code as never);
    if (s.goals.some((x) => x.status === 'active' && x.period === g.period))
      throw new StoreError('active_goal_exists');
    const weeks = goalWeeks(g.startDate, g.endDate);
    const goal: Goal = {
      ...g,
      id: newId(),
      plannedWeeklyChangeKg: Math.round(((g.targetKg - g.startKg) / weeks) * 1000) / 1000,
      status: 'active',
      createdAt: this.now().toISOString(),
    };
    s.goals.push(goal);
    await this.commit();
    return goal;
  }
  async setGoalStatus(id: string, status: GoalStatus) {
    const s = await this.authed();
    const g = s.goals.find((x) => x.id === id);
    if (!g) throw new StoreError('not_found');
    if (
      status === 'active' &&
      s.goals.some((x) => x.status === 'active' && x.period === g.period && x.id !== id)
    )
      throw new StoreError('active_goal_exists');
    g.status = status;
    await this.commit();
  }

  // ---------- Food diary ----------
  async listFoodLogs(range?: { fromIso?: string; toIso?: string }) {
    const s = await this.authed();
    return s.foodLogs
      .filter(
        (l) =>
          (!range?.fromIso || l.loggedAt >= range.fromIso) &&
          (!range?.toIso || l.loggedAt < range.toIso),
      )
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
      .map((l) => ({ ...l, items: l.items.map((i) => ({ ...i })) }));
  }
  async createFoodLog(input: NewFoodLog): Promise<FoodLog> {
    const s = await this.authed();
    this.requireConsent(s); // ordinary manual logging needs only health-data consent
    if (input.source === 'photo' && !this.consented(s, AI_PHOTO))
      throw new StoreError('ai_consent_required');
    if (!MEAL_TYPES.includes(input.mealType) || input.items.length < 1 || input.items.length > 30)
      throw new StoreError('invalid_input', 'meal');
    input.items.forEach(checkItem);
    const at = input.loggedAt ?? this.now().toISOString();
    if (Date.parse(at) > this.now().getTime() + DAY_MS)
      throw new StoreError('invalid_input', 'food_log_not_in_future');
    const logId = newId();
    const log: FoodLog = {
      id: logId,
      loggedAt: at,
      mealType: input.mealType,
      source: input.source,
      photoAnalysisId: input.photoAnalysisId ?? null,
      items: input.items.map((v) => ({ ...v, id: newId(), logId })),
    };
    s.foodLogs.push(log);
    await this.commit();
    return { ...log, items: log.items.map((i) => ({ ...i })) };
  }
  async updateFoodItem(id: string, values: FoodItemValues) {
    const s = await this.authed();
    this.requireConsent(s);
    checkItem(values);
    const item = s.foodLogs.flatMap((l) => l.items).find((i) => i.id === id);
    if (!item) throw new StoreError('not_found');
    // Like the database trigger: any change to a value counts as the person editing it. Source cannot be changed.
    const { source: _keep, ...rest } = values;
    const changed = (
      [
        'name',
        'grams',
        'kcal',
        'proteinG',
        'carbsG',
        'fatG',
        'kcalLow',
        'kcalHigh',
        'foodId',
      ] as const
    ).some((k) => rest[k] !== item[k]);
    Object.assign(item, rest, { userEdited: item.userEdited || changed });
    await this.commit();
  }
  async deleteFoodItem(id: string) {
    const s = await this.authed();
    for (const l of s.foodLogs) l.items = l.items.filter((i) => i.id !== id);
    s.foodLogs = s.foodLogs.filter((l) => l.items.length > 0);
    await this.commit();
  }
  async deleteFoodLog(id: string) {
    const s = await this.authed();
    s.foodLogs = s.foodLogs.filter((l) => l.id !== id);
    await this.commit();
  }
  async listSavedMeals() {
    const s = await this.authed();
    return [...s.savedMeals]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((m) => ({ ...m, items: m.items.map((i) => ({ ...i })) }));
  }
  async saveMeal(input: {
    name: string;
    mealType: MealType | null;
    items: FoodItemValues[];
  }): Promise<SavedMeal> {
    const s = await this.authed();
    this.requireConsent(s);
    const name = input.name.trim();
    if (name.length < 1 || name.length > 60 || input.items.length < 1 || input.items.length > 30)
      throw new StoreError('invalid_input', 'saved meal');
    input.items.forEach(checkItem);
    const meal: SavedMeal = {
      id: newId(),
      name,
      mealType: input.mealType,
      items: input.items.map((i) => ({ ...i })),
      createdAt: this.now().toISOString(),
    };
    s.savedMeals.push(meal);
    await this.commit();
    return { ...meal, items: meal.items.map((i) => ({ ...i })) };
  }
  async deleteSavedMeal(id: string) {
    const s = await this.authed();
    s.savedMeals = s.savedMeals.filter((m) => m.id !== id);
    await this.commit();
  }

  // ---------- Photo analysis (SIMULATED recognition through the real gateway) ----------
  async analyzeMealPhoto(input: { seed: number }): Promise<PhotoAnalysisResult> {
    const s = await this.authed();
    this.requireConsent(s);
    if (!this.consented(s, AI_PHOTO)) throw new StoreError('ai_consent_required');
    const now = this.now();
    const rec: PhotoAnalysisRecord = {
      id: newId(),
      status: 'uploaded',
      provider: 'mock',
      requestedAt: now.toISOString(),
      analyzedAt: null,
      deleteAfter: new Date(now.getTime() + DAY_MS).toISOString(),
      saved: false,
      deletedAt: null,
    };
    s.photos.push(rec);
    // The same gateway the server will use: kill switches, quota, budget reservation, schema validation, usage metering.
    const { gateway, usage } = this.makeGateway(s);
    try {
      const out = (await gateway.run({
        userId: 'dev-user-synthetic',
        entitlement: FREE_ENTITLEMENT,
        feature: 'food_photo',
        prompt: `mock-seed:${input.seed}`,
        hasImage: true,
      })) as {
        items: Parameters<typeof groundPhotoItems>[0];
        notes?: string;
      };
      s.aiEvents = usage.events;
      s.aiBudget = gateway.budget;
      rec.status = 'succeeded';
      rec.analyzedAt = this.now().toISOString();
      rec.deleteAfter = new Date(this.now().getTime() + DAY_MS).toISOString(); // original deleted 24 hours after a successful analysis
      await this.commit();
      return {
        analysisId: rec.id,
        provider: 'mock',
        items: groundPhotoItems(out.items),
        notes: out.notes ?? null,
      };
    } catch (e) {
      s.aiEvents = usage.events;
      s.aiBudget = gateway.budget;
      rec.status = 'failed'; // unsuccessful uploads are still deleted within 24 hours of upload (deleteAfter was set at upload)
      await this.commit();
      throw mapAiError(e);
    }
  }
  async listPhotoAnalyses() {
    const s = await this.authed();
    return s.photos.map((p) => ({ ...p }));
  }
  async setPhotoSaved(analysisId: string, saved: boolean) {
    const s = await this.authed();
    const p = s.photos.find((x) => x.id === analysisId);
    if (!p) throw new StoreError('not_found');
    if (saved && (p.deletedAt || p.status === 'deleted'))
      throw new StoreError('photo_already_deleted');
    p.saved = saved;
    p.deleteAfter = saved ? null : new Date(this.now().getTime() + DAY_MS).toISOString();
    await this.commit();
  }
  async purgeExpiredPhotos() {
    await this.load();
    if (!this.state.signedIn) return 0;
    const t = this.now().toISOString();
    let n = 0;
    for (const p of this.state.photos) {
      if (!p.deletedAt && !p.saved && p.deleteAfter !== null && p.deleteAfter <= t) {
        p.status = 'deleted';
        p.deletedAt = t;
        p.deleteAfter = null;
        n += 1;
      }
    }
    if (n > 0) await this.commit();
    return n;
  }

  // ---------- Meal plans ----------
  async listMealPlans() {
    const s = await this.authed();
    return [...s.plans]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => ({ ...p, items: p.items.map((i) => ({ ...i })) }));
  }
  async createMealPlan(input: NewMealPlan): Promise<MealPlan> {
    const s = await this.authed();
    this.requireConsent(s);
    const days = input.plan.days.length;
    const name = input.name.trim();
    if (
      name.length < 1 ||
      name.length > 60 ||
      days < 1 ||
      days > 14 ||
      input.plan.targetKcal < 800 ||
      input.plan.targetKcal > 6000
    )
      throw new StoreError('invalid_input', 'plan');
    if (
      (input.budgetCents == null) !== (input.currency == null) ||
      (input.currency != null && !/^[A-Z]{3}$/.test(input.currency))
    )
      throw new StoreError('invalid_input', 'budget');
    const plan: MealPlan = {
      id: newId(),
      name,
      startDate: input.startDate,
      days,
      budgetLevel: input.budgetLevel,
      budgetCents: input.budgetCents ?? null,
      currency: input.currency ?? null,
      targetKcal: input.plan.targetKcal,
      createdAt: this.now().toISOString(),
      items: input.plan.days.flatMap((d) =>
        d.meals.flatMap((m) =>
          m.items.map((i) => ({
            dayIndex: d.dayIndex,
            mealType: m.mealType,
            foodId: i.foodId,
            name: i.name,
            grams: i.grams,
            kcal: i.kcal,
            proteinG: i.proteinG,
            carbsG: i.carbsG,
            fatG: i.fatG,
            costTier: null,
          })),
        ),
      ),
    };
    s.plans.push(plan);
    await this.commit();
    return { ...plan, items: plan.items.map((i) => ({ ...i })) };
  }
  async deleteMealPlan(id: string) {
    const s = await this.authed();
    s.plans = s.plans.filter((p) => p.id !== id);
    await this.commit();
  }

  // ---------- Workout sessions ----------
  async listSessions() {
    const s = await this.authed();
    return [...s.sessions]
      .sort((a, b) =>
        (b.completedAt ?? b.plannedFor ?? b.createdAt).localeCompare(
          a.completedAt ?? a.plannedFor ?? a.createdAt,
        ),
      )
      .map((x) => ({ ...x }));
  }
  private buildSession(i: NewSession): WorkoutSession {
    const status = i.status ?? 'planned';
    return {
      id: newId(),
      workoutId: i.workoutId ?? null,
      programId: i.programId ?? null,
      title: i.title.trim(),
      style: i.style ?? null,
      minutes: i.minutes,
      plannedFor: i.plannedFor ?? null,
      status,
      completedAt: status === 'completed' ? (i.completedAt ?? this.now().toISOString()) : null,
      durationS: i.durationS ?? null,
      perceivedExertion: i.perceivedExertion ?? null,
      lowImpact: i.lowImpact ?? false,
      source: i.source ?? 'manual',
      createdAt: this.now().toISOString(),
    };
  }
  async createSession(input: NewSession): Promise<WorkoutSession> {
    const s = await this.authed();
    this.requireConsent(s);
    checkSession(input, this.now());
    const rec = this.buildSession(input);
    s.sessions.push(rec);
    await this.commit();
    return { ...rec };
  }
  async createSessions(inputs: NewSession[]): Promise<WorkoutSession[]> {
    const s = await this.authed();
    this.requireConsent(s);
    inputs.forEach((i) => checkSession(i, this.now()));
    const recs = inputs.map((i) => this.buildSession(i));
    s.sessions.push(...recs);
    await this.commit();
    return recs.map((r) => ({ ...r }));
  }
  async updateSession(id: string, patch: SessionPatch): Promise<WorkoutSession> {
    const s = await this.authed();
    this.requireConsent(s);
    const rec = s.sessions.find((x) => x.id === id);
    if (!rec) throw new StoreError('not_found');
    const next = { ...rec, ...patch };
    if (
      next.perceivedExertion != null &&
      !(next.perceivedExertion >= 1 && next.perceivedExertion <= 10)
    )
      throw new StoreError('invalid_input', 'effort');
    if (next.durationS != null && !(next.durationS >= 1 && next.durationS <= 14400))
      throw new StoreError('invalid_input', 'duration');
    if (next.status === 'planned' && !next.plannedFor)
      throw new StoreError('invalid_input', 'planned_has_date');
    if (next.status === 'completed' && rec.status !== 'completed')
      next.completedAt = this.now().toISOString();
    if (next.status !== 'completed') next.completedAt = null;
    Object.assign(rec, next);
    await this.commit();
    return { ...rec };
  }
  async deleteSession(id: string) {
    const s = await this.authed();
    s.sessions = s.sessions.filter((x) => x.id !== id);
    await this.commit();
  }

  // ---------- Fit challenges (solo, free) ----------
  async listChallenges(): Promise<FitChallenge[]> {
    const s = await this.authed();
    return [...(s.challenges ?? [])]
      .sort(
        (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
      )
      .map((c) => ({ ...c }));
  }
  async startChallenge(input: NewFitChallenge): Promise<FitChallenge> {
    const s = await this.authed();
    this.requireConsent(s);
    if (
      !isValidChallenge(input.lengthDays, input.targetDays) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
    )
      throw new StoreError('invalid_input', 'challenge');
    s.challenges ??= [];
    if (s.challenges.some((c) => c.status === 'active'))
      throw new StoreError('active_challenge_exists');
    const rec: FitChallenge = {
      id: newId(),
      lengthDays: input.lengthDays as FitChallenge['lengthDays'],
      targetDays: input.targetDays,
      startDate: input.startDate,
      status: 'active',
      createdAt: this.now().toISOString(),
    };
    s.challenges.push(rec);
    await this.commit();
    return { ...rec };
  }
  async setChallengeStatus(id: string, status: ChallengeStatus): Promise<void> {
    const s = await this.authed();
    const rec = (s.challenges ?? []).find((c) => c.id === id);
    if (!rec) throw new StoreError('not_found');
    if (status === 'active' && rec.status !== 'active') {
      if ((s.challenges ?? []).some((c) => c.status === 'active'))
        throw new StoreError('active_challenge_exists');
    }
    rec.status = status;
    await this.commit();
  }

  // ---------- Wellness (optional logs and preferences; same rules as the database) ----------
  async listWellness(sinceDay = '0000-01-01'): Promise<WellnessEntry[]> {
    const s = await this.authed();
    return (s.wellness ?? [])
      .filter((e) => e.day >= sinceDay)
      .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))
      .map(({ clientKey: _k, ...e }) => ({ ...e }));
  }
  async addWellness(input: WellnessEntryInput): Promise<WellnessEntry> {
    const s = await this.authed();
    this.requireConsent(s);
    s.wellness ??= [];
    const key = input.clientKey ?? null;
    if (key !== null && (key.length < 8 || key.length > 64))
      throw new StoreError('invalid_input', 'client key');
    if (key !== null) {
      const dup = s.wellness.find((e) => e.clientKey === key);
      if (dup) {
        const { clientKey: _k, ...e } = dup;
        return { ...e };
      }
    }
    const today = localDateKey(this.now(), s.profile.timeZone);
    const problem = entryProblem(input, today);
    if (problem) throw new StoreError('invalid_input', problem);
    if (input.kind === 'sleep' && s.wellness.some((e) => e.kind === 'sleep' && e.day === input.day))
      throw new StoreError('invalid_input', 'sleep already logged for that night');
    const rec = {
      id: newId(),
      kind: input.kind,
      day: input.day,
      amount: input.amount,
      amount2: input.amount2 ?? null,
      label: input.label ?? null,
      createdAt: this.now().toISOString(),
      clientKey: key,
    };
    s.wellness.push(rec);
    await this.commit();
    const { clientKey: _k, ...out } = rec;
    return out;
  }
  async deleteWellness(id: string): Promise<void> {
    const s = await this.authed();
    s.wellness = (s.wellness ?? []).filter((e) => e.id !== id);
    await this.commit();
  }
  async getWellnessPrefs(): Promise<WellnessPrefs> {
    return parsePrefs((await this.authed()).wellnessPrefs);
  }
  async setWellnessPrefs(patch: Partial<WellnessPrefs>): Promise<WellnessPrefs> {
    const s = await this.authed();
    this.requireConsent(s);
    const next = parsePrefs({ ...parsePrefs(s.wellnessPrefs), ...patch });
    s.wellnessPrefs = next;
    await this.commit();
    return next;
  }

  async listCelebrations(): Promise<string[]> {
    const s = await this.authed();
    return (s.celebrations ?? []).map((c) => c.id);
  }
  async recordCelebrations(
    items: Array<{ id: string; mode: 'full' | 'gentle' | 'off' }>,
  ): Promise<string[]> {
    const s = await this.authed();
    this.requireConsent(s);
    const have = new Set((s.celebrations ?? []).map((c) => c.id));
    const re =
      /^(daily|weekly|monthly|yearly):(water|habits|movement|movement_minutes|movement_weeks):\d{4}(-\d{2}){0,2}$/;
    const claimed: string[] = [];
    for (const it of items) {
      if (!re.test(it.id) || !['full', 'gentle', 'off'].includes(it.mode))
        throw new StoreError('invalid_input');
      if (have.has(it.id)) continue;
      have.add(it.id);
      claimed.push(it.id);
      (s.celebrations ??= []).push({ id: it.id, mode: it.mode, at: this.now().toISOString() });
    }
    await this.commit();
    return claimed;
  }

  // ---------- Habits (personal, gentle: counts only) ----------
  async listHabits(): Promise<Habit[]> {
    const s = await this.authed();
    return (s.habits ?? [])
      .filter((h) => h.archivedAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((h) => ({ id: h.id, name: h.name, createdAt: h.createdAt }));
  }
  async addHabit(name: string): Promise<Habit> {
    const s = await this.authed();
    this.requireConsent(s);
    const clean = cleanHabitName(name);
    if (!clean) throw new StoreError('invalid_input', 'habit name');
    s.habits ??= [];
    if (s.habits.filter((h) => h.archivedAt === null).length >= MAX_HABITS)
      throw new StoreError('habit_limit_reached');
    const rec = { id: newId(), name: clean, createdAt: this.now().toISOString(), archivedAt: null };
    s.habits.push(rec);
    await this.commit();
    return { id: rec.id, name: rec.name, createdAt: rec.createdAt };
  }
  async archiveHabit(id: string): Promise<void> {
    const s = await this.authed();
    const h = (s.habits ?? []).find((x) => x.id === id);
    if (!h) throw new StoreError('not_found');
    h.archivedAt = this.now().toISOString();
    await this.commit();
  }
  async listHabitCheckins(sinceDay: string): Promise<HabitCheckin[]> {
    const s = await this.authed();
    return (s.habitCheckins ?? []).filter((c) => c.day >= sinceDay).map((c) => ({ ...c }));
  }
  async setHabitDone(habitId: string, day: string, done: boolean): Promise<void> {
    const s = await this.authed();
    s.habitCheckins ??= [];
    const has = s.habitCheckins.some((c) => c.habitId === habitId && c.day === day);
    if (done && !has) {
      this.requireConsent(s);
      const h = (s.habits ?? []).find((x) => x.id === habitId && x.archivedAt === null);
      if (!h) throw new StoreError('not_found');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new StoreError('invalid_input', 'day');
      s.habitCheckins.push({ habitId, day });
    } else if (!done && has) {
      s.habitCheckins = s.habitCheckins.filter((c) => !(c.habitId === habitId && c.day === day));
    } else return;
    await this.commit();
  }

  // ---------- Household meals and grocery (shared lists only; nothing health-related) ----------
  private requireHousehold(s: State) {
    if (!s.household) throw new StoreError('not_found', 'household');
    return s.household;
  }
  async getHousehold(): Promise<Household | null> {
    const s = await this.authed();
    return s.household
      ? { id: s.household.id, name: s.household.name, role: 'owner', memberCount: 1 }
      : null;
  }
  async createHousehold(name: string): Promise<Household> {
    const s = await this.authed();
    if (s.household) throw new StoreError('already_in_household');
    const clean = cleanHouseholdName(name);
    if (!clean) throw new StoreError('invalid_input', 'name');
    s.household = { id: newId(), name: clean, inviteCode: null };
    s.householdMeals = [];
    s.householdGrocery = [];
    await this.commit();
    return { id: s.household.id, name: clean, role: 'owner', memberCount: 1 };
  }
  async createHouseholdInvite(): Promise<string> {
    const s = await this.authed();
    const h = this.requireHousehold(s);
    h.inviteCode = Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, 'X');
    await this.commit();
    return h.inviteCode;
  }
  async joinHousehold(code: string): Promise<Household> {
    const s = await this.authed();
    if (s.household) throw new StoreError('already_in_household');
    void normalizeInviteCode(code);
    const now = this.now().getTime();
    const recent = (s.joinAttempts ?? []).filter((t) => now - Date.parse(t) < 15 * 60_000);
    if (recent.length >= 5) throw new StoreError('too_many_attempts');
    // The mock has no other people to join, so every code is incorrect; it is counted like the database counts it.
    s.joinAttempts = [...recent, new Date(now).toISOString()];
    await this.commit();
    throw new StoreError('invalid_invite');
  }
  async leaveHousehold(): Promise<void> {
    const s = await this.authed();
    s.household = null;
    s.householdMeals = [];
    s.householdGrocery = [];
    await this.commit();
  }
  async removeHouseholdMember(): Promise<void> {
    throw new StoreError('not_found', 'member');
  }
  async listHouseholdMeals(): Promise<HouseholdMeal[]> {
    const s = await this.authed();
    if (!s.household) return [];
    return (s.householdMeals ?? [])
      .map((m) => ({ ...m, addedByMe: true }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  async addHouseholdMeal(input: {
    day: string;
    mealType: HouseholdMealType;
    title: string;
  }): Promise<HouseholdMeal> {
    const s = await this.authed();
    this.requireHousehold(s);
    const title = cleanMealTitle(input.title);
    if (!title || !isDay(input.day) || !HOUSEHOLD_MEAL_TYPES.includes(input.mealType))
      throw new StoreError('invalid_input', 'meal');
    const rec = { id: newId(), day: input.day, mealType: input.mealType, title };
    (s.householdMeals ??= []).push(rec);
    await this.commit();
    return { ...rec, addedByMe: true };
  }
  async deleteHouseholdMeal(id: string): Promise<void> {
    const s = await this.authed();
    s.householdMeals = (s.householdMeals ?? []).filter((m) => m.id !== id);
    await this.commit();
  }
  async listHouseholdGrocery(): Promise<HouseholdGroceryItem[]> {
    const s = await this.authed();
    if (!s.household) return [];
    return (s.householdGrocery ?? []).map((g) => ({ ...g, addedByMe: true }));
  }
  async addHouseholdGroceryItem(input: {
    name: string;
    quantity?: string | null;
  }): Promise<HouseholdGroceryItem> {
    const s = await this.authed();
    this.requireHousehold(s);
    const name = cleanGroceryName(input.name);
    if (!name) throw new StoreError('invalid_input', 'name');
    if (isDuplicateGrocery(s.householdGrocery ?? [], name)) throw new StoreError('duplicate_item');
    const rec = { id: newId(), name, quantity: cleanQuantity(input.quantity), checked: false };
    (s.householdGrocery ??= []).push(rec);
    await this.commit();
    return { ...rec, addedByMe: true };
  }
  async setHouseholdGroceryChecked(id: string, checked: boolean): Promise<void> {
    const s = await this.authed();
    const g = (s.householdGrocery ?? []).find((x) => x.id === id);
    if (!g) throw new StoreError('not_found');
    g.checked = checked;
    await this.commit();
  }
  async deleteHouseholdGroceryItem(id: string): Promise<void> {
    const s = await this.authed();
    s.householdGrocery = (s.householdGrocery ?? []).filter((g) => g.id !== id);
    await this.commit();
  }

  // ---------- Shared AI plumbing (the same gateway the server will use) ----------
  private makeGateway(s: State) {
    const usage = new InMemoryUsageStore();
    usage.events = [...s.aiEvents];
    const gateway = new AiGateway(
      this.ai,
      usage,
      {
        flags: { ai_gateway: true },
        killAll: s.aiControls.killAll,
        killFeatures: {},
        maxOutputTokens: 800,
        now: () => this.now(),
        models: {
          food_photo: 'mock-large',
          concierge_chat: 'mock-small',
          weekly_review: 'mock-small',
        } as never,
      },
      { ...s.aiBudget },
      { userPause: { isPaused: async () => s.aiControls.userPaused === true } },
    );
    return { gateway, usage };
  }
  /** Runs one request and ALWAYS saves the usage events and budget afterwards, success or failure. */
  private async runGateway(
    s: State,
    req: Parameters<AiGateway['run']>[0],
  ): Promise<{ out: unknown; lastOutcome: UsageEvent['outcome'] | undefined }> {
    const { gateway, usage } = this.makeGateway(s);
    try {
      const out = await gateway.run(req);
      return { out, lastOutcome: usage.events[usage.events.length - 1]?.outcome };
    } finally {
      s.aiEvents = usage.events;
      s.aiBudget = gateway.budget;
    }
  }

  private timeZone(s: State) {
    return s.profile.timeZone;
  }
  private todayKey(s: State) {
    return localDateKey(this.now(), this.timeZone(s));
  }
  private lowImpactPreferred(s: State) {
    return (
      s.readiness[s.readiness.length - 1]?.outcome === 'low_impact_and_check_with_professional'
    );
  }

  // ---------- Daily Fit Plan (rule-based, on the device, no AI cost) ----------
  private buildPlan(s: State, date: string, mode: PlanMode): DailyPlan {
    const tz = this.timeZone(s);
    const latestW = [...s.weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
    const hour =
      Number(
        new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz ?? 'UTC',
        }).format(this.now()),
      ) % 24;
    const draft = generateDailyPlan({
      date,
      mode,
      localHour: hour,
      lowImpact: this.lowImpactPreferred(s),
      plannedToday: s.sessions
        .filter((x) => x.status === 'planned' && x.plannedFor === date)
        .map((x) => ({
          id: x.id,
          workoutId: x.workoutId,
          title: x.title,
          minutes: x.minutes,
          lowImpact: x.lowImpact,
        })),
      doneToday: s.sessions
        .filter(
          (x) =>
            x.status === 'completed' && x.completedAt && localDateKey(x.completedAt, tz) === date,
        )
        .map((x) => ({ title: x.title })),
      mealsLoggedToday: s.foodLogs.filter((l) => localDateKey(l.loggedAt, tz) === date).length,
      activeGoalTypes: s.goals.filter((g) => g.status === 'active').map((g) => g.type),
      daysSinceWeight: latestW
        ? Math.floor((this.now().getTime() - Date.parse(latestW.measuredAt)) / 86_400_000)
        : null,
      recentActiveDays: recentActiveDayCount(s.sessions, date, tz),
      wellness: wellnessPlanContext({
        prefs: parsePrefs(s.wellnessPrefs),
        entries: (s.wellness ?? []).map(({ clientKey: _k, ...e }) => e),
        day: date,
        weightKg: latestW?.weightKg ?? null,
      }),
      // The Stage A engine decides what the plan favours and why; the plan itself is still generated here.
      bias: resolvePathways({
        prefs: parsePrefs(s.wellnessPrefs),
        readiness: readinessState(s.readiness[s.readiness.length - 1]?.outcome),
        hasActiveWeightGoal: s.goals.some((g) => g.status === 'active'),
      }).bias,
      seed: Number(date.replace(/-/g, '')) % 97,
    });
    return {
      id: newId(),
      planDate: date,
      mode,
      generatedBy: 'rules',
      items: draft.items.map((it, position): DailyPlanItem => ({
        id: newId(),
        position,
        kind: it.kind,
        title: it.title,
        detail: it.detail,
        why: it.why,
        ref: it.ref,
        doneAt: it.done ? this.now().toISOString() : null,
      })),
    };
  }
  async getDailyPlan(date?: string): Promise<DailyPlan | null> {
    const s = await this.authed();
    const d = date ?? this.todayKey(s);
    const existing = s.dailyPlans.find((p) => p.planDate === d);
    if (existing) return { ...existing, items: existing.items.map((i) => ({ ...i })) };
    if (!this.consented(s)) return null;
    const plan = this.buildPlan(s, d, 'normal');
    s.dailyPlans.push(plan);
    await this.commit();
    return { ...plan, items: plan.items.map((i) => ({ ...i })) };
  }
  async regenerateDailyPlan(mode: PlanMode, date?: string): Promise<DailyPlan> {
    const s = await this.authed();
    this.requireConsent(s);
    if (!PLAN_MODES.includes(mode)) throw new StoreError('invalid_input', 'mode');
    const d = date ?? this.todayKey(s);
    const plan = this.buildPlan(s, d, mode);
    s.dailyPlans = s.dailyPlans.filter((p) => p.planDate !== d).concat(plan);
    await this.commit();
    return { ...plan, items: plan.items.map((i) => ({ ...i })) };
  }
  async setPlanItemDone(itemId: string, done: boolean) {
    const s = await this.authed();
    this.requireConsent(s);
    const item = s.dailyPlans.flatMap((p) => p.items).find((i) => i.id === itemId);
    if (!item) throw new StoreError('not_found');
    item.doneAt = done ? this.now().toISOString() : null;
    await this.commit();
  }
  private appendPlanItem(
    s: State,
    date: string,
    it: Omit<DailyPlanItem, 'id' | 'position' | 'doneAt'>,
  ) {
    let plan = s.dailyPlans.find((p) => p.planDate === date);
    if (!plan) {
      plan = this.buildPlan(s, date, 'normal');
      s.dailyPlans.push(plan);
    }
    plan.items.push({ ...it, id: newId(), position: plan.items.length, doneAt: null });
  }
  async comebackStatus() {
    const s = await this.authed();
    return detectComeback(s.sessions, { now: this.now(), timeZone: this.timeZone(s) });
  }

  // ---------- Fit Concierge ----------
  private coachContext(s: State, personalized: boolean) {
    const tz = this.timeZone(s);
    const today = this.todayKey(s);
    const plan = s.dailyPlans.find((p) => p.planDate === today);
    const weights = summarizeWeights(
      s.weights.map((w) => ({ weightKg: w.weightKg, measuredAt: w.measuredAt })),
    );
    const change = weights.change30dKg;
    const wk = weekStartOf(today);
    const doneThisWeek = s.sessions.filter(
      (x) =>
        x.status === 'completed' &&
        x.completedAt &&
        weekStartOf(localDateKey(x.completedAt, tz)) === wk,
    );
    const lastDone = s.sessions
      .filter((x) => x.status === 'completed' && x.completedAt)
      .map((x) => localDateKey(x.completedAt!, tz))
      .sort()
      .pop();
    const todaysLogs = s.foodLogs.filter((l) => localDateKey(l.loggedAt, tz) === today);
    const latest = [...s.weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
    // The same engine and safety rules as every other screen (calorieNeeds); numbers are withheld exactly when they are withheld elsewhere.
    const guideTargets =
      s.private && latest
        ? energyGuideFromTargets(
            calorieNeedsFromRecords({
              prefs: parsePrefs(s.wellnessPrefs),
              readinessOutcome: s.readiness[s.readiness.length - 1]?.outcome ?? null,
              priv: s.private,
              latestWeightKg: latest.weightKg,
              latestWeightAt: latest.measuredAt,
              goals: s.goals,
              now: this.now(),
            }),
          )
        : null;
    const guide: number | undefined = guideTargets?.guideKcal;
    const guideWeightDaysOld: number | undefined = guideTargets?.staleWeightDays;
    const lastItems = [...todaysLogs]
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0]
      ?.items.map((i) => ({ name: i.name, foodId: i.foodId, grams: i.grams, kcal: i.kcal }));
    return buildCoachContext({
      personalized,
      unitSystem: s.profile.unitSystem,
      now: this.now(),
      timeZone: tz,
      mode: plan?.mode ?? null,
      lowImpact: this.lowImpactPreferred(s),
      goals: s.goals
        .filter((g) => g.status === 'active')
        .map((g) => ({ type: g.type, period: g.period })),
      weightTrend:
        change === null ? null : Math.abs(change) < 0.3 ? 'steady' : change < 0 ? 'down' : 'up',
      activity: {
        sessionsThisWeek: doneThisWeek.length,
        minutesThisWeek: doneThisWeek.reduce(
          (n, x) => n + (x.durationS ? Math.max(1, Math.round(x.durationS / 60)) : x.minutes),
          0,
        ),
        activeDaysThisWeek: new Set(doneThisWeek.map((x) => localDateKey(x.completedAt!, tz))).size,
        daysSinceLastSession: lastDone
          ? Math.round(
              (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDone}T00:00:00Z`)) / 86_400_000,
            )
          : null,
        plannedToday: s.sessions
          .filter((x) => x.status === 'planned' && x.plannedFor === today)
          .map((x) => x.title),
        missedPlannedLast7: s.sessions.filter(
          (x) =>
            (x.status === 'planned' || x.status === 'skipped') &&
            x.plannedFor &&
            x.plannedFor < today,
        ).length,
      },
      food: {
        mealsToday: todaysLogs.length,
        kcalToday: todaysLogs.flatMap((l) => l.items).reduce((n, i) => n + i.kcal, 0),
        lastMealItems: lastItems,
      },
      plan: plan
        ? {
            mode: plan.mode,
            items: plan.items.map((i) => ({
              kind: i.kind,
              title: i.title,
              done: i.doneAt !== null,
              why: i.why,
            })),
          }
        : null,
      wellness: this.coachWellness(s, today),
      comeback: detectComeback(s.sessions, { now: this.now(), timeZone: tz }),
      guideKcal: guide,
      guideWeightDaysOld,
    });
  }
  /** Only what the person recorded. Returns undefined when nothing was logged and no preferences were set, so the coach says nothing about it. */
  private coachWellness(s: State, today: string) {
    return coachWellnessContext({
      prefs: s.wellnessPrefs ? parsePrefs(s.wellnessPrefs) : null,
      entries: (s.wellness ?? []).map(({ clientKey: _k, ...e }) => e),
      today,
    });
  }
  async getCoachContextSummary() {
    const s = await this.authed();
    return contextSummaryLines(this.coachContext(s, this.consented(s, 'ai_coach_personalization')));
  }
  private view(c: Conversation): Conversation {
    return {
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        because: [...m.because],
        actions: m.actions.map((a) => ({ ...a })),
      })),
    };
  }
  async listConversations() {
    const s = await this.authed();
    // Newest first; conversations touched at the same instant keep creation order (later first).
    return s.conversations
      .map((c, i) => ({ c, i }))
      .sort((a, b) => b.c.updatedAt.localeCompare(a.c.updatedAt) || b.i - a.i)
      .map((x) => this.view(x.c));
  }
  async getConversation(id: string) {
    const s = await this.authed();
    const c = s.conversations.find((x) => x.id === id);
    return c ? this.view(c) : null;
  }
  async sendCoachMessage(input: { conversationId?: string | null; text: string }) {
    const s = await this.authed();
    this.requireConsent(s);
    const text = input.text.trim();
    if (text.length < 1 || text.length > 1000) throw new StoreError('invalid_input', 'message');
    const now = this.now().toISOString();
    let conv = input.conversationId
      ? s.conversations.find((c) => c.id === input.conversationId)
      : undefined;
    if (input.conversationId && !conv) throw new StoreError('not_found');
    if (!conv) {
      conv = {
        id: newId(),
        title: text.slice(0, 40),
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      s.conversations.push(conv);
    }
    const history = conv.messages.map((m) => ({ role: m.role, content: m.content }));
    conv.messages.push({
      id: newId(),
      role: 'user',
      content: text,
      because: [],
      supportReferral: false,
      usedPersonalData: false,
      provider: 'mock',
      createdAt: now,
      actions: [],
    });
    conv.updatedAt = now;
    const personalized = this.consented(s, 'ai_coach_personalization');
    let result: Awaited<ReturnType<MockStore['runGateway']>>;
    try {
      result = await this.runGateway(s, {
        userId: 'dev-user-synthetic',
        entitlement: FREE_ENTITLEMENT,
        feature: 'concierge_chat',
        prompt: buildCoachPrompt(this.coachContext(s, personalized), text, history),
        userText: text,
      });
    } catch (e) {
      await this.commit(); // the question stays in history; the failure is shown, not hidden
      throw mapAiError(e);
    }
    const out = conciergeResponseSchema.parse(result.out);
    const redirected =
      result.lastOutcome === 'risk_referral' || result.lastOutcome === 'safety_redirect';
    const messageId = newId();
    const reply: CoachMessage = {
      id: messageId,
      role: 'assistant',
      content: out.message,
      because: out.because,
      supportReferral: out.supportReferral,
      usedPersonalData: personalized && !redirected,
      provider: 'mock',
      createdAt: this.now().toISOString(),
      actions: out.proposedChanges.slice(0, 5).map((c): CoachAction => ({
        id: newId(),
        messageId,
        kind: c.kind,
        summary: c.summary,
        payload: c.payload as Record<string, unknown>,
        status: 'proposed',
        decidedAt: null,
      })),
    };
    conv.messages.push(reply);
    conv.updatedAt = reply.createdAt;
    await this.commit();
    return {
      conversation: this.view(conv),
      reply: { ...reply, actions: reply.actions.map((a) => ({ ...a })) },
    };
  }
  async deleteConversation(id: string) {
    const s = await this.authed();
    s.conversations = s.conversations.filter((c) => c.id !== id);
    await this.commit();
  }
  async deleteAllConversations() {
    const s = await this.authed();
    s.conversations = [];
    await this.commit();
  }
  /** OWNER DECISION PENDING: 90 days proposed. */
  async purgeOldCoachData() {
    await this.load();
    if (!this.state.signedIn) return 0;
    const cutoff = new Date(this.now().getTime() - 90 * DAY_MS).toISOString();
    const before = this.state.conversations.length;
    this.state.conversations = this.state.conversations.filter((c) => c.updatedAt >= cutoff);
    const n = before - this.state.conversations.length;
    if (n > 0) await this.commit();
    return n;
  }

  /** The person's decision on a proposed change. Nothing changes until 'applied'; if applying fails the proposal stays open. */
  async decideCoachAction(id: string, decision: 'applied' | 'dismissed'): Promise<CoachAction> {
    const s = await this.authed();
    const action = s.conversations
      .flatMap((c) => c.messages)
      .flatMap((m) => m.actions)
      .find((a) => a.id === id);
    if (!action) throw new StoreError('not_found');
    if (action.status !== 'proposed') throw new StoreError('invalid_input', 'already decided');
    if (decision === 'applied') {
      this.requireConsent(s);
      await this.applyChange(s, action);
    }
    action.status = decision;
    action.decidedAt = this.now().toISOString();
    await this.commit();
    return { ...action };
  }
  private async applyChange(s: State, a: CoachAction) {
    const parsed = proposedChangeSchema.safeParse({
      kind: a.kind,
      summary: a.summary,
      payload: a.payload,
    });
    if (!parsed.success) throw new StoreError('invalid_input', 'proposal');
    const c = parsed.data;
    const today = this.todayKey(s);
    switch (c.kind) {
      case 'add_workout': {
        const w = WORKOUT_BY_ID.get(c.payload.workoutId);
        if (!w) throw new StoreError('invalid_input', 'workout');
        await this.createSession({
          workoutId: w.id,
          title: w.title,
          style: w.style,
          minutes: w.minutes,
          plannedFor: c.payload.plannedFor,
          lowImpact: c.payload.lowImpact ?? false,
          source: 'quick_fit',
        });
        return;
      }
      case 'update_daily_plan':
        await this.regenerateDailyPlan(c.payload.mode, c.payload.date);
        return;
      case 'add_habit':
        this.appendPlanItem(s, today, {
          kind: 'habit',
          title: c.payload.title,
          detail: 'Added from your coach. Tick it off whenever you do it.',
          why: 'You asked your coach to add this habit.',
        });
        return;
      case 'swap_meal': {
        const to = FOOD_BY_ID.get(c.payload.toFoodId);
        const from = FOOD_BY_ID.get(c.payload.fromFoodId);
        if (!to || !from) throw new StoreError('invalid_input', 'food');
        this.appendPlanItem(s, today, {
          kind: 'meal',
          title: `Try ${to.name} instead of ${from.name}`,
          detail: `About ${Math.round(c.payload.grams)} g, whenever it suits.`,
          why: 'A comparable swap from the reference data. An idea, not a rule.',
          ref: { foodId: to.id },
        });
        return;
      }
      case 'adjust_goal': {
        // A coach-proposed goal goes through the SAME safety rules as any other goal; the model never supplies a target.
        const latest = [...s.weights].sort((x, y) => y.measuredAt.localeCompare(x.measuredAt))[0];
        if (!s.private || !latest) throw new StoreError('profile_incomplete');
        const proposal = proposeGoal({
          type: c.payload.type,
          period: c.payload.period,
          startDate: today,
          startKg: latest.weightKg,
          heightCm: s.private.heightCm,
          ageYears: ageYearsOn(s.private.birthDate, this.now()),
        });
        if (proposal.status === 'block' || !proposal.goal)
          throw new StoreError('goal_blocked', proposal.reasons[0]);
        // End the goal being replaced (and any active goal of the new period: only one may be active per period); restore them if creating fails.
        const ending = s.goals.filter(
          (g) =>
            g.status === 'active' &&
            (g.period === c.payload.period || g.period === c.payload.replacePeriod),
        );
        ending.forEach((g) => (g.status = 'abandoned'));
        try {
          await this.createGoal(proposal.goal);
        } catch (e) {
          ending.forEach((g) => (g.status = 'active'));
          throw e;
        }
        return;
      }
    }
  }

  // ---------- Weekly reviews ----------
  async listWeeklyReviews() {
    const s = await this.authed();
    return [...s.weeklyReviews]
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .map((r) => ({ ...r }));
  }
  async generateWeeklyReview(weekStart?: string): Promise<WeeklyReviewRecord> {
    const s = await this.authed();
    this.requireConsent(s);
    if (!this.consented(s, 'ai_coach_personalization'))
      throw new StoreError('coach_consent_required');
    const week = weekStart ?? weekStartOf(this.todayKey(s));
    const facts = buildWeekFacts({
      weekStart: week,
      timeZone: this.timeZone(s),
      sessions: s.sessions,
      foodLogTimes: s.foodLogs.map((l) => l.loggedAt),
      weights: s.weights.map((w) => ({ weightKg: w.weightKg, measuredAt: w.measuredAt })),
      activeGoals: s.goals.filter((g) => g.status === 'active').length,
      wellness: (s.wellness ?? []).map(({ clientKey: _k, ...e }) => e),
      hideWellnessNumbers: this.coachWellness(s, this.todayKey(s))?.numbersHidden === true,
    });
    let result: Awaited<ReturnType<MockStore['runGateway']>>;
    try {
      result = await this.runGateway(s, {
        userId: 'dev-user-synthetic',
        entitlement: FREE_ENTITLEMENT,
        feature: 'weekly_review',
        prompt: buildReviewPrompt(facts),
      });
    } catch (e) {
      await this.commit();
      throw mapAiError(e);
    }
    const content = weeklyReviewResponseSchema.parse(result.out);
    const rec: WeeklyReviewRecord = {
      id: newId(),
      weekStart: week,
      content,
      provider: 'mock',
      createdAt: this.now().toISOString(),
    };
    s.weeklyReviews = s.weeklyReviews.filter((r) => r.weekStart !== week).concat(rec);
    await this.commit();
    return { ...rec };
  }

  // ---------- Usage and controls ----------
  async getAiUsage(): Promise<AiUsageSummary> {
    const s = await this.authed();
    const month = this.now().toISOString().slice(0, 7);
    const used = (f: string) =>
      s.aiEvents.filter((e) => e.feature === f && e.at.startsWith(month) && e.outcome === 'ok')
        .length;
    return {
      month,
      features: (['concierge_chat', 'weekly_review', 'food_photo'] as const).map((feature) => ({
        feature,
        used: used(feature),
        allowance: monthlyAllowance('free', feature),
      })),
      // Paused when AI is switched off, or less than one request's worst case (about half a cent) of the monthly budget remains.
      userPaused: s.aiControls.userPaused === true,
      staffPaused: s.aiControls.killAll,
      paused:
        s.aiControls.killAll ||
        s.aiControls.userPaused === true ||
        s.aiBudget.settledUsd + s.aiBudget.reservedUsd + 0.005 > s.aiBudget.ceilingUsd,
      personalization: this.consented(s, 'ai_coach_personalization'),
    };
  }
  /** The person's own AI pause. Never touches the staff kill switch. */
  async setAiPaused(on: boolean) {
    const s = await this.authed();
    s.aiControls = { ...s.aiControls, userPaused: on };
    await this.commit();
  }
  async requestAccountDeletion() {
    const s = await this.authed();
    s.deletionRequest ??= {
      id: newId(),
      scheduledFor: new Date(this.now().getTime() + DEV_DELETION_GRACE_DAYS * DAY_MS).toISOString(),
      status: 'requested',
    };
    await this.commit();
    return { ...s.deletionRequest };
  }
  async cancelAccountDeletion() {
    const s = await this.authed();
    const had = !!s.deletionRequest;
    s.deletionRequest = null;
    await this.commit();
    return had;
  }
  async getAccountDeletionRequest() {
    const s = await this.authed();
    return s.deletionRequest ? { ...s.deletionRequest } : null;
  }
  /** DEVELOPMENT ONLY: stands in for the staff-controlled kill switch. */
  async devSetKillSwitch(on: boolean) {
    const s = await this.authed();
    s.aiControls.killAll = on;
    await this.commit();
  }
  /** DEVELOPMENT/TEST ONLY. */
  async devSetBudgetCeiling(usd: number) {
    const s = await this.authed();
    s.aiBudget = { ...s.aiBudget, ceilingUsd: usd };
    await this.commit();
  }

  async latestReadiness() {
    const s = await this.authed();
    return s.readiness[s.readiness.length - 1] ?? null;
  }
  async saveReadiness(answers: Partial<Record<ReadinessQuestion, boolean>>) {
    const s = await this.authed();
    this.requireConsent(s);
    const rec: ReadinessResultRecord = {
      answers,
      outcome: evaluateReadiness(answers).outcome,
      createdAt: this.now().toISOString(),
    };
    s.readiness.push(rec);
    await this.commit();
    return rec;
  }
}
