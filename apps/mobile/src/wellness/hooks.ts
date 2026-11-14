import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PREFS,
  numbersHidden,
  parsePrefs,
  ageYearsOn,
  localDateKey,
  nutritionTargets,
  waterGuideMl,
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
    return {
      prefs,
      targets,
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
