import { useMemo } from 'react';
import {
  calorieNeedsFromRecords,
  energyGuideFromTargets,
  DEFAULT_PREFS,
  localDateKey,
  totals,
  type EnergyGuide,
  type Totals,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { FoodLog } from '@/data/types';

/** Diary, today's totals and the rough daily energy guide, recomputed whenever the store changes. */
export function useFoodData(): {
  logs: FoodLog[];
  todayLogs: FoodLog[];
  todayTotals: Totals;
  guide: EnergyGuide | null;
  loading: boolean;
  error: string | null;
  todayKey: string;
  timeZone: string | null;
} {
  const { profile } = useApp();
  const { data, loading, error } = useLoad(async (s) => ({
    logs: await s.listFoodLogs(),
    priv: await s.getPrivate(),
    weights: await s.listWeights(),
    goals: await s.listGoals(),
    prefs: (await s.getWellnessPrefs?.()) ?? null,
    readiness: await s.latestReadiness(),
  }));
  const timeZone = profile?.timeZone ?? null;
  return useMemo(() => {
    const logs = data?.logs ?? [];
    const todayKey = localDateKey(new Date(), timeZone);
    const todayLogs = logs.filter((l) => localDateKey(l.loggedAt, timeZone) === todayKey);
    const todayTotals = totals(todayLogs.flatMap((l) => l.items));
    // One calculator for the whole app: the same engine (and the same safety rules) as the Goals screen.
    const latest = [...(data?.weights ?? [])].sort((a, b) =>
      b.measuredAt.localeCompare(a.measuredAt),
    )[0];
    const guide: EnergyGuide | null =
      data?.priv && latest
        ? energyGuideFromTargets(
            calorieNeedsFromRecords({
              prefs: data.prefs ?? DEFAULT_PREFS,
              readinessOutcome: data.readiness?.outcome ?? null,
              priv: data.priv,
              latestWeightKg: latest.weightKg,
              goals: data.goals ?? [],
              now: new Date(),
            }),
          )
        : null;
    return { logs, todayLogs, todayTotals, guide, loading, error, todayKey, timeZone };
  }, [data, loading, error, timeZone]);
}
