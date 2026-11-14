import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDaysIso,
  localDateKey,
  waterGuideMl,
  parsePrefs,
  type Celebration,
} from '@dancehall/shared';
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
  const { session, profile } = useApp();
  const tz = profile?.timeZone ?? null;
  const today = localDateKey(new Date(), tz);
  const { data } = useLoad(async (s) => {
    const prefsRaw = s.getWellnessPrefs ? await s.getWellnessPrefs() : null;
    const prefs = parsePrefs(prefsRaw);
    const weights = await s.listWeights();
    const latest = [...weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
    const habits = await s.listHabits();
    return {
      waterGoalMl: prefs.waterGoalMl ?? waterGuideMl(latest?.weightKg ?? null),
      weeklyMinutesGoal: prefs.exerciseMinutesPerWeek,
      entries: s.listWellness ? await s.listWellness(`${today.slice(0, 4)}-01-01`) : [],
      sessions: await s.listSessions(),
      habits: {
        activeIds: habits.map((h) => h.id),
        checkins: await s.listHabitCheckins(addDaysIso(today, -1)),
      },
    };
  });
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!data || !session || busy.current) return;
    busy.current = true;
    runCelebrations({ kv, userId: session.userId, input: { today, timeZone: tz, ...data } })
      .then((due: Celebration[]) => {
        due.slice(0, MAX_PER_RUN).forEach((c, i) => {
          timers.current.push(
            setTimeout(() => {
              showMoment(t(`cel.${c.period}.${c.kind}` as StringKey));
              haptics.celebrate();
            }, i * GAP_MS),
          );
        });
      })
      .catch(() => undefined) // a failed ledger write must never disturb the app; it will be retried on the next change
      .finally(() => {
        busy.current = false;
      });
  }, [data, session, today, tz]);

  return null;
}
