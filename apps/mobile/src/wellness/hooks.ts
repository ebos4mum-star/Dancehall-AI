import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PREFS,
  numbersHidden,
  parsePrefs,
  ageYearsOn,
  localDateKey,
  nutritionTargets,
  readinessState,
  resolvePathways,
  showWeight,
  waterGuideMl,
  weightTrackingOn,
  type EngineOutput,
  type NutritionTargets,
  type WellnessEntry,
  type WellnessEntryInput,
  type WellnessPrefs,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { addDaysIso } from '@dancehall/shared';

export interface WellnessData {
  prefs: WellnessPrefs;
  entries: WellnessEntry[];
  todayKey: string;
  waterGoalMl: number;
  /** Explainable nutrition targets, or an explanation of why there are none. */
  targets: NutritionTargets;
  /** The Stage A engine's output for this person: pathways with reasons, plan bias, progress lens and habit ideas. */
  engine: EngineOutput;
  /** Weight is shown and asked for only when the person tracks it (opt-in) and their numbers are not hidden. */
  weightShown: boolean;
  /** Whether weight tracking is on, ignoring hidden numbers (what the toggle shows). */
  weightOn: boolean;
  /** Names of the person's active habits, for the habit ideas. */
  habitNames: string[];
  loading: boolean;
  error: string | null;
  /** Loads again after a failed read. */
  reload: () => void;
  /** Records an entry once. Overlapping taps while one is being saved are ignored. */
  add: (input: Omit<WellnessEntryInput, 'day'> & { day?: string }) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  setPrefs: (patch: Partial<WellnessPrefs>) => Promise<void>;
  busy: boolean;
  problem: string | null;
}

/** Preferences, the last 60 days of optional logs and the nutrition targets, refreshed whenever the store changes. */
export function useWellness(): WellnessData {
  const { store, profile } = useApp();
  const { data, loading, error, reload } = useLoad(async (s) => {
    const todayKey = localDateKey(new Date(), profile?.timeZone ?? null);
    return {
      prefs: (await s.getWellnessPrefs?.()) ?? DEFAULT_PREFS,
      entries: (await s.listWellness?.(addDaysIso(todayKey, -60))) ?? [],
      priv: await s.getPrivate(),
      weights: await s.listWeights(),
      goals: await s.listGoals(),
      readiness: await s.latestReadiness(),
      habits: await s.listHabits(),
    };
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const tz = profile?.timeZone ?? null;
  const todayKey = localDateKey(new Date(), tz);

  const derived = useMemo(() => {
    const prefs = data?.prefs ?? DEFAULT_PREFS;
    const latest = [...(data?.weights ?? [])].sort((a, b) =>
      b.measuredAt.localeCompare(a.measuredAt),
    )[0];
    const priv = data?.priv ?? null;
    const goal = (data?.goals ?? []).find((g) => g.status === 'active' && g.type === 'lose');
    const targets = nutritionTargets({
      intent: prefs.goalIntent,
      tracking: prefs.tracking,
      weightKg: latest?.weightKg ?? null,
      heightCm: priv?.heightCm ?? null,
      ageYears: priv ? ageYearsOn(priv.birthDate, new Date()) : null,
      sex: priv?.sex ?? null,
      activity: priv?.activityLevel ?? null,
      targetKg: goal?.targetKg ?? null,
      pregnantOrPostpartum: prefs.pregnantOrPostpartum,
      eatingConcern: prefs.eatingConcern,
      readinessCautious: data?.readiness?.outcome === 'low_impact_and_check_with_professional',
    });
    const hasActiveWeightGoal = (data?.goals ?? []).some((g) => g.status === 'active');
    const activeHabits = data?.habits ?? [];
    const engine = resolvePathways({
      prefs,
      readiness: readinessState(data?.readiness?.outcome),
      body: priv
        ? {
            weightKg: latest?.weightKg ?? null,
            heightCm: priv.heightCm ?? null,
            ageYears: ageYearsOn(priv.birthDate, new Date()),
            sex: priv.sex ?? null,
            activity: priv.activityLevel ?? null,
            targetKg: goal?.targetKg ?? null,
          }
        : undefined,
      habits: { active: activeHabits.length, names: activeHabits.map((h) => h.name) },
      hasActiveWeightGoal,
    });
    return {
      prefs,
      targets,
      engine,
      weightOn: weightTrackingOn(prefs, hasActiveWeightGoal),
      weightShown: showWeight(prefs, hasActiveWeightGoal),
      habitNames: activeHabits.map((h) => h.name),
      waterGoalMl: prefs.waterGoalMl ?? waterGuideMl(latest?.weightKg ?? null),
    };
  }, [data]);

  const add = useCallback<WellnessData['add']>(
    async (input) => {
      if (inFlight.current || !store.addWellness) return false;
      inFlight.current = true;
      setBusy(true);
      setProblem(null);
      try {
        await store.addWellness({
          ...input,
          day: input.day ?? todayKey,
          clientKey:
            input.clientKey ??
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        });
        return true;
      } catch (e) {
        setProblem(errorMessage(e));
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [store, todayKey],
  );
  const remove = useCallback(
    async (id: string) => {
      try {
        await store.deleteWellness?.(id);
      } catch (e) {
        setProblem(errorMessage(e));
      }
    },
    [store],
  );
  const setPrefs = useCallback(
    async (patch: Partial<WellnessPrefs>) => {
      try {
        setProblem(null);
        await store.setWellnessPrefs?.(patch);
      } catch (e) {
        setProblem(errorMessage(e));
      }
    },
    [store],
  );

  return {
    prefs: derived.prefs,
    entries: data?.entries ?? [],
    todayKey,
    waterGoalMl: derived.waterGoalMl,
    targets: derived.targets,
    engine: derived.engine,
    weightShown: derived.weightShown,
    weightOn: derived.weightOn,
    habitNames: derived.habitNames,
    loading,
    error,
    reload,
    add,
    remove,
    setPrefs,
    busy,
    problem,
  };
}

/**
 * True when the person said food or weight can be hard, is pregnant or postpartum, or chose no numbers. Screens that show calorie totals,
 * energy guides or macro summaries hide them. Also true while the setting is still loading or could not be read, so numbers are never shown by mistake.
 */
export function useNumbersHidden(): boolean {
  const { data, loading, error } = useLoad(async (s) => (await s.getWellnessPrefs?.()) ?? null);
  if (loading || error) return true;
  const p = parsePrefs(data);
  return numbersHidden(p);
}

/**
 * Whether weight may be shown or asked for, and whether tracking is on. `shown` needs the person's opt-in (lose and maintain goals or an active weight goal keep it
 * on by default) AND numbers not hidden. Both are false while loading or on error, so weight is never flashed at someone who has not chosen it.
 */
export function useWeightState(): { shown: boolean; on: boolean } {
  const { data, loading, error } = useLoad(async (s) => ({
    prefs: (await s.getWellnessPrefs?.()) ?? null,
    goals: await s.listGoals(),
  }));
  if (loading || error || !data) return { shown: false, on: false };
  const prefs = parsePrefs(data.prefs);
  const goal = data.goals.some((g) => g.status === 'active');
  return { shown: showWeight(prefs, goal), on: weightTrackingOn(prefs, goal) };
}

/** True when weight may be shown or asked for. See `useWeightState`. */
export function useShowWeight(): boolean {
  return useWeightState().shown;
}
