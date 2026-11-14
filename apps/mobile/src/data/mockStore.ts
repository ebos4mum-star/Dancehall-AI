import {
  AiGateway,
  InMemoryUsageStore,
  MockAiProvider,
  newBudget,
  type BudgetState,
  type UsageEvent,
} from '@dancehall/ai';
import {
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
  type PhotoAnalysisRecord,
  type PhotoAnalysisResult,
  type PrivateProfile,
  type Profile,
  type ReadinessResultRecord,
  type SavedMeal,
  type Session,
  type StoreErrorCode,
  type WeightEntry,
} from './types';

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
});

const DAY_MS = 86_400_000;
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
    const usage = new InMemoryUsageStore();
    usage.events = [...s.aiEvents];
    const gateway = new AiGateway(
      new MockAiProvider(),
      usage,
      {
        flags: { ai_gateway: true },
        killAll: false,
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
    );
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
