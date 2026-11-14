import {
  ageYearsOn,
  consentPurposeSchema,
  evaluateReadiness,
  goalWeeks,
  hardCheckGoal,
  type ConsentPurpose,
  type ReadinessQuestion,
} from '@dancehall/shared';
import {
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
});

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
