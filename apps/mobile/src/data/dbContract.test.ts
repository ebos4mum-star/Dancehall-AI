/**
 * Contract between the app and the database, checked offline against the migration files (which the live project was verified to match).
 * 1. Every enum-like CHECK list in the schema equals the values the app can send, so no screen can hit a constraint error.
 * 2. Every column the Supabase adapter writes is granted to the `authenticated` role (grants are per column in this schema).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUDGET_LEVELS,
  DANCE_STYLES,
  GOAL_PERIODS,
  GOAL_TYPES,
  INTENSITIES,
  LEVELS,
  MEAL_TYPES,
  PLAN_MODES,
  consentPurposeSchema,
  type Confidence,
  type NutritionSource,
  type ReadinessOutcome,
} from '@dancehall/shared';
import type { ChallengeStatus, FoodLogSource, GoalStatus, SessionSource } from './types';

const dir = join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

/** Every value of `U` must appear in the array, checked at compile time. */
const all =
  <U extends string>() =>
  <A extends readonly U[]>(v: A & ([U] extends [A[number]] ? unknown : never)): readonly U[] =>
    v;

function tableBody(table: string): string {
  const start = sql.indexOf(`create table public.${table} (`);
  if (start < 0) throw new Error(`table ${table} not found in migrations`);
  let depth = 0;
  for (let i = sql.indexOf('(', start); i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    if (sql[i] === ')' && --depth === 0) return sql.slice(start, i + 1);
  }
  throw new Error('unbalanced');
}
function dbEnum(table: string, column: string): string[] {
  const body = tableBody(table);
  const m = new RegExp(`\\b${column}\\b[^,]*?check \\(\\s*${column} in \\(([^)]*)\\)`, 's').exec(
    body,
  );
  if (!m) throw new Error(`no enum check for ${table}.${column}`);
  return [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!).sort();
}
const sorted = (a: readonly string[]) => [...a].sort();

describe('enum contract: the app can only send values the database accepts', () => {
  const cases: Array<[string, string, readonly string[]]> = [
    ['food_logs', 'meal_type', MEAL_TYPES],
    ['saved_meals', 'meal_type', MEAL_TYPES],
    ['meal_plan_items', 'meal_type', MEAL_TYPES],
    ['meal_plans', 'budget_level', BUDGET_LEVELS],
    ['goals', 'type', GOAL_TYPES],
    ['goals', 'period', GOAL_PERIODS],
    ['goals', 'status', all<GoalStatus>()(['active', 'completed', 'abandoned'])],
    ['fit_challenges', 'status', all<ChallengeStatus>()(['active', 'completed', 'abandoned'])],
    ['food_logs', 'source', all<FoodLogSource>()(['manual', 'photo', 'saved_meal', 'plan'])],
    [
      'workout_sessions',
      'source',
      // 'apple_health' comes from the PROPOSED health_sync.up.sql (checked below); the applied migrations do not have it yet.
      all<SessionSource>()(['manual', 'quick_fit', 'program', 'plan', 'apple_health']).filter(
        (x) => x !== 'apple_health',
      ),
    ],
    [
      'food_log_items',
      'source',
      all<NutritionSource>()([
        'usda_fdc',
        'open_food_facts',
        'curated',
        'user_manual',
        'ai_estimate',
      ]),
    ],
    ['food_log_items', 'confidence', all<Confidence>()(['low', 'medium', 'high'])],
    [
      'readiness_screenings',
      'outcome',
      all<ReadinessOutcome>()(['clear', 'low_impact_and_check_with_professional']),
    ],
    ['workouts', 'style', DANCE_STYLES],
    ['workouts', 'level', LEVELS],
    ['workouts', 'intensity', INTENSITIES],
    ['workouts', 'impact', INTENSITIES],
    ['consents', 'purpose', consentPurposeSchema.options],
    ['daily_plans', 'mode', PLAN_MODES],
    ['profiles', 'unit_system', ['metric', 'imperial']],
    ['profile_private', 'sex', ['female', 'male', 'unspecified']],
    ['profile_private', 'activity_level', ['low', 'light', 'moderate', 'high']],
  ];
  it.each(cases)('%s.%s matches the app', (table, column, app) => {
    expect(dbEnum(table, column)).toEqual(sorted(app));
  });
  it('the proposed health_sync migration adds exactly the apple_health source and its id column, with an insert grant', () => {
    const h = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'supabase', 'proposed', 'health_sync.up.sql'),
      'utf8',
    );
    expect(h).toMatch(/source in \('manual', 'quick_fit', 'program', 'plan', 'apple_health'\)/);
    expect(h).toMatch(/add column external_id text/);
    expect(h).toMatch(/grant insert \(external_id\) on public\.workout_sessions to authenticated/);
  });
  it('workout session status is a superset of what the app writes (planned, completed)', () => {
    const db = dbEnum('workout_sessions', 'status');
    expect(db).toEqual(expect.arrayContaining(['planned', 'completed']));
  });
});

// ---------- column grants ----------
function grants(kind: 'insert' | 'update'): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const m of sql.matchAll(
    new RegExp(`grant ${kind} \\(([^)]*)\\) on public\\.(\\w+) to authenticated`, 'g'),
  )) {
    const set = (out[m[2]!] ??= new Set());
    m[1]!.split(',').forEach((c) => set.add(c.trim()));
  }
  return out;
}
const insertGrants = grants('insert');
const updateGrants = grants('update');

interface Call {
  table?: string;
  op?: string;
  payload?: unknown;
  single?: boolean;
}
const calls: Call[] = [];
let exists = false;
const USER = { id: 'u-contract-1', email: 'c@example.test' };
function builder(c: Call) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'gte', 'lt', 'eq', 'is']) b[m] = () => b;
  for (const m of ['insert', 'update', 'delete', 'upsert'])
    b[m] = (payload?: unknown) => {
      c.op = m;
      c.payload = payload;
      return b;
    };
  b.single = b.maybeSingle = () => ((c.single = true), b);
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({
      data: c.single
        ? c.op
          ? { id: 'row1', created_at: 't' }
          : exists
            ? { user_id: USER.id }
            : null
        : [],
      error: null,
    }).then(res, rej);
  return b;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: USER } }),
      getSession: async () => ({ data: { session: { user: USER } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (table: string) => {
      const c: Call = { table };
      calls.push(c);
      return builder(c);
    },
    rpc: () => builder({}),
  }),
}));
const { createSupabaseStore } = await import('./supabaseStore');

const store = () =>
  createSupabaseStore({
    url: 'https://placeholder.supabase.example.test',
    publishableKey: 'sb_publishable_placeholder',
    storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
  });

const item = {
  foodId: 'white-rice',
  name: 'White rice, cooked',
  grams: 150,
  kcal: 195,
  proteinG: 4,
  carbsG: 42,
  fatG: 0.5,
  kcalLow: 180,
  kcalHigh: 210,
  source: 'curated',
  confidence: 'high',
  userEdited: false,
} as never;
const plan = {
  days: [{ dayIndex: 0, meals: [{ mealType: 'lunch', items: [item] }], totals: {} }],
  budgetLevel: 'low',
  avgCostTier: 1,
  targetKcal: 1800,
} as never;

beforeEach(() => {
  calls.length = 0;
  exists = false;
});

describe('grant contract: every column the adapter writes is granted to authenticated', () => {
  async function runWrites() {
    const s = store();
    for (const e of [false, true]) {
      exists = e;
      await s.savePrivate({
        birthDate: '1990-01-01',
        heightCm: 170,
        sex: 'female',
        activityLevel: 'light',
      });
    }
    exists = false;
    await s.updateProfile({
      displayName: 'A',
      country: 'GH',
      locale: 'en',
      timeZone: 'Africa/Accra',
      unitSystem: 'metric',
    });
    await s.setConsent('health_data_processing', true);
    await s.createGoal({
      type: 'lose',
      period: 'weekly',
      startDate: '2026-06-01',
      endDate: '2026-06-08',
      startKg: 80,
      targetKg: 79.5,
    });
    await s.setGoalStatus('g', 'abandoned');
    await s.addWeight({ weightKg: 70, measuredAt: '2026-06-01T00:00:00Z' });
    await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-01T12:00:00Z',
      items: [item],
    });
    await s.updateFoodItem('i', item);
    await s.saveMeal({ name: 'M', mealType: 'lunch', items: [item] });
    await s.createMealPlan({
      name: 'P',
      startDate: '2026-06-01',
      budgetLevel: 'low',
      budgetCents: 1000,
      currency: 'USD',
      plan,
    });
    const sess = {
      title: 'T',
      minutes: 10,
      status: 'completed' as const,
      durationS: 600,
      perceivedExertion: 5,
      lowImpact: false,
      source: 'quick_fit' as const,
      workoutId: 'qf5-lowimpact-reset',
    };
    await s.createSession(sess);
    await s.createSessions([sess, { ...sess, status: 'planned', plannedFor: '2026-06-02' }]);
    await s.updateSession('s', {
      status: 'completed',
      durationS: 60,
      perceivedExertion: 3,
      lowImpact: true,
      plannedFor: '2026-06-03',
    });
    await s.startChallenge({ lengthDays: 7, targetDays: 3, startDate: '2026-06-01' });
    await s.setChallengeStatus('c', 'completed');
    await s.saveReadiness({} as never);
    await s.addHabit('Stretch');
    await s.archiveHabit('h');
    await s.setHabitDone('h', '2026-06-01', true);
    await s.addWellness!({
      kind: 'walk',
      day: '2026-06-01',
      amount: 20,
      amount2: 1.5,
      label: null,
      clientKey: 'contract-key-1',
    });
    for (const e of [false, true]) {
      exists = e;
      await s.setWellnessPrefs!({ goalIntent: 'maintain' });
    }
    exists = false;
  }

  it('covers inserts and updates for onboarding, goals, weight, food, workouts and challenges', async () => {
    await runWrites();
    const writes = calls.filter((c) => c.op === 'insert' || c.op === 'update');
    expect(writes.length).toBeGreaterThan(15);
    const bad: string[] = [];
    for (const w of writes) {
      const granted = (w.op === 'insert' ? insertGrants : updateGrants)[w.table!];
      if (!granted) {
        bad.push(`${w.op} on ${w.table}: no column grant at all`);
        continue;
      }
      const rows = Array.isArray(w.payload) ? w.payload : [w.payload];
      for (const r of rows)
        for (const k of Object.keys(r as object))
          if (!granted.has(k)) bad.push(`${w.op} ${w.table}.${k} is not granted`);
    }
    expect(bad).toEqual([]);
    const tables = new Set(writes.map((w) => w.table));
    for (const t of [
      'profile_private',
      'profiles',
      'consents',
      'goals',
      'weight_entries',
      'food_logs',
      'food_log_items',
      'saved_meals',
      'meal_plans',
      'meal_plan_items',
      'workout_sessions',
      'fit_challenges',
      'readiness_screenings',
      'habits',
      'habit_checkins',
      'wellness_entries',
      'wellness_prefs',
    ])
      expect(tables.has(t), `${t} was exercised`).toBe(true);
  });

  it('the coach writes (plans, decisions, AI pause, photo saved) use granted columns', () => {
    const coach: Array<[string, 'insert' | 'update', string[]]> = [
      ['daily_plans', 'insert', ['plan_date', 'mode', 'generated_by']],
      [
        'daily_plan_items',
        'insert',
        ['plan_id', 'position', 'kind', 'title', 'detail', 'why', 'ref'],
      ],
      ['coach_actions', 'update', ['status']],
      ['daily_plan_items', 'update', ['done_at']],
      ['ai_preferences', 'insert', ['ai_paused']],
      ['ai_preferences', 'update', ['ai_paused']],
      ['food_photo_analyses', 'update', ['saved']],
      ['goals', 'update', ['status']],
    ];
    for (const [t, op, cols] of coach) {
      const g = (op === 'insert' ? insertGrants : updateGrants)[t];
      expect(g, `${op} grant on ${t}`).toBeDefined();
      for (const c of cols) expect(g!.has(c), `${op} ${t}.${c}`).toBe(true);
    }
  });

  it('server-only columns are never granted to the app', () => {
    for (const [t, c] of [
      ['profiles', 'onboarded_at'],
      ['weight_entries', 'user_id'],
      ['workout_sessions', 'user_id'],
      ['food_photo_analyses', 'status'],
      ['fit_challenges', 'user_id'],
      ['goals', 'planned_weekly_change_kg'],
    ] as const) {
      expect(insertGrants[t]?.has(c) ?? false, `insert ${t}.${c}`).toBe(false);
      expect(updateGrants[t]?.has(c) ?? false, `update ${t}.${c}`).toBe(false);
    }
  });
});
