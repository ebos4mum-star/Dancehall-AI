import { useMemo } from 'react';
import {
  energyGuideFor,
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
  }));
  const timeZone = profile?.timeZone ?? null;
  return useMemo(() => {
    const logs = data?.logs ?? [];
    const todayKey = localDateKey(new Date(), timeZone);
    const todayLogs = logs.filter((l) => localDateKey(l.loggedAt, timeZone) === todayKey);
    const todayTotals = totals(todayLogs.flatMap((l) => l.items));
    let guide: EnergyGuide | null = null;
    const latest = [...(data?.weights ?? [])].sort((a, b) =>
      b.measuredAt.localeCompare(a.measuredAt),
    )[0];
    if (data?.priv && latest) {
      const goal = (data.goals ?? [])
        .filter((g) => g.status === 'active')
        .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
      const age = Math.floor(
        (Date.now() - Date.parse(`${data.priv.birthDate}T00:00:00Z`)) / (365.25 * 86_400_000),
      );
      guide = energyGuideFor({
        weightKg: latest.weightKg,
        heightCm: data.priv.heightCm,
        ageYears: age,
        sex: data.priv.sex,
        activity: data.priv.activityLevel,
        weeklyChangeKg: goal?.plannedWeeklyChangeKg ?? 0,
      });
    }
    return { logs, todayLogs, todayTotals, guide, loading, error, todayKey, timeZone };
  }, [data, loading, error, timeZone]);
}
