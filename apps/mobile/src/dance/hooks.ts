import { useMemo } from 'react';
import { activitySummary, localDateKey, type ActivitySummary } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { WorkoutSession } from '@/data/types';

export interface DanceData {
  sessions: WorkoutSession[];
  loading: boolean;
  error: string | null;
  todayKey: string;
  todayPlanned: WorkoutSession[];
  doneToday: WorkoutSession[];
  upcoming: WorkoutSession[];
  overdue: WorkoutSession[];
  summary: ActivitySummary;
  /** True when the readiness screening routed the person to low-impact options. */
  lowImpactDefault: boolean;
}

export function useDanceData(): DanceData {
  const { profile } = useApp();
  const { data, loading, error } = useLoad(async (s) => ({
    sessions: await s.listSessions(),
    readiness: await s.latestReadiness(),
  }));
  const tz = profile?.timeZone ?? null;
  return useMemo(() => {
    const sessions = data?.sessions ?? [];
    const todayKey = localDateKey(new Date(), tz);
    const planned = sessions.filter((s) => s.status === 'planned' && s.plannedFor);
    const byDate = (a: WorkoutSession, b: WorkoutSession) =>
      (a.plannedFor ?? '').localeCompare(b.plannedFor ?? '');
    return {
      sessions,
      loading,
      error,
      todayKey,
      todayPlanned: planned.filter((s) => s.plannedFor === todayKey),
      doneToday: sessions.filter(
        (s) =>
          s.status === 'completed' && s.completedAt && localDateKey(s.completedAt, tz) === todayKey,
      ),
      upcoming: planned.filter((s) => (s.plannedFor ?? '') > todayKey).sort(byDate),
      overdue: planned.filter((s) => (s.plannedFor ?? '') < todayKey).sort(byDate),
      summary: activitySummary(sessions, { timeZone: tz, now: new Date() }),
      lowImpactDefault: data?.readiness?.outcome === 'low_impact_and_check_with_professional',
    };
  }, [data, loading, error, tz]);
}
