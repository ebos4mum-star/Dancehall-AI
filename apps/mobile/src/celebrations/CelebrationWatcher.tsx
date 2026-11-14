import { useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDaysIso, localDateKey, parsePrefs, type CelebrationLevel } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { showMoment } from '@/pulse/moment';
import { haptics } from '@/ui/haptics';
import { runCelebrations } from './run';

const GAP_MS = 3200; // a little longer than one moment, so each one is seen
const MAX_PER_RUN = 3;
const kv = {
  get: (k: string) => AsyncStorage.getItem(k),
  set: (k: string, v: string) => AsyncStorage.setItem(k, v),
};

/**
 * Mounted once at the root. When the person's own records show a goal reached for a day, week, month or year, Pulse celebrates it (the existing
 * animated moment, reduced-motion aware), once. Renders nothing. Weight, calorie and food numbers are never celebrated.
 */
export function CelebrationWatcher() {
  const { session, profile, store } = useApp();
  const tz = profile?.timeZone ?? null;
  const today = localDateKey(new Date(), tz);
  const { data } = useLoad(async (s) => {
    const prefsRaw = s.getWellnessPrefs ? await s.getWellnessPrefs() : null;
    const prefs = parsePrefs(prefsRaw);
    const habits = await s.listHabits();
    return {
      // Only goals the person configured. The general water guide is not their goal, so it is never celebrated.
      waterGoalMl: prefs.waterGoalMl,
      dailyMovementMinutes: prefs.dailyMovementMinutes,
      weeklyMinutesGoal: prefs.exerciseMinutesPerWeek,
      monthlyWeeksGoal: prefs.monthlyGoalWeeks,
      yearlyWeeksGoal: prefs.yearlyGoalWeeks,
      level: prefs.celebrations,
      entries: s.listWellness ? await s.listWellness(`${today.slice(0, 4)}-01-01`) : [],
      sessions: await s.listSessions(),
      habits: {
        activeIds: habits.map((h) => h.id),
        checkins: await s.listHabitCheckins(addDaysIso(today, -1)),
      },
    };
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const latest = useRef(data);
  latest.current = data;
  const running = useRef(false);
  const remote = useMemo(
    () =>
      store.listCelebrations && store.recordCelebrations
        ? {
            list: () => store.listCelebrations!(),
            record: (items: Array<{ id: string; mode: CelebrationLevel }>) =>
              store.recordCelebrations!(items),
          }
        : null,
    [store],
  );

  useEffect(() => {
    if (!data || !session || running.current) return;
    running.current = true;
    // Evaluate, and if the data changed meanwhile evaluate again, one run at a time so two runs never race over the ledger.
    void (async () => {
      try {
        let d = latest.current;
        while (d && session) {
          const { level, ...rest } = d;
          const due = await runCelebrations({
            kv,
            userId: session.userId,
            input: { today, timeZone: tz, ...rest },
            level,
            remote,
          });
          due.slice(0, MAX_PER_RUN).forEach((c, i) => {
            timers.current.push(
              setTimeout(() => {
                // Gentle: the same Pulse in its calm state, no haptic. Full: the celebration and a brief haptic.
                showMoment(
                  t(`cel.${c.period}.${c.kind}` as StringKey),
                  level === 'full' ? 'celebrate' : 'encourage',
                );
                if (level === 'full') haptics.celebrate();
              }, i * GAP_MS),
            );
          });
          if (latest.current === d) break;
          d = latest.current;
        }
      } catch {
        /* a failed ledger write must never disturb the app; it is retried on the next change */
      } finally {
        running.current = false;
      }
    })();
  }, [data, session, today, tz, remote]);

  return null;
}
