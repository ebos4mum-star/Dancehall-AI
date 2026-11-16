import {
  cleanGroceryName,
  cleanHouseholdName,
  cleanMealTitle,
  cleanQuantity,
  householdError,
  isDay,
  isDuplicateGrocery,
  normalizeInviteCode,
} from '../food/householdLogic';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  consentPurposeSchema,
  evaluateReadiness,
  parsePrefs,
  type ConsentPurpose,
  type FoodItemValues,
  type MealType,
  type ReadinessQuestion,
  type WellnessEntry,
  type WellnessEntryInput,
  type WellnessPrefs,
} from '@dancehall/shared';
import { bindAuthLifecycle, type AppStateSource } from './authLifecycle';
import { createCoachAdapter } from './supabaseCoach';
import { createPhotoAdapter } from './supabasePhoto';
import { createCommunityAdapter } from './supabaseCommunity';
import { createSocialAdapter } from './supabaseSocial';
import {
  CURRENT_POLICY_VERSION,
  StoreError,
  type Consents,
  type DataStore,
  type Goal,
  type GoalStatus,
  type NewGoal,
  type PrivateProfile,
  type Profile,
  type ReadinessResultRecord,
  type Session,
  type StoreErrorCode,
  type WeightEntry,
  type FoodLog,
  type FoodLogItem,
  type MealPlan,
  type NewFoodLog,
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
  type SavedMeal,
} from './types';

export interface SupabaseStoreConfig {
  url: string;
  publishableKey: string;
  /** Secure storage for the auth session (Keychain/Keystore on device). */
  /** Base URL of the server AI gateway. Optional: without it the AI features report "unavailable". */
  aiApiUrl?: string;
  /** The app's foreground state (React Native's AppState). When given, token auto-refresh runs only while the app is active. */
  appState?: AppStateSource;
  storage: {
    getItem(k: string): Promise<string | null>;
    setItem(k: string, v: string): Promise<void>;
    removeItem(k: string): Promise<void>;
  };
}

const CODES =
  /^(not_authenticated|adults_only|invalid_birth_date|consent_required|profile_incomplete|goal_period_mismatch|goal_direction_mismatch|goal_unsafe_underweight|goal_target_below_healthy_range|goal_pace_too_fast|habit_limit_reached)/;

/** Turns a PostgREST/Postgres error into the same StoreError codes the mock uses. */
export function mapSupabaseError(
  e: { message?: string; code?: string } | null | undefined,
): StoreError {
  const msg = e?.message ?? '';
  const m = CODES.exec(msg);
  if (m) return new StoreError(m[1] as StoreErrorCode, msg);
  if (/fit_challenges_one_active/.test(msg)) return new StoreError('active_challenge_exists', msg);
  if (/wellness_sleep_night_idx|wellness_entries_client_key_idx/.test(msg))
    return new StoreError('invalid_input', msg);
  if (/target_leaves_rest_days/.test(msg)) return new StoreError('invalid_input', msg);
  if (e?.code === '23505' || /goals_one_active_per_period/.test(msg))
    return new StoreError('active_goal_exists', msg);
  if (/row-level security/i.test(msg)) return new StoreError('consent_required', msg);
  if (e?.code === '23514' || /check constraint|weight_not_in_future/i.test(msg))
    return new StoreError('invalid_input', msg);
  if (/JWT|not authenticated|401/i.test(msg)) return new StoreError('not_authenticated', msg);
  return new StoreError('unknown', msg);
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const fromWellnessRow = (r: Row): WellnessEntry => ({
  id: r.id as string,
  kind: r.kind as WellnessEntry['kind'],
  day: r.day as string,
  amount: Number(r.amount),
  amount2: r.amount2 == null ? null : Number(r.amount2),
  label: (r.label as string | null) ?? null,
  createdAt: r.created_at as string,
});

const toItemRow = (v: FoodItemValues) => ({
  food_id: v.foodId,
  name: v.name,
  grams: v.grams,
  kcal: v.kcal,
  protein_g: v.proteinG,
  carbs_g: v.carbsG,
  fat_g: v.fatG,
  kcal_low: v.kcalLow,
  kcal_high: v.kcalHigh,
  source: v.source,
  confidence: v.confidence,
  user_edited: v.userEdited,
});
const fromItemRow = (r: Row): FoodLogItem => ({
  id: r.id as string,
  logId: r.log_id as string,
  foodId: (r.food_id as string | null) ?? null,
  name: r.name as string,
  grams: Number(r.grams),
  kcal: Number(r.kcal),
  proteinG: Number(r.protein_g),
  carbsG: Number(r.carbs_g),
  fatG: Number(r.fat_g),
  kcalLow: Number(r.kcal_low),
  kcalHigh: Number(r.kcal_high),
  source: r.source as FoodLogItem['source'],
  confidence: r.confidence as FoodLogItem['confidence'],
  userEdited: r.user_edited as boolean,
});
const fromLogRow = (r: Row): FoodLog => ({
  id: r.id as string,
  loggedAt: r.logged_at as string,
  mealType: r.meal_type as MealType,
  source: r.source as FoodLog['source'],
  photoAnalysisId: (r.photo_analysis_id as string | null) ?? null,
  items: ((r.food_log_items as Row[] | undefined) ?? []).map(fromItemRow),
});

const fromChallengeRow = (r: Row): FitChallenge => ({
  id: r.id as string,
  lengthDays: Number(r.length_days) as FitChallenge['lengthDays'],
  targetDays: Number(r.target_days),
  startDate: r.start_date as string,
  status: r.status as ChallengeStatus,
  createdAt: r.created_at as string,
});

const fromSessionRow = (r: Row): WorkoutSession => ({
  id: r.id as string,
  workoutId: (r.workout_id as string | null) ?? null,
  programId: (r.program_id as string | null) ?? null,
  title: r.title as string,
  style: (r.style as string | null) ?? null,
  minutes: Number(r.minutes),
  plannedFor: (r.planned_for as string | null) ?? null,
  status: r.status as WorkoutSession['status'],
  completedAt: (r.completed_at as string | null) ?? null,
  durationS: r.duration_s == null ? null : Number(r.duration_s),
  perceivedExertion: r.perceived_exertion == null ? null : Number(r.perceived_exertion),
  lowImpact: r.low_impact as boolean,
  source: r.source as WorkoutSession['source'],
  externalId: (r.external_id as string | null | undefined) ?? null,
  createdAt: r.created_at as string,
});
const toSessionRow = (i: NewSession): Row => ({
  workout_id: i.workoutId ?? null,
  program_id: i.programId ?? null,
  title: i.title.trim(),
  style: i.style ?? null,
  minutes: i.minutes,
  planned_for: i.plannedFor ?? null,
  status: i.status ?? 'planned',
  completed_at: i.completedAt ?? null,
  duration_s: i.durationS ?? null,
  perceived_exertion: i.perceivedExertion ?? null,
  low_impact: i.lowImpact ?? false,
  source: i.source ?? 'manual',
  // Only sent for an imported workout, so ordinary sessions keep working before the import columns exist.
  ...(i.externalId ? { external_id: i.externalId } : {}),
});

export function createSupabaseStore(cfg: SupabaseStoreConfig): DataStore {
  return withCoach(createBaseStore(cfg), cfg);
}

function createBaseStore(
  cfg: SupabaseStoreConfig,
): DataStore & { __db: SupabaseClient; __emit: () => void } {
  const db: SupabaseClient = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      storage: cfg.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  // Token refresh, sign-out from elsewhere and expiry arrive here. Deferred: supabase-js forbids calling back into
  // the client from inside this callback.
  db.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION') return;
    setTimeout(emit, 0);
  });
  if (cfg.appState) bindAuthLifecycle(db.auth, cfg.appState);
  const ok = <T>(r: { data: T | null; error: { message?: string; code?: string } | null }): T => {
    if (r.error) throw mapSupabaseError(r.error);
    return r.data as T;
  };
  const uid = async (): Promise<string> => {
    const { data } = await db.auth.getUser();
    if (!data.user) throw new StoreError('not_authenticated');
    return data.user.id;
  };
  const toSession = (u: { id: string; email?: string | null }): Session => ({
    userId: u.id,
    email: u.email ?? null,
    mode: 'supabase',
  });
  const toGoal = (r: Row): Goal => ({
    id: r.id as string,
    type: r.type as Goal['type'],
    period: r.period as Goal['period'],
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    startKg: num(r.start_kg),
    targetKg: num(r.target_kg),
    plannedWeeklyChangeKg: num(r.planned_weekly_change_kg),
    status: r.status as GoalStatus,
    createdAt: r.created_at as string,
  });
  const toWeight = (r: Row): WeightEntry => ({
    id: r.id as string,
    weightKg: num(r.weight_kg),
    measuredAt: r.measured_at as string,
    source: r.source as WeightEntry['source'],
  });
  const toProfile = (r: Row): Profile => ({
    displayName: (r.display_name as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    timeZone: (r.time_zone as string | null) ?? null,
    locale: r.locale as string,
    unitSystem: r.unit_system as Profile['unitSystem'],
    onboardedAt: (r.onboarded_at as string | null) ?? null,
  });

  return {
    __db: db,
    __emit: emit,
    mode: 'supabase',
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async getSession() {
      const { data, error } = await db.auth.getSession();
      if (data.session) return toSession(data.session.user);
      // A network failure while refreshing an expired token keeps the stored session: report it, do not sign the user out.
      if (error && error.name === 'AuthRetryableFetchError')
        throw new StoreError('unknown', error.message);
      return null;
    },
    async signOut() {
      await db.auth.signOut();
      emit();
    },
    async signInWithDevice(identifier, secret) {
      const { data, error } = await db.auth.signInWithPassword({
        email: identifier,
        password: secret,
      });
      if (error || !data.user) {
        // 400 invalid_credentials means the server answered and refused; anything else (offline, timeout, 5xx) is "could not reach it".
        const refused =
          error && (error.status === 400 || /invalid.*credentials/i.test(error.message ?? ''));
        throw new StoreError(refused ? 'not_authenticated' : 'unknown', 'device sign-in failed');
      }
      emit();
      return toSession(data.user);
    },
    async accessToken() {
      const { data } = await db.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async sendEmailCode(email) {
      const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw mapSupabaseError(error);
    },
    async verifyEmailCode(email, code) {
      const { data, error } = await db.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.user) throw mapSupabaseError(error ?? { message: 'not authenticated' });
      emit();
      return toSession(data.user);
    },

    async getProfile() {
      const id = await uid();
      return toProfile(ok(await db.from('profiles').select('*').eq('id', id).single()) as Row);
    },
    async updateProfile(patch) {
      const id = await uid();
      const row: Row = {};
      if (patch.displayName !== undefined) row.display_name = patch.displayName;
      if (patch.country !== undefined) row.country = patch.country;
      if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
      if (patch.locale !== undefined) row.locale = patch.locale;
      if (patch.unitSystem !== undefined) row.unit_system = patch.unitSystem;
      const r = toProfile(
        ok(await db.from('profiles').update(row).eq('id', id).select('*').single()) as Row,
      );
      emit();
      return r;
    },
    async getPrivate(): Promise<PrivateProfile | null> {
      const id = await uid();
      const r = ok(
        await db.from('profile_private').select('*').eq('user_id', id).maybeSingle(),
      ) as Row | null;
      return r
        ? {
            birthDate: r.birth_date as string,
            heightCm: num(r.height_cm),
            sex: r.sex as PrivateProfile['sex'],
            activityLevel: r.activity_level as PrivateProfile['activityLevel'],
          }
        : null;
    },
    async savePrivate(p) {
      const id = await uid();
      const row = {
        user_id: id,
        birth_date: p.birthDate,
        height_cm: p.heightCm,
        sex: p.sex,
        activity_level: p.activityLevel,
      };
      const exists = ok(
        await db.from('profile_private').select('user_id').eq('user_id', id).maybeSingle(),
      );
      if (exists)
        ok(
          await db
            .from('profile_private')
            .update({
              birth_date: p.birthDate,
              height_cm: p.heightCm,
              sex: p.sex,
              activity_level: p.activityLevel,
            })
            .eq('user_id', id),
        );
      else ok(await db.from('profile_private').insert(row));
      emit();
    },
    async getConsents(): Promise<Consents> {
      const rows = ok(
        await db.from('consents').select('purpose,granted,id').order('id', { ascending: true }),
      ) as Row[];
      const out = Object.fromEntries(
        consentPurposeSchema.options.map((p) => [p, false]),
      ) as Consents;
      for (const r of rows) out[r.purpose as ConsentPurpose] = r.granted as boolean;
      return out;
    },
    async setConsent(purpose, granted) {
      ok(
        await db
          .from('consents')
          .insert({ purpose, policy_version: CURRENT_POLICY_VERSION, granted }),
      );
      emit();
    },
    async completeOnboarding() {
      ok(await db.rpc('complete_onboarding'));
      emit();
    },

    async listWeights() {
      return (
        ok(
          await db
            .from('weight_entries')
            .select('id,weight_kg,measured_at,source')
            .order('measured_at', { ascending: false })
            .limit(1000),
        ) as Row[]
      ).map(toWeight);
    },
    async addWeight(input) {
      const row: Row = { weight_kg: input.weightKg };
      if (input.measuredAt) row.measured_at = input.measuredAt;
      const r = toWeight(
        ok(
          await db
            .from('weight_entries')
            .insert(row)
            .select('id,weight_kg,measured_at,source')
            .single(),
        ) as Row,
      );
      emit();
      return r;
    },
    async deleteWeight(id) {
      ok(await db.from('weight_entries').delete().eq('id', id));
      emit();
    },

    async listGoals() {
      return (
        ok(await db.from('goals').select('*').order('created_at', { ascending: false })) as Row[]
      ).map(toGoal);
    },
    async createGoal(g: NewGoal) {
      const r = toGoal(
        ok(
          await db
            .from('goals')
            .insert({
              type: g.type,
              period: g.period,
              start_date: g.startDate,
              end_date: g.endDate,
              start_kg: g.startKg,
              target_kg: g.targetKg,
            })
            .select('*')
            .single(),
        ) as Row,
      );
      emit();
      return r;
    },
    async setGoalStatus(id, status) {
      ok(await db.from('goals').update({ status }).eq('id', id));
      emit();
    },

    async listFoodLogs(range) {
      let q = db
        .from('food_logs')
        .select('*, food_log_items(*)')
        .order('logged_at', { ascending: false })
        .limit(500);
      if (range?.fromIso) q = q.gte('logged_at', range.fromIso);
      if (range?.toIso) q = q.lt('logged_at', range.toIso);
      return (ok(await q) as Row[]).map(fromLogRow);
    },
    async createFoodLog(input: NewFoodLog) {
      const row: Row = { meal_type: input.mealType, source: input.source };
      if (input.loggedAt) row.logged_at = input.loggedAt;
      if (input.photoAnalysisId) row.photo_analysis_id = input.photoAnalysisId;
      const log = ok(await db.from('food_logs').insert(row).select('*').single()) as Row;
      const res = await db
        .from('food_log_items')
        .insert(input.items.map((i) => ({ log_id: log.id, ...toItemRow(i) })))
        .select('*');
      if (res.error) {
        await db
          .from('food_logs')
          .delete()
          .eq('id', log.id as string); // do not leave an empty meal behind
        throw mapSupabaseError(res.error);
      }
      emit();
      return fromLogRow({ ...log, food_log_items: res.data });
    },
    async updateFoodItem(id, v) {
      const { food_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high } =
        toItemRow(v);
      ok(
        await db
          .from('food_log_items')
          .update({ food_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high })
          .eq('id', id),
      );
      emit();
    },
    async deleteFoodItem(id) {
      // Like the mock: removing the last item of a meal removes the (now empty) meal too, so no blank meal is left in the diary.
      const row = ok(
        await db.from('food_log_items').select('log_id').eq('id', id).maybeSingle(),
      ) as Row | null;
      ok(await db.from('food_log_items').delete().eq('id', id));
      if (row?.log_id) {
        const left = ok(
          await db.from('food_log_items').select('id').eq('log_id', row.log_id).limit(1),
        ) as Row[];
        if (!left || left.length === 0)
          ok(
            await db
              .from('food_logs')
              .delete()
              .eq('id', row.log_id as string),
          );
      }
      emit();
    },
    async deleteFoodLog(id) {
      ok(await db.from('food_logs').delete().eq('id', id));
      emit();
    },
    async listSavedMeals() {
      return (
        ok(
          await db.from('saved_meals').select('*').order('created_at', { ascending: false }),
        ) as Row[]
      ).map((r): SavedMeal => ({
        id: r.id as string,
        name: r.name as string,
        mealType: (r.meal_type as MealType | null) ?? null,
        items: r.items as FoodItemValues[],
        createdAt: r.created_at as string,
      }));
    },
    async saveMeal(input) {
      const r = ok(
        await db
          .from('saved_meals')
          .insert({ name: input.name.trim(), meal_type: input.mealType, items: input.items })
          .select('*')
          .single(),
      ) as Row;
      emit();
      return {
        id: r.id as string,
        name: r.name as string,
        mealType: (r.meal_type as MealType | null) ?? null,
        items: r.items as FoodItemValues[],
        createdAt: r.created_at as string,
      };
    },
    async deleteSavedMeal(id) {
      ok(await db.from('saved_meals').delete().eq('id', id));
      emit();
    },
    async listMealPlans() {
      const plans = ok(
        await db
          .from('meal_plans')
          .select('*, meal_plan_items(*)')
          .order('created_at', { ascending: false }),
      ) as Row[];
      return plans.map((p): MealPlan => ({
        id: p.id as string,
        name: p.name as string,
        startDate: p.start_date as string,
        days: Number(p.days),
        budgetLevel: p.budget_level as MealPlan['budgetLevel'],
        budgetCents: (p.budget_cents as number | null) ?? null,
        currency: (p.currency as string | null) ?? null,
        targetKcal: Number(p.target_kcal),
        createdAt: p.created_at as string,
        items: ((p.meal_plan_items as Row[]) ?? []).map((i) => ({
          dayIndex: Number(i.day_index),
          mealType: i.meal_type as MealType,
          foodId: (i.food_id as string | null) ?? null,
          name: i.name as string,
          grams: Number(i.grams),
          kcal: Number(i.kcal),
          proteinG: Number(i.protein_g),
          carbsG: Number(i.carbs_g),
          fatG: Number(i.fat_g),
          costTier: (i.cost_tier as number | null) ?? null,
        })),
      }));
    },
    async createMealPlan(input: NewMealPlan) {
      const p = ok(
        await db
          .from('meal_plans')
          .insert({
            name: input.name.trim(),
            start_date: input.startDate,
            days: input.plan.days.length,
            budget_level: input.budgetLevel,
            budget_cents: input.budgetCents ?? null,
            currency: input.currency ?? null,
            target_kcal: input.plan.targetKcal,
          })
          .select('*')
          .single(),
      ) as Row;
      const rows = input.plan.days.flatMap((d) =>
        d.meals.flatMap((m) =>
          m.items.map((i) => ({
            plan_id: p.id,
            day_index: d.dayIndex,
            meal_type: m.mealType,
            food_id: i.foodId,
            name: i.name,
            grams: i.grams,
            kcal: i.kcal,
            protein_g: i.proteinG,
            carbs_g: i.carbsG,
            fat_g: i.fatG,
          })),
        ),
      );
      const res = await db.from('meal_plan_items').insert(rows);
      if (res.error) {
        await db
          .from('meal_plans')
          .delete()
          .eq('id', p.id as string);
        throw mapSupabaseError(res.error);
      }
      emit();
      const all = await this.listMealPlans();
      return all.find((x) => x.id === p.id)!;
    },
    async deleteMealPlan(id) {
      ok(await db.from('meal_plans').delete().eq('id', id));
      emit();
    },

    async listSessions() {
      return (
        ok(
          await db
            .from('workout_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000),
        ) as Row[]
      ).map(fromSessionRow);
    },
    async createSession(input: NewSession) {
      const r = fromSessionRow(
        ok(
          await db.from('workout_sessions').insert(toSessionRow(input)).select('*').single(),
        ) as Row,
      );
      emit();
      return r;
    },
    async createSessions(inputs: NewSession[]) {
      const rows = (
        ok(await db.from('workout_sessions').insert(inputs.map(toSessionRow)).select('*')) as Row[]
      ).map(fromSessionRow);
      emit();
      return rows;
    },
    async updateSession(id, patch: SessionPatch) {
      const row: Row = {};
      if (patch.plannedFor !== undefined) row.planned_for = patch.plannedFor;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.durationS !== undefined) row.duration_s = patch.durationS;
      if (patch.perceivedExertion !== undefined) row.perceived_exertion = patch.perceivedExertion;
      if (patch.lowImpact !== undefined) row.low_impact = patch.lowImpact;
      const r = fromSessionRow(
        ok(await db.from('workout_sessions').update(row).eq('id', id).select('*').single()) as Row,
      );
      emit();
      return r;
    },
    async deleteSession(id) {
      ok(await db.from('workout_sessions').delete().eq('id', id));
      emit();
    },
    async listChallenges() {
      return (
        ok(
          await db
            .from('fit_challenges')
            .select('*')
            .order('start_date', { ascending: false })
            .limit(200),
        ) as Row[]
      ).map(fromChallengeRow);
    },
    async startChallenge(input: NewFitChallenge) {
      const r = fromChallengeRow(
        ok(
          await db
            .from('fit_challenges')
            .insert({
              length_days: input.lengthDays,
              target_days: input.targetDays,
              start_date: input.startDate,
            })
            .select('*')
            .single(),
        ) as Row,
      );
      emit();
      return r;
    },
    async setChallengeStatus(id, status: ChallengeStatus) {
      ok(await db.from('fit_challenges').update({ status }).eq('id', id));
      emit();
    },

    async listHabits() {
      return (
        ok(
          await db
            .from('habits')
            .select('id,name,created_at')
            .is('archived_at', null)
            .order('created_at', { ascending: true })
            .limit(50),
        ) as Row[]
      ).map((r): Habit => ({
        id: r.id as string,
        name: r.name as string,
        createdAt: r.created_at as string,
      }));
    },
    async addHabit(name: string) {
      const r = ok(
        await db.from('habits').insert({ name }).select('id,name,created_at').single(),
      ) as Row;
      emit();
      return { id: r.id as string, name: r.name as string, createdAt: r.created_at as string };
    },
    async archiveHabit(id: string) {
      ok(await db.from('habits').update({ archived_at: new Date().toISOString() }).eq('id', id));
      emit();
    },
    async listHabitCheckins(sinceDay: string) {
      return (
        ok(
          await db.from('habit_checkins').select('habit_id,day').gte('day', sinceDay).limit(1000),
        ) as Row[]
      ).map((r): HabitCheckin => ({ habitId: r.habit_id as string, day: r.day as string }));
    },
    async setHabitDone(habitId: string, day: string, done: boolean) {
      if (done) ok(await db.from('habit_checkins').insert({ habit_id: habitId, day }));
      else ok(await db.from('habit_checkins').delete().eq('habit_id', habitId).eq('day', day));
      emit();
    },

    // ---------- Wellness (optional logs and preferences; RLS and range checks live in the database) ----------
    async listWellness(sinceDay = '0000-01-01') {
      return (
        ok(
          await db
            .from('wellness_entries')
            .select('id,kind,day,amount,amount2,label,created_at')
            .gte('day', sinceDay)
            .order('day', { ascending: false })
            .limit(2000),
        ) as Row[]
      ).map(fromWellnessRow);
    },
    async addWellness(input: WellnessEntryInput) {
      const row = {
        kind: input.kind,
        day: input.day,
        amount: input.amount,
        amount2: input.amount2 ?? null,
        label: input.label ?? null,
        client_key: input.clientKey ?? null,
      };
      const res = await db
        .from('wellness_entries')
        .insert(row)
        .select('id,kind,day,amount,amount2,label,created_at')
        .single();
      if (
        res.error &&
        input.clientKey &&
        /wellness_entries_client_key_idx/.test(res.error.message ?? '')
      ) {
        // The same action already succeeded: return that entry instead of recording it twice.
        return fromWellnessRow(
          ok(
            await db
              .from('wellness_entries')
              .select('id,kind,day,amount,amount2,label,created_at')
              .eq('client_key', input.clientKey)
              .single(),
          ) as Row,
        );
      }
      const r = fromWellnessRow(ok(res) as Row);
      emit();
      return r;
    },
    async deleteWellness(id: string) {
      ok(await db.from('wellness_entries').delete().eq('id', id));
      emit();
    },
    async getWellnessPrefs() {
      const r = ok(await db.from('wellness_prefs').select('data').maybeSingle()) as Row | null;
      return parsePrefs(r?.data);
    },
    async setWellnessPrefs(patch: Partial<WellnessPrefs>) {
      const cur = ok(await db.from('wellness_prefs').select('data').maybeSingle()) as Row | null;
      const next = parsePrefs({ ...parsePrefs(cur?.data), ...patch });
      if (cur)
        ok(
          await db
            .from('wellness_prefs')
            .update({ data: next, updated_at: new Date().toISOString() }),
        );
      else ok(await db.from('wellness_prefs').insert({ data: next }));
      emit();
      return next;
    },

    // ---------- Celebration ledger (what Pulse has already celebrated; first write wins, so no device repeats one) ----------
    async listCelebrations() {
      return (
        ok(
          await db
            .from('celebrations')
            .select('achievement_id')
            .order('shown_at', { ascending: false })
            .limit(2000),
        ) as Row[]
      ).map((r) => r.achievement_id as string);
    },
    async recordCelebrations(items: Array<{ id: string; mode: 'full' | 'gentle' | 'off' }>) {
      if (items.length === 0) return [];
      // Insert, ignoring duplicates: with ignore-duplicates the response contains ONLY the rows this call actually inserted, so the ids returned are
      // exactly the achievements this device claimed. One another device (or an earlier call) already recorded are simply absent, not errors.
      const rows = ok(
        await db
          .from('celebrations')
          .upsert(
            items.map((i) => ({ achievement_id: i.id, mode: i.mode })),
            { onConflict: 'user_id,achievement_id', ignoreDuplicates: true },
          )
          .select('achievement_id'),
      ) as Row[] | null;
      return (rows ?? []).map((r) => r.achievement_id as string);
    },

    // ---------- Household (shared meals and grocery only; RLS limits every row to members) ----------
    async getHousehold(): Promise<Household | null> {
      const me = await uid();
      const mem = ok(
        await db.from('household_members').select('household_id,member_id,role').limit(10),
      ) as Row[];
      const mine = mem.find((m) => m.member_id === me);
      if (!mine) return null;
      const hid = mine.household_id as string;
      const h = ok(await db.from('households').select('id,name').eq('id', hid).single()) as Row;
      return {
        id: hid,
        name: h.name as string,
        role: mine.role as 'owner' | 'member',
        memberCount: mem.filter((m) => m.household_id === hid).length,
      };
    },
    async createHousehold(name: string) {
      const clean = cleanHouseholdName(name);
      if (!clean) throw new StoreError('invalid_input', 'name');
      const r = await db.rpc('household_create', { p_name: clean });
      if (r.error) throw householdError(r.error.message);
      emit();
      return { id: r.data as string, name: clean, role: 'owner' as const, memberCount: 1 };
    },
    async createHouseholdInvite() {
      const h = await this.getHousehold!();
      if (!h) throw new StoreError('not_found', 'household');
      const r = await db.rpc('household_create_invite', { p_household: h.id });
      if (r.error) throw householdError(r.error.message);
      return r.data as string;
    },
    async joinHousehold(code: string) {
      const r = await db.rpc('household_join', { p_code: normalizeInviteCode(code) });
      if (r.error) throw householdError(r.error.message);
      // The database returns null (and counts the attempt) for an incorrect or used code, so the limit can record it.
      if (r.data === null || r.data === undefined) throw new StoreError('invalid_invite');
      emit();
      const h = await this.getHousehold!();
      if (!h) throw new StoreError('not_found', 'household');
      return h;
    },
    async leaveHousehold() {
      const r = await db.rpc('household_leave');
      if (r.error) throw householdError(r.error.message);
      emit();
    },
    async removeHouseholdMember(memberId: string) {
      const r = await db.rpc('household_remove_member', { p_member: memberId });
      if (r.error) throw householdError(r.error.message);
      emit();
    },
    async listHouseholdMeals() {
      const me = await uid();
      return (
        ok(
          await db
            .from('household_meals')
            .select('id,day,meal_type,title,added_by')
            .order('day', { ascending: true })
            .limit(500),
        ) as Row[]
      ).map((r): HouseholdMeal => ({
        id: r.id as string,
        day: r.day as string,
        mealType: r.meal_type as HouseholdMealType,
        title: r.title as string,
        addedByMe: r.added_by === me,
      }));
    },
    async addHouseholdMeal(input) {
      const title = cleanMealTitle(input.title);
      if (!title || !isDay(input.day)) throw new StoreError('invalid_input', 'meal');
      const h = await this.getHousehold!();
      if (!h) throw new StoreError('not_found', 'household');
      const r = ok(
        await db
          .from('household_meals')
          .insert({ household_id: h.id, day: input.day, meal_type: input.mealType, title })
          .select('id,day,meal_type,title')
          .single(),
      ) as Row;
      emit();
      return {
        id: r.id as string,
        day: r.day as string,
        mealType: r.meal_type as HouseholdMealType,
        title: r.title as string,
        addedByMe: true,
      };
    },
    async deleteHouseholdMeal(id: string) {
      ok(await db.from('household_meals').delete().eq('id', id));
      emit();
    },
    async listHouseholdGrocery() {
      const me = await uid();
      return (
        ok(
          await db
            .from('household_grocery_items')
            .select('id,name,quantity,checked_at,added_by')
            .order('created_at', { ascending: true })
            .limit(500),
        ) as Row[]
      ).map((r): HouseholdGroceryItem => ({
        id: r.id as string,
        name: r.name as string,
        quantity: (r.quantity as string | null) ?? null,
        checked: r.checked_at != null,
        addedByMe: r.added_by === me,
      }));
    },
    async addHouseholdGroceryItem(input) {
      const name = cleanGroceryName(input.name);
      if (!name) throw new StoreError('invalid_input', 'name');
      const quantity = cleanQuantity(input.quantity);
      const h = await this.getHousehold!();
      if (!h) throw new StoreError('not_found', 'household');
      const current = (await this.listHouseholdGrocery!()) as Array<{
        name: string;
        checked: boolean;
      }>;
      if (isDuplicateGrocery(current, name)) throw new StoreError('duplicate_item');
      const r = ok(
        await db
          .from('household_grocery_items')
          .insert({ household_id: h.id, name, quantity })
          .select('id,name,quantity')
          .single(),
      ) as Row;
      emit();
      return {
        id: r.id as string,
        name: r.name as string,
        quantity: (r.quantity as string | null) ?? null,
        checked: false,
        addedByMe: true,
      };
    },
    async setHouseholdGroceryChecked(id: string, checked: boolean) {
      const me = await uid();
      ok(
        await db
          .from('household_grocery_items')
          .update(
            checked
              ? { checked_by: me, checked_at: new Date().toISOString() }
              : { checked_by: null, checked_at: null },
          )
          .eq('id', id),
      );
      emit();
    },
    async deleteHouseholdGroceryItem(id: string) {
      ok(await db.from('household_grocery_items').delete().eq('id', id));
      emit();
    },

    async latestReadiness(): Promise<ReadinessResultRecord | null> {
      const r = ok(
        await db
          .from('readiness_screenings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as Row | null;
      return r
        ? {
            answers: r.answers as ReadinessResultRecord['answers'],
            outcome: r.outcome as ReadinessResultRecord['outcome'],
            createdAt: r.created_at as string,
          }
        : null;
    },
    async saveReadiness(answers: Partial<Record<ReadinessQuestion, boolean>>) {
      const outcome = evaluateReadiness(answers).outcome;
      const r = ok(
        await db.from('readiness_screenings').insert({ answers, outcome }).select('*').single(),
      ) as Row;
      emit();
      return { answers, outcome, createdAt: r.created_at as string };
    },
  };
}

function withCoach(
  base: DataStore & { __db: SupabaseClient; __emit: () => void },
  cfg: SupabaseStoreConfig,
): DataStore {
  const { __db, __emit, ...store } = base;
  return {
    ...store,
    ...createCoachAdapter({ db: __db, base: store, aiApiUrl: cfg.aiApiUrl, emit: __emit }),
    ...createPhotoAdapter({ db: __db, base: store, aiApiUrl: cfg.aiApiUrl, emit: __emit }),
    ...createCommunityAdapter({ db: __db, url: cfg.url, publishableKey: cfg.publishableKey }),
    ...createSocialAdapter({ db: __db, url: cfg.url, publishableKey: cfg.publishableKey }),
  };
}
