import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  consentPurposeSchema,
  evaluateReadiness,
  type ConsentPurpose,
  type ReadinessQuestion,
} from '@dancehall/shared';
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
} from './types';

export interface SupabaseStoreConfig {
  url: string;
  publishableKey: string;
  /** Secure storage for the auth session (Keychain/Keystore on device). */
  storage: {
    getItem(k: string): Promise<string | null>;
    setItem(k: string, v: string): Promise<void>;
    removeItem(k: string): Promise<void>;
  };
}

const CODES =
  /^(not_authenticated|adults_only|invalid_birth_date|consent_required|profile_incomplete|goal_period_mismatch|goal_direction_mismatch|goal_unsafe_underweight|goal_target_below_healthy_range|goal_pace_too_fast)/;

/** Turns a PostgREST/Postgres error into the same StoreError codes the mock uses. */
export function mapSupabaseError(
  e: { message?: string; code?: string } | null | undefined,
): StoreError {
  const msg = e?.message ?? '';
  const m = CODES.exec(msg);
  if (m) return new StoreError(m[1] as StoreErrorCode, msg);
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

export function createSupabaseStore(cfg: SupabaseStoreConfig): DataStore {
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
    mode: 'supabase',
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    async getSession() {
      const { data } = await db.auth.getSession();
      return data.session ? toSession(data.session.user) : null;
    },
    async signOut() {
      await db.auth.signOut();
      emit();
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
