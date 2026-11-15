import type { PlanMode } from './daily-plan';
import { localDateKey } from './food';
import type { UnitSystem } from './units';

/**
 * What the coach is allowed to know. Built from the person's own records ONLY when they have given the separate AI-personalization consent,
 * and deliberately minimal: no name, birth date, email, exact weights or free-text notes. Weight appears only as a direction ("steady").
 */
export interface CoachContext {
  personalized: boolean;
  unitSystem: UnitSystem;
  localHour: number;
  weekday: string;
  /** Local date (YYYY-MM-DD), used only to date suggestions. */
  today: string;
  mode?: PlanMode | null;
  lowImpact?: boolean;
  goals?: Array<{ type: 'lose' | 'maintain' | 'gain'; period: 'weekly' | 'monthly' | 'yearly' }>;
  weightTrend?: 'down' | 'up' | 'steady' | null;
  activity?: {
    sessionsThisWeek: number;
    minutesThisWeek: number;
    activeDaysThisWeek: number;
    daysSinceLastSession: number | null;
    plannedToday: string[];
    missedPlannedLast7: number;
  };
  food?: {
    mealsToday: number;
    kcalToday?: number;
    lastMealItems?: Array<{ name: string; foodId: string | null; grams: number; kcal: number }>;
  };
  plan?: {
    mode: PlanMode;
    items: Array<{ kind: string; title: string; done: boolean; why?: string }>;
  } | null;
  /** Recorded wellness for the week, from the person's own logs. Never estimated. */
  wellness?: {
    walkMinutesWeek: number;
    strengthSessionsWeek: number;
    sleepNightsWeek: number;
    sleepAvgHours: number | null;
    recoveryToday: 'fresh' | 'ok' | 'sore' | 'worn' | null;
    hungerCheckinsWeek: number;
    intent: 'lose' | 'maintain' | 'fitness' | 'strength' | null;
    /** True when the person said food or weight numbers are hard or switched numbers off: the coach then shares none. */
    numbersHidden: boolean;
  };
  comeback?: { daysAway: number; missedPlanned: number } | null;
  guideKcal?: number;
}

const round50 = (n: number) => Math.round(n / 50) * 50;

export function buildCoachContext(args: {
  personalized: boolean;
  unitSystem: UnitSystem;
  now: Date;
  timeZone?: string | null;
  mode?: PlanMode | null;
  lowImpact?: boolean;
  goals?: CoachContext['goals'];
  weightTrend?: CoachContext['weightTrend'];
  activity?: CoachContext['activity'];
  food?: CoachContext['food'];
  plan?: CoachContext['plan'];
  wellness?: CoachContext['wellness'];
  comeback?: CoachContext['comeback'];
  guideKcal?: number;
}): CoachContext {
  let localHour = args.now.getUTCHours();
  let weekday = args.now.toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
  try {
    if (args.timeZone) {
      localHour =
        Number(
          new Intl.DateTimeFormat('en', {
            hour: 'numeric',
            hour12: false,
            timeZone: args.timeZone,
          }).format(args.now),
        ) % 24;
      weekday = args.now.toLocaleDateString('en', { weekday: 'long', timeZone: args.timeZone });
    }
  } catch {
    /* fall back to UTC */
  }
  const base: CoachContext = {
    personalized: args.personalized,
    unitSystem: args.unitSystem,
    localHour,
    weekday,
    today: localDateKey(args.now, args.timeZone ?? null),
  };
  if (!args.personalized) return base;
  // When the person chose no numbers (or has an eating concern, or is pregnant or postpartum) the coach receives no weight direction, no calorie
  // figures and no per-item nutrition: only what was logged (names and counts). This is enforced here so every caller, device or server, inherits it.
  const hidden = args.wellness?.numbersHidden === true;
  return {
    ...base,
    mode: args.mode ?? null,
    lowImpact: args.lowImpact,
    goals: args.goals,
    weightTrend: hidden ? null : (args.weightTrend ?? null),
    activity: args.activity,
    food: args.food
      ? hidden
        ? {
            mealsToday: args.food.mealsToday,
            lastMealItems: args.food.lastMealItems?.map((i) => ({ ...i, kcal: 0 })),
          }
        : {
            ...args.food,
            kcalToday: args.food.kcalToday === undefined ? undefined : round50(args.food.kcalToday),
          }
      : undefined,
    plan: args.plan ?? null,
    wellness: args.wellness,
    comeback: args.comeback ?? null,
    guideKcal: hidden || args.guideKcal === undefined ? undefined : round50(args.guideKcal),
  };
}

/** Plain-language list of what the coach used, shown next to its answers and in settings. */
export function contextSummaryLines(c: CoachContext): string[] {
  if (!c.personalized) return ['Nothing personal: general guidance only (personalization is off)'];
  const lines: string[] = [];
  if (c.goals && c.goals.length) lines.push(`Your goals (${c.goals.length} active)`);
  if (c.weightTrend) lines.push('The overall direction of your weight (no exact numbers)');
  if (c.activity) lines.push('Your activity this week and what you have scheduled');
  if (c.food) lines.push("Today's food log");
  if (c.lowImpact)
    lines.push('Your preference for low-impact options (from your readiness answers)');
  if (c.plan) lines.push("Today's Daily Fit Plan");
  if (c.wellness)
    lines.push('Your goal focus and any walks, strength, sleep and check-ins you logged this week');
  if (c.comeback) lines.push('That you have been away from workouts for a while');
  lines.push('Your time of day and units');
  return lines;
}

export type CoachIntent =
  | 'plan_today'
  | 'busy'
  | 'travel'
  | 'comeback'
  | 'weekly_review'
  | 'plan_explain'
  | 'plateau'
  | 'recovery'
  | 'habits'
  | 'workout_request'
  | 'food_swap'
  | 'goal_too_hard'
  | 'weight_question'
  | 'general';

/** Rule-based intent detection so the same request always routes the same way (and the mock can respond sensibly). */
export function classifyIntent(text: string): { intent: CoachIntent; minutes?: 5 | 10 | 15 } {
  const t = text.toLowerCase();
  const mins = /\b(5|five)\s*(?:min|minute)/.test(t)
    ? 5
    : /\b(10|ten)\s*(?:min|minute)/.test(t)
      ? 10
      : /\b(15|fifteen)\s*(?:min|minute)/.test(t)
        ? 15
        : undefined;
  if (/\b(travel|travelling|traveling|hotel|trip|on the road|flight|vacation|holiday)\b/.test(t))
    return { intent: 'travel' };
  if (
    /\b(missed|been away|fell off|haven'?t (?:worked|exercised|moved|danced)|back after|restart|start again|come ?back|get back)\b/.test(
      t,
    )
  )
    return { intent: 'comeback' };
  if (
    /\b(busy|no time|short on time|only have|swamped|hectic)\b/.test(t) &&
    !/\bfood|meal|eat\b/.test(t)
  )
    return { intent: 'busy', minutes: mins };
  if (
    /\b(plateau\w*|stuck|stalled|not losing|stopped losing|scale (?:won'?t|isn'?t|hasn'?t)|not moving)\b/.test(
      t,
    )
  )
    return { intent: 'plateau' };
  if (/\b(why)\b.*\b(plan|suggest|asked|recommend)|\bexplain\b.*\b(plan|today)\b/.test(t))
    return { intent: 'plan_explain' };
  if (
    /\b(sore|tired|exhausted|worn out|achy|sleep|slept|insomnia|recover|recovery|rest day)\b/.test(
      t,
    )
  )
    return { intent: 'recovery' };
  if (/\b(habit|habits|routine|motivat\w*|consisten\w*|stay on track|keep going)\b/.test(t))
    return { intent: 'habits' };
  if (/\b(my week|this week|weekly|week in review|how (?:was|did) (?:i|my))\b/.test(t))
    return { intent: 'weekly_review' };
  if (
    /\b(too (?:hard|fast|much|strict|aggressive)|goal (?:is )?(?:hard|too)|can'?t keep up|slow(?:er)? (?:down|pace)|gentler goal)\b/.test(
      t,
    )
  )
    return { intent: 'goal_too_hard' };
  if (/\b(swap|instead of|alternative|replace|lighter|healthier option|substitute)\b/.test(t))
    return { intent: 'food_swap' };
  if (/\b(weigh|weight|scale|goal|progress|plateau)\b/.test(t))
    return { intent: 'weight_question' };
  if (mins || /\b(workout|dance|exercise|session|move|class)\b/.test(t))
    return { intent: 'workout_request', minutes: mins };
  if (/\b(plan|today|what should i do|what now|schedule)\b/.test(t))
    return { intent: 'plan_today' };
  return { intent: 'general' };
}
