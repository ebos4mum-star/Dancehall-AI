import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeGamification, localDateKey, normalizePrefs, type GmState } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { GmServerState } from '@/data/types';
import { setPulseCosmetics } from '@/pulse/cosmetics';
import {
  DEFAULT_DEVICE_PREFS,
  deviceRaw,
  readGmPrefs,
  writeGmPrefs,
  type GmDevicePrefs,
} from './prefs';

export interface Progression {
  ready: boolean;
  enabled: boolean;
  /** What the screens show: the server's answer when it gave one, otherwise the shared engine over the same records. */
  state: Pick<
    GmState,
    | 'level'
    | 'streak'
    | 'restNudge'
    | 'dailyQuests'
    | 'weeklyQuests'
    | 'badges'
    | 'cosmetics'
    | 'totalXp'
    | 'weekXp'
  > & {
    seasonal: { id: string; activeDays: number; goalDays: number; done: boolean };
  };
  fromServer: boolean;
  prefs: GmDevicePrefs;
  setPrefs(patch: Partial<GmDevicePrefs>): Promise<void>;
}

const LOOKBACK_DAYS = 75;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * Progression for the signed-in person, read from the records the app already stores (workouts, meal-log days, habit ticks). Nothing here asks for new data. In a
 * build with the Friends server the same engine also runs there and records the result; the screens then show the server's numbers. Guests and people who switch
 * progression off get `enabled: false` and the screens render nothing.
 */
export function useGamification(): Progression {
  const { store, session, profile } = useApp();
  const userId = session?.userId ?? null;
  const tz = profile?.timeZone ?? null;
  const [prefs, setPrefsState] = useState<GmDevicePrefs>(DEFAULT_DEVICE_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [server, setServer] = useState<GmServerState | null>(null);

  useEffect(() => {
    let alive = true;
    setPrefsReady(false);
    if (!userId) return;
    void readGmPrefs(deviceRaw, userId).then((p) => {
      if (alive) {
        setPrefsState(p);
        setPrefsReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const since = localDateKey(daysAgo(LOOKBACK_DAYS), tz);
  const data = useLoad(async (s) => ({
    sessions: await s.listSessions(),
    foodLogs: await s.listFoodLogs({ fromIso: daysAgo(LOOKBACK_DAYS).toISOString() }),
    habits: await s.listHabits(),
    checkins: await s.listHabitCheckins(since),
  }));

  const local = useMemo(() => {
    if (!data.data) return null;
    const today = localDateKey(new Date(), tz);
    return computeGamification({
      today,
      timeZone: tz,
      sessions: data.data.sessions.map((x) => ({
        id: x.id,
        status: x.status,
        completedAt: x.completedAt,
        durationS: x.durationS,
        minutes: x.minutes,
        source: x.source,
        style: x.style,
        lowImpact: x.lowImpact,
        workoutId: x.workoutId,
        title: x.title,
      })),
      mealLogDays: [...new Set(data.data.foodLogs.map((l) => localDateKey(l.loggedAt, tz)))],
      habitDays: data.data.checkins.map((c) => ({ day: c.day, habitId: c.habitId })),
      activeHabitCount: data.data.habits.length,
      prefs,
    });
  }, [data.data, tz, prefs]);

  // The server run (when there is one) records progression and is the number shown. At most one call a minute, and never for someone who switched progression off.
  const lastSync = useRef(0);
  useEffect(() => {
    if (!local || !prefs.enabled || !store.gmSync || !userId) return;
    if (Date.now() - lastSync.current < 60_000) return;
    lastSync.current = Date.now();
    let alive = true;
    const n = normalizePrefs(prefs);
    void store
      .gmSync({ targetDaysPerWeek: n.targetDaysPerWeek, restWeekdays: [...n.restWeekdays] })
      .then((r) => alive && setServer(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [local, prefs, store, userId]);

  useEffect(() => {
    if (!userId) setServer(null);
  }, [userId]);

  const shown = useMemo(() => {
    if (!local) return null;
    if (server) return { ...server, seasonal: server.seasonal };
    return {
      ...local,
      seasonal: {
        id: local.seasonal.season.id,
        activeDays: local.seasonal.activeDays,
        goalDays: local.seasonal.season.goalDays,
        done: local.seasonal.done,
      },
    };
  }, [local, server]);

  const cosmetics = shown?.cosmetics;
  const showRewards = prefs.enabled;
  useEffect(() => {
    setPulseCosmetics(showRewards && cosmetics ? cosmetics : []);
  }, [cosmetics, showRewards]);

  const setPrefs = useCallback(
    async (patch: Partial<GmDevicePrefs>) => {
      if (!userId) return;
      const next: GmDevicePrefs = {
        ...normalizePrefs({ ...prefs, ...patch }),
        levelSeen: patch.levelSeen ?? prefs.levelSeen,
      };
      setPrefsState(next);
      await writeGmPrefs(deviceRaw, userId, next);
      lastSync.current = 0;
    },
    [prefs, userId],
  );

  return {
    ready: prefsReady && !!shown,
    enabled: !!userId && prefs.enabled,
    state: (shown ?? (null as never)) as Progression['state'],
    fromServer: !!server,
    prefs,
    setPrefs,
  };
}
