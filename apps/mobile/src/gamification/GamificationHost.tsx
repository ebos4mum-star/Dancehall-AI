import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activeDaySet,
  computeGamification,
  localDateKey,
  normalizePrefs,
  parsePrefs,
  type CosmeticId,
} from '@dancehall/shared';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { activityEventsOf, firstRecordDay } from './history';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { GmServerState } from '@/data/types';
import { t, type StringKey } from '@/i18n';
import { showMoment, type Flourish } from '@/pulse/moment';
import { setPulseCosmetics } from '@/pulse/cosmetics';
import { haptics } from '@/ui/haptics';
import { createCoalescedSync } from './coalescedSync';
import { celebrationPolicy } from './policy';
import {
  DEFAULT_DEVICE_PREFS,
  deviceRaw,
  wornCosmetics,
  readGmPrefs,
  readSeen,
  writeGmPrefs,
  writeSeen,
  type GmDevicePrefs,
} from './prefs';
import {
  setProgression,
  registerProgressionActions,
  type ConfirmedState,
  type RewardEvent,
} from './progressionStore';
import {
  EMPTY_SEEN,
  NO_REWARD,
  diffRewards,
  hasReward,
  primaryReaction,
  snapshotOf,
  takeToast,
  type PrimaryReaction,
  type SeenState,
} from './rewards';

const LOOKBACK_DAYS = 75;
const DEBOUNCE_MS = 300;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const groupsKey = (userId: string) => `dh.gm.groups.v1.${userId}`;

const FLOURISH: Record<Exclude<PrimaryReaction, null | 'xp'>, Flourish> = {
  level_up: 'stars',
  badge: 'shield',
  streak: 'flame',
  season: 'confetti',
  cosmetic: 'stars',
  quest: 'heart',
};
export const flourishFor = (r: PrimaryReaction): Flourish | undefined =>
  r && r !== 'xp' ? FLOURISH[r] : undefined;

/** Words for the toast of the most important reward. */
function toastMessage(r: Exclude<PrimaryReaction, null | 'xp'>, s: RewardEvent['summary']): string {
  switch (r) {
    case 'level_up':
      return t('gm.levelUp', { n: s.levelUp ?? 0 });
    case 'badge':
      return t('gm.toast.badge', { name: t(`gm.b.${s.badges[0]}` as StringKey) });
    case 'streak':
      return t('gm.toast.streak', { n: s.streakMilestone ?? 0 });
    case 'season':
      return t('gm.seasonDone');
    case 'cosmetic':
      return t('gm.toast.cosmetic', { name: t(`gm.c.${s.cosmetics[0]}` as StringKey) });
    case 'quest':
      return t('gm.toast.quest', { name: t(`gm.q.${s.questsDone[0]}` as StringKey) });
  }
}

const toConfirmed = (s: GmServerState, weekFallback: number): ConfirmedState => ({
  totalXp: s.totalXp,
  weekXp: s.weekXp ?? weekFallback,
  level: s.level,
  streak: s.streak,
  restNudge: s.restNudge,
  dailyQuests: s.dailyQuests,
  weeklyQuests: s.weeklyQuests,
  badges: s.badges,
  cosmetics: s.cosmetics,
  seasonal: s.seasonal,
});

/**
 * Mounted once at the root. It is the ONLY place that asks for the person's progression and decides what to celebrate, so every screen shows the same confirmed numbers.
 *  - Numbers and rewards are shown only from a CONFIRMED answer: the server's (when this build has one) or the engine's over the person's own records (when it has none, or the
 *    server could not answer). Nothing is shown as earned before that.
 *  - A change is re-checked within a fraction of a second, a burst is one request, an unchanged fingerprint is no request, and the newest answer always wins (coalescedSync.ts).
 *  - What is celebrated, and how, is decided by one policy (policy.ts) from the person's "Pulse celebrations" setting and the phone's Reduce Motion setting.
 * Renders nothing.
 */
export function GamificationHost() {
  const { store, session, profile } = useApp();
  const reduced = useReducedMotion();
  const userId = session?.userId ?? null;
  const tz = profile?.timeZone ?? null;
  const [prefs, setPrefsState] = useState<GmDevicePrefs>(DEFAULT_DEVICE_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const seenRef = useRef<SeenState>(EMPTY_SEEN);
  const levelRef = useRef<'off' | 'gentle' | 'full'>('full');
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const importedRef = useRef(0);
  const seq = useRef(0);
  const todayRef = useRef(localDateKey(new Date(), tz));
  todayRef.current = localDateKey(new Date(), tz);

  useEffect(() => {
    let alive = true;
    setPrefsReady(false);
    seenRef.current = EMPTY_SEEN;
    setProgression({ ready: false, state: null, reward: null, enabled: false });
    if (!userId) return;
    void Promise.all([readGmPrefs(deviceRaw, userId), readSeen(deviceRaw, userId)]).then(
      ([p, s]) => {
        if (!alive) return;
        seenRef.current = s;
        setProgression({ badgeRecorded: s.badgeRecorded });
        setPrefsState(p);
        setPrefsReady(true);
      },
    );
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
    celebrations: parsePrefs(s.getWellnessPrefs ? await s.getWellnessPrefs() : null).celebrations,
  }));
  levelRef.current = data.data?.celebrations ?? levelRef.current;

  const engineInput = useMemo(() => {
    if (!data.data) return null;
    return {
      today: localDateKey(new Date(), tz),
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
    };
  }, [data.data, tz, prefs]);
  const local = useMemo(
    () => (engineInput ? computeGamification(engineInput) : null),
    [engineInput],
  );
  const weekDots = useMemo(() => {
    if (!engineInput) return null;
    const active = activeDaySet(engineInput);
    const n = normalizePrefs(prefs);
    const rest = new Set(n.restWeekdays);
    const today = engineInput.today;
    const mondayOffset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.parse(`${today}T00:00:00Z`) + (i - mondayOffset) * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      if (active.has(key)) return 'active' as const;
      if (key > today) return rest.has(d.getUTCDay()) ? ('rest' as const) : ('future' as const);
      if (rest.has(d.getUTCDay())) return 'rest' as const;
      return key === today ? ('open' as const) : ('missed' as const);
    });
  }, [engineInput, prefs]);
  useEffect(() => {
    if (weekDots) setProgression({ weekDots });
  }, [weekDots]);
  // The XP history and badge dates are derived in memory from the same records and the same engine result. Nothing is stored for them.
  useEffect(() => {
    if (!local || !engineInput) {
      setProgression({ history: null });
      return;
    }
    const events = activityEventsOf(local.events);
    const workoutDays = local.events.filter((e) => e.kind === 'workout').map((e) => e.day);
    setProgression({
      history: {
        today: engineInput.today,
        events,
        localActivityXp: events.reduce((a, e) => a + e.xp, 0),
        firstRecord: firstRecordDay(engineInput, workoutDays),
        engineEvents: local.events,
        input: engineInput,
      },
    });
  }, [local, engineInput]);
  const localRef = useRef(local);
  localRef.current = local;

  // What the person sees depends on this fingerprint only: the records and settings that decide progression.
  const key = useMemo(() => {
    if (!local) return null;
    const n = normalizePrefs(prefs);
    return JSON.stringify([
      n.enabled,
      n.targetDaysPerWeek,
      n.restWeekdays,
      local.totalXp,
      local.streak.current,
      local.dailyQuests.map((q) => q.done),
      local.weeklyQuests.map((q) => q.done),
      local.badges,
      local.seasonal.done,
      local.events.length,
    ]);
  }, [local, prefs]);

  // ---- confirming an answer, diffing it against what was already shown, and celebrating what is new ----
  const confirm = useRef<(c: ConfirmedState, fromServer: boolean) => void>(() => undefined);
  confirm.current = (c, fromServer) => {
    if (!userId) return;
    const p = prefsRef.current;
    const wearing = p.enabled ? wornCosmetics(c.cosmetics, p.takenOff) : [];
    if (!p.enabled) {
      setProgression({
        ready: true,
        enabled: false,
        pending: false,
        state: c,
        fromServer,
        wearing,
        reward: null,
      });
      return;
    }
    const d = diffRewards(
      snapshotOf({ ...c, seasonal: c.seasonal }),
      seenRef.current,
      localDateKey(new Date(), tz),
    );
    let nextSeen = d.seen;
    const summary = {
      ...d.summary,
      importedWorkouts: hasReward(d.summary) ? importedRef.current : 0,
    };
    if (hasReward(d.summary)) importedRef.current = 0;
    const policy = celebrationPolicy(levelRef.current, reducedRef.current);
    let reward: RewardEvent | null = null;
    if (hasReward(summary)) {
      if (policy.banner) reward = { id: ++seq.current, at: Date.now(), summary };
      const primary = primaryReaction(summary);
      if (primary && primary !== 'xp' && policy.toast) {
        const tk = takeToast(nextSeen, todayRef.current, policy.maxToastsPerDay);
        nextSeen = tk.seen;
        if (tk.ok) {
          showMoment(toastMessage(primary, summary), policy.pulseState, flourishFor(primary));
          if (policy.haptics) {
            if (primary === 'quest' || primary === 'cosmetic') haptics.success();
            else haptics.celebrate();
          }
        }
      }
    }
    seenRef.current = nextSeen;
    void writeSeen(deviceRaw, userId, nextSeen).catch(() => undefined);
    setProgression({
      badgeRecorded: nextSeen.badgeRecorded,
      ready: true,
      enabled: true,
      pending: false,
      state: c,
      fromServer,
      wearing,
      ...(reward ? { reward } : {}),
    });
  };

  // ---- asking for the answer ----
  const coordinator = useMemo(() => {
    if (!userId) return null;
    return createCoalescedSync<{ state: ConfirmedState; fromServer: boolean }>({
      debounceMs: DEBOUNCE_MS,
      retryMs: 15_000,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      work: async () => {
        const l = localRef.current;
        if (!l) throw new Error('no data');
        const n = normalizePrefs(prefsRef.current);
        const r = await store.gmSync!({
          targetDaysPerWeek: n.targetDaysPerWeek,
          restWeekdays: [...n.restWeekdays],
        });
        if (!r) throw new Error('server unavailable');
        return { state: toConfirmed(r, l.weekXp), fromServer: true };
      },
      apply: (r) => confirm.current(r.state, r.fromServer),
      // The server could not answer: the person's own records are still the authority, so show what the engine computes from them.
      onError: () => {
        const l = localRef.current;
        if (l) confirm.current(localToConfirmed(l), false);
      },
    });
  }, [store, userId]);
  useEffect(() => () => coordinator?.cancel(), [coordinator]);

  useEffect(() => {
    if (!prefsReady || !local || key === null || !userId) return;
    if (!prefs.enabled || !store.gmSync) {
      // No server in this build (or rewards are off): the engine over the person's records IS the confirmed answer, shown at once.
      confirm.current(localToConfirmed(local), false);
      return;
    }
    setProgression({ pending: true });
    coordinator?.request(key);
  }, [key, prefsReady, prefs.enabled, store, coordinator, userId, local]);

  // Prefs reach the screens even before the first answer.
  useEffect(() => {
    setProgression({ prefs, enabled: !!userId && prefs.enabled });
  }, [prefs, userId]);

  useEffect(() => {
    const level = data.data?.celebrations ?? 'full';
    setProgression({ policy: celebrationPolicy(level, reduced) });
  }, [data.data?.celebrations, reduced]);

  const wearingList = useMemo(() => {
    return local && prefs.enabled ? wornCosmetics(local.cosmetics, prefs.takenOff) : [];
  }, [local, prefs]);
  useEffect(() => {
    const w = userId ? wearingList : [];
    setPulseCosmetics(w);
    // The wardrobe preview reads the same list, so equipping updates it at once (not only at the next confirmed answer).
    setProgression({ wearing: w });
  }, [wearingList, userId]);

  // ---- actions for the screens ----
  useEffect(() => {
    if (!userId) return;
    return registerProgressionActions({
      async setPrefs(patch) {
        const next: GmDevicePrefs = {
          ...normalizePrefs({ ...prefsRef.current, ...patch }),
          levelSeen: prefsRef.current.levelSeen,
          takenOff: patch.takenOff !== undefined ? patch.takenOff : prefsRef.current.takenOff,
        };
        setPrefsState(next);
        await writeGmPrefs(deviceRaw, userId, next);
      },
      async setEquipped(id: CosmeticId, on: boolean) {
        const set = new Set(prefsRef.current.takenOff);
        if (on) set.delete(id);
        else set.add(id);
        const next: GmDevicePrefs = { ...prefsRef.current, takenOff: [...set] as CosmeticId[] };
        setPrefsState(next);
        await writeGmPrefs(deviceRaw, userId, next);
      },
      dismissReward() {
        setProgression({ reward: null });
      },
      noteImported(n) {
        importedRef.current += Math.max(0, n);
      },
      async announceGroupGoal(title, gkey) {
        const raw = await deviceRaw.get(groupsKey(userId)).catch(() => null);
        const seen: string[] = (() => {
          try {
            return JSON.parse(raw ?? '[]') as string[];
          } catch {
            return [];
          }
        })();
        if (seen.includes(gkey)) return;
        await deviceRaw.set(groupsKey(userId), JSON.stringify([...seen, gkey].slice(-100)));
        if (!prefsRef.current.enabled) return;
        const policy = celebrationPolicy(levelRef.current, reducedRef.current);
        if (policy.banner)
          setProgression({
            reward: { id: ++seq.current, at: Date.now(), summary: NO_REWARD, groupGoal: title },
          });
        if (policy.toast) {
          const tk = takeToast(seenRef.current, todayRef.current, policy.maxToastsPerDay);
          seenRef.current = tk.seen;
          void writeSeen(deviceRaw, userId, tk.seen).catch(() => undefined);
          if (tk.ok) {
            showMoment(t('gm.toast.group', { name: title }), policy.pulseState, 'confetti');
            if (policy.haptics) haptics.celebrate();
          }
        }
      },
    });
  }, [userId]);

  return null;
}

function localToConfirmed(l: ReturnType<typeof computeGamification>): ConfirmedState {
  return {
    totalXp: l.totalXp,
    weekXp: l.weekXp,
    level: l.level,
    streak: l.streak,
    restNudge: l.restNudge,
    dailyQuests: l.dailyQuests,
    weeklyQuests: l.weeklyQuests,
    badges: l.badges,
    cosmetics: l.cosmetics,
    seasonal: {
      id: l.seasonal.season.id,
      activeDays: l.seasonal.activeDays,
      goalDays: l.seasonal.season.goalDays,
      done: l.seasonal.done,
    },
  };
}
