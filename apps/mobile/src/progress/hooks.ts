import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { haptics } from '@/ui/haptics';
import {
  computeAchievements,
  newlyEarned,
  weeklyHabits,
  type AchievementId,
  type Achievement,
  type WeeklyHabits,
} from './achievements';
import { deviceSeenStore, readSeen, writeSeen, type SeenStore } from './seen';

export interface ProgressInsights {
  achievements: Achievement[];
  habits: WeeklyHabits;
  /** Earned since the person last looked; shown once, then remembered. */
  fresh: AchievementId[];
  loading: boolean;
}

export function useProgressInsights(seenStore: SeenStore = deviceSeenStore): ProgressInsights {
  const { session, profile } = useApp();
  const { data, loading } = useLoad(async (s) => ({
    sessions: await s.listSessions(),
    foodLogs: await s.listFoodLogs(),
  }));
  const tz = profile?.timeZone ?? null;
  const base = useMemo(() => {
    const input = { sessions: data?.sessions ?? [], foodLogs: data?.foodLogs ?? [], timeZone: tz };
    return { achievements: computeAchievements(input), habits: weeklyHabits(input, new Date()) };
  }, [data, tz]);

  const [fresh, setFresh] = useState<AchievementId[]>([]);
  const celebrated = useRef(new Set<string>());
  const userId = session?.userId;
  useEffect(() => {
    if (!userId || !data) return;
    let live = true;
    void (async () => {
      const seen = await readSeen(seenStore, userId);
      const ids = base.achievements.map((a) => a.id);
      const add = newlyEarned(base.achievements, seen).filter((id) => !celebrated.current.has(id));
      if (!live) return;
      if (add.length > 0) {
        add.forEach((id) => celebrated.current.add(id));
        setFresh(add);
        haptics.success();
      }
      await writeSeen(seenStore, userId, ids);
    })();
    return () => {
      live = false;
    };
  }, [userId, data, base.achievements, seenStore]);

  return { ...base, fresh, loading };
}
