import { localDateKey } from './food';
import type { SessionLike } from './activity';
import { addDaysIso, suggestQuickFit, type QuickFitMinutes } from './workouts';

export const PLAN_MODES = ['normal', 'busy', 'travel', 'comeback'] as const;
export type PlanMode = (typeof PLAN_MODES)[number];
export type PlanItemKind = 'workout' | 'meal' | 'habit' | 'goal';

export interface PlanItemDraft {
  kind: PlanItemKind;
  title: string;
  detail: string;
  /** Why this is suggested, in plain language (transparent recommendations). */
  why: string;
  ref?: {
    workoutId?: string;
    sessionId?: string;
    minutes?: number;
    lowImpact?: boolean;
    foodId?: string;
    /** A one-tap logging shortcut the screen may offer for this item. */
    action?: 'log_water' | 'log_walk';
  };
  done?: boolean;
}

export interface DailyPlanInput {
  date: string;
  mode: PlanMode;
  localHour: number;
  lowImpact: boolean;
  plannedToday: Array<{
    id: string;
    workoutId: string | null;
    title: string;
    minutes: number;
    lowImpact: boolean;
  }>;
  doneToday: Array<{ title: string }>;
  mealsLoggedToday: number;
  activeGoalTypes: ReadonlyArray<'lose' | 'maintain' | 'gain'>;
  daysSinceWeight: number | null;
  /** Distinct days in the 3 days before `date` on which the person completed a session. Optional; absent means no suggestion changes. */
  recentActiveDays?: number;
  /** Optional wellness context. When absent the plan is exactly the original dance, food, habit and goal plan. */
  wellness?: {
    intent: 'lose' | 'maintain' | 'fitness';
    tracking: 'detailed' | 'light' | 'none';
    activities: ReadonlyArray<'dance' | 'walking' | 'strength'>;
    hydrationMl: number;
    waterGoalMl: number;
    walkedToday: boolean;
    /** Sleep logged for last night, if any. */
    sleepHours?: number | null;
  };
  seed?: number;
}

const HABITS = [
  'Drink a glass of water',
  'Stretch for two minutes',
  'Take a short walk outside',
  'Take five slow breaths',
  'Step away from screens for ten minutes',
];
const MINUTES: Record<PlanMode, QuickFitMinutes> = { normal: 10, busy: 5, travel: 10, comeback: 5 };

/**
 * The Daily Fit Plan: dance, food, habits and goals in a handful of small, optional suggestions. It is rule-based and runs on the device (no AI call, no cost),
 * and every item says why it is there. Nothing is a requirement; there is no catch-up for missed days.
 */
export function generateDailyPlan(i: DailyPlanInput): {
  date: string;
  mode: PlanMode;
  items: PlanItemDraft[];
} {
  const seed = i.seed ?? 0;
  const items: PlanItemDraft[] = [];
  // Recovery: after three active days in a row, offer lighter movement and say plainly that resting is fine. General wellness only;
  // nothing is inferred about injury, illness or readiness, and nothing here is a requirement.
  const recovery =
    i.mode === 'normal' &&
    (i.recentActiveDays ?? 0) >= 3 &&
    i.doneToday.length === 0 &&
    i.plannedToday.length === 0;
  const lowOnly = i.lowImpact || i.mode === 'comeback' || i.mode === 'travel' || recovery;

  // Move
  if (i.doneToday.length > 0) {
    items.push({
      kind: 'workout',
      title: `You moved today: ${i.doneToday[0]!.title}`,
      detail: 'Nice. Anything more is a bonus.',
      why: 'You already completed a session today.',
      done: true,
    });
  } else if (i.plannedToday.length > 0 && i.mode !== 'comeback') {
    const p = i.plannedToday[0]!;
    items.push({
      kind: 'workout',
      title: `Your planned session: ${p.title}`,
      detail: `${p.minutes} minutes.`,
      why: 'You scheduled this earlier.',
      ref: {
        workoutId: p.workoutId ?? undefined,
        sessionId: p.id,
        minutes: p.minutes,
        lowImpact: p.lowImpact || lowOnly,
      },
    });
  } else {
    const w = suggestQuickFit({ minutes: MINUTES[i.mode], lowImpactOnly: lowOnly, seed });
    if (w) {
      const why = {
        normal: recovery
          ? 'You have moved three days in a row. A lighter session is offered today; resting is just as good a choice.'
          : 'A short session keeps momentum without taking over your day.',
        busy: 'Short on time: five minutes still counts.',
        travel: 'Travelling: no equipment, small space and gentle on the joints.',
        comeback: 'Easing back in gently. There is nothing to make up for.',
      }[i.mode];
      items.push({
        kind: 'workout',
        title: `${w.title} (${w.minutes} min)`,
        detail: w.summary,
        why:
          i.lowImpact && i.mode === 'normal'
            ? `${why} Low-impact options come first, based on your answers.`
            : why,
        ref: { workoutId: w.id, minutes: w.minutes, lowImpact: lowOnly },
      });
    }
  }

  if (recovery)
    items.push({
      kind: 'habit',
      title: 'Rest is part of the plan',
      detail: 'Taking today off is a good choice too. Tick this if you rest.',
      why: 'Easy days and rest days help movement stay enjoyable. Nothing is lost by resting.',
    });

  // Food
  if (i.mode === 'busy')
    items.push({
      kind: 'meal',
      title: 'Log one meal today',
      detail: 'One entry is plenty on a busy day.',
      why: 'Keeping logging light on busy days makes it easier to keep up.',
    });
  else if (i.mode === 'travel')
    items.push({
      kind: 'meal',
      title: 'Eating out? Enjoy it and check portions',
      detail: 'Swap ideas can show comparable options if you want them.',
      why: 'Travel changes routine; flexible is fine.',
    });
  else if (i.mode === 'comeback')
    items.push({
      kind: 'meal',
      title: 'Eat regular meals',
      detail: 'No need to make up for anything.',
      why: 'Steady meals support gentle movement.',
    });
  else if (i.mealsLoggedToday === 0 && i.localHour >= 11)
    items.push({
      kind: 'meal',
      title: 'Log what you have eaten so far',
      detail: 'A photo or a quick search is enough.',
      why: 'No meals are logged yet today.',
    });
  else
    items.push({
      kind: 'meal',
      title: 'Aim for protein, veg and carbs at your next meal',
      detail: 'A guide, not a rule.',
      why: 'A balanced plate is a gentle default.',
    });

  // Habits
  const nHabits = i.mode === 'normal' ? 2 : 1;
  for (let k = 0; k < nHabits; k++) {
    const h = HABITS[(seed + k * 2 + (i.mode === 'travel' ? 0 : 1)) % HABITS.length]!;
    items.push({
      kind: 'habit',
      title: h,
      detail: 'Tick it off whenever you do it.',
      why: 'Small habits add up and take almost no time.',
    });
  }

  // Wellness: water and walking, only when the person has opted into them. All optional, none a requirement.
  const w = i.wellness;
  if (w) {
    if (w.waterGoalMl > 0 && w.hydrationMl < w.waterGoalMl && i.localHour >= 10)
      items.push({
        kind: 'habit',
        title: 'Sip some water',
        detail: `A glass is about 250 ml. A general guide is around ${w.waterGoalMl} ml a day; you can change it.`,
        why: 'Water helps energy and appetite cues. The amount is a general guide you can change.',
        ref: { action: 'log_water' },
      });
    if (
      w.activities.includes('walking') &&
      !w.walkedToday &&
      i.doneToday.length === 0 &&
      i.mode !== 'travel'
    )
      items.push({
        kind: 'workout',
        title: 'A 10-minute walk counts',
        detail: 'Log it by hand when you finish. There is no step counting here.',
        why:
          i.mode === 'busy'
            ? 'Short on time: a brisk ten minutes still counts as movement.'
            : 'Walking is an easy way to move on days dance is not the plan.',
        ref: { action: 'log_walk', minutes: 10 },
      });
    if (w.sleepHours != null && w.sleepHours < 6)
      items.push({
        kind: 'habit',
        title: 'Go gently today',
        detail: 'A shorter night happens. A lighter session or an early wind-down are both fine.',
        why: `You logged about ${w.sleepHours} hours last night. This is general wellness guidance, not advice about your health.`,
      });
  }

  // Goals (optional, never pressure). With wellness preferences, weigh-ins are offered only to people who chose weight numbers.
  const wantsWeight = w ? w.tracking !== 'none' && w.intent !== 'fitness' : true;
  if (
    i.mode === 'normal' &&
    wantsWeight &&
    i.activeGoalTypes.length > 0 &&
    (i.daysSinceWeight === null || i.daysSinceWeight >= 7)
  ) {
    items.push({
      kind: 'goal',
      title: 'Weigh in, if you like',
      detail: 'Optional. Weight moves day to day; the trend matters more.',
      why: 'It has been a while since your last entry. Skip it any time.',
    });
  }
  return { date: i.date, mode: i.mode, items };
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * "Welcome back" detection. Only people who have trained before can be returning, and the trigger is a gap, not a failure: a week away, or
 * several days with two or more planned sessions that did not happen.
 */
export function detectComeback(
  sessions: ReadonlyArray<SessionLike & { plannedFor: string | null }>,
  opts: { now: Date; timeZone: string | null },
): { daysAway: number; missedPlanned: number } | null {
  const today = localDateKey(opts.now, opts.timeZone);
  const done = sessions
    .filter((s) => s.status === 'completed' && s.completedAt)
    .map((s) => localDateKey(s.completedAt!, opts.timeZone))
    .sort();
  if (done.length === 0) return null;
  const daysAway = daysBetween(done[done.length - 1]!, today);
  const missedPlanned = sessions.filter(
    (s) =>
      s.plannedFor &&
      s.plannedFor < today &&
      s.plannedFor >= addDaysIso(today, -7) &&
      (s.status === 'planned' || s.status === 'skipped'),
  ).length;
  return daysAway >= 7 || (daysAway >= 3 && missedPlanned >= 2)
    ? { daysAway, missedPlanned }
    : null;
}

/** A gentle three-session return over a week: short, low-impact, no catching up. */
export function comebackSessions(
  startDate: string,
): Array<{ workoutId: string; plannedFor: string }> {
  return [
    { workoutId: 'qf5-lowimpact-reset', plannedFor: startDate },
    { workoutId: 'qf10-latin-rhythm', plannedFor: addDaysIso(startDate, 2) },
    { workoutId: 'qf10-amapiano-groove', plannedFor: addDaysIso(startDate, 4) },
  ];
}

export interface WeekFacts {
  weekStart: string;
  sessions: number;
  minutes: number;
  activeDays: number;
  foodLoggedDays: number;
  styles: string[];
  lowImpactSessions: number;
  weightTrend: 'down' | 'up' | 'steady' | null;
  activeGoals: number;
}

/** How many of the three days before `date` (in the person's time zone) include a completed session. */
export function recentActiveDayCount(
  sessions: ReadonlyArray<{ status: string; completedAt: string | null }>,
  date: string,
  timeZone: string | null,
): number {
  const wanted = new Set([1, 2, 3].map((n) => addDaysIso(date, -n)));
  const hit = new Set<string>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedAt) continue;
    const k = localDateKey(s.completedAt, timeZone);
    if (wanted.has(k)) hit.add(k);
  }
  return hit.size;
}
