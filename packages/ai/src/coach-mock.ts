import {
  FOOD_BY_ID,
  WORKOUT_BY_ID,
  addDaysIso,
  classifyIntent,
  comebackSessions,
  suggestQuickFit,
  suggestSwaps,
  type CoachContext,
  type QuickFitMinutes,
  type WeekFacts,
} from '@dancehall/shared';
import type { ConciergeResponse, WeeklyReviewResponse } from './schemas';

/**
 * SIMULATED coach for development and tests. It is a deterministic, rule-based stand-in for a language model: it reads the same context a real
 * provider would, and produces the same structured output (message, reasons, proposed changes). It is not AI, and the app says so.
 */
type Reply = Omit<ConciergeResponse, 'supportReferral'> & { supportReferral?: boolean };
const clampMin = (m: number | undefined, d: QuickFitMinutes): QuickFitMinutes =>
  m === 5 || m === 10 || m === 15 ? m : d;

function reasons(c: CoachContext, extra: string[] = []): string[] {
  const r = [...extra];
  if (!c.personalized) r.push('Personalization is off, so this is general guidance.');
  else {
    if (c.activity)
      r.push(
        c.activity.sessionsThisWeek > 0
          ? `You have done ${c.activity.sessionsThisWeek} session(s) this week.`
          : 'No sessions are logged yet this week, and that is fine.',
      );
    if (c.lowImpact) r.push('Low-impact options come first because of your readiness answers.');
    if (c.food)
      r.push(
        c.food.mealsToday > 0
          ? `You have logged ${c.food.mealsToday} meal(s) today.`
          : 'No meals are logged yet today.',
      );
  }
  return r.slice(0, 5);
}

export function composeCoachReply(userText: string, c: CoachContext): Reply {
  const { intent, minutes } = classifyIntent(userText);
  const lowOnly = !!c.lowImpact || c.mode === 'comeback';
  const today = c.today;
  const quick = (m: QuickFitMinutes, low = lowOnly) =>
    suggestQuickFit({ minutes: m, lowImpactOnly: low, seed: c.localHour });
  const addWorkout = (w: NonNullable<ReturnType<typeof quick>>, date = today, low = lowOnly) => ({
    kind: 'add_workout' as const,
    summary: `Schedule ${w.title} (${w.minutes} min) for ${date === today ? 'today' : date}`,
    payload: { workoutId: w.id, plannedFor: date, lowImpact: low },
  });

  switch (intent) {
    case 'busy': {
      const w = quick(clampMin(minutes, 5), lowOnly);
      return {
        message: `Short on time? Even ${w?.minutes ?? 5} minutes counts. ${w ? `${w.title} fits.` : ''} I can switch today to a lighter plan if you like.`,
        because: reasons(c, ['Short sessions are easier to keep up on busy days.']),
        proposedChanges: [
          {
            kind: 'update_daily_plan',
            summary: 'Switch today to a light Busy-Day plan',
            payload: { mode: 'busy', date: today },
          },
          ...(w ? [addWorkout(w)] : []),
        ],
      };
    }
    case 'travel': {
      const w = quick(10, true);
      return {
        message:
          'Travelling is a great time for something flexible: a gentle, low-impact session needs no equipment and little space. Eating out? Enjoy it and use Swap ideas if you want options.',
        because: reasons(c, ['Travel changes your routine, so flexible beats strict.']),
        proposedChanges: [
          {
            kind: 'update_daily_plan',
            summary: 'Switch today to a Travel plan',
            payload: { mode: 'travel', date: today },
          },
          ...(w ? [addWorkout(w, today, true)] : []),
        ],
      };
    }
    case 'comeback': {
      const away = c.comeback?.daysAway;
      return {
        message: `Welcome back${away ? `: it has been ${away} days and that is completely okay` : ''}. There is nothing to make up. Let's ease in with three short, low-impact sessions over the week.`,
        because: reasons(c, [
          'Returning gradually lowers the chance of soreness and keeps it enjoyable.',
        ]),
        proposedChanges: [
          {
            kind: 'update_daily_plan',
            summary: 'Switch today to a gentle Comeback plan',
            payload: { mode: 'comeback', date: today },
          },
          ...comebackSessions(today).map((s) => {
            const w = WORKOUT_BY_ID.get(s.workoutId)!;
            return {
              kind: 'add_workout' as const,
              summary: `${w.title} (${w.minutes} min) on ${s.plannedFor === today ? 'today' : s.plannedFor}`,
              payload: { workoutId: w.id, plannedFor: s.plannedFor, lowImpact: true },
            };
          }),
        ],
      };
    }
    case 'workout_request': {
      const w = quick(clampMin(minutes, 10));
      return {
        message: w
          ? `How about ${w.title}? It is ${w.minutes} minutes, ${w.intensity === 'low' ? 'gentle' : w.intensity === 'moderate' ? 'moderate' : 'high-energy'}, with a low-impact version you can switch to any time.`
          : 'I could not find a matching session right now.',
        because: reasons(c, ['It matches the length you asked for.']),
        proposedChanges: w ? [addWorkout(w)] : [],
      };
    }
    case 'food_swap': {
      const item = [...(c.food?.lastMealItems ?? [])]
        .filter((i) => i.foodId)
        .sort((a, b) => b.kcal - a.kcal)[0];
      const swap = item
        ? suggestSwaps({ foodId: item.foodId, grams: item.grams, kcal: item.kcal }, 'lighter')[0]
        : undefined;
      if (item && swap) {
        const from = FOOD_BY_ID.get(item.foodId!)!;
        return {
          message: `A comparable swap for ${from.name} is ${swap.food.name}: ${swap.reason}. These are ideas, not rules, and both are fine.`,
          because: reasons(c, ['I compared equal portions using the sample reference data.']),
          proposedChanges: [
            {
              kind: 'swap_meal',
              summary: `Try ${swap.food.name} instead of ${from.name} next time`,
              payload: { fromFoodId: from.id, toFoodId: swap.food.id, grams: item.grams },
            },
          ],
        };
      }
      return {
        message:
          'Open Swap ideas in the Food tab, pick a food, and I can compare options with it. Log a meal first and I can suggest one from it.',
        because: reasons(c),
        proposedChanges: [],
      };
    }
    case 'goal_too_hard': {
      const g = c.goals?.[0];
      return {
        message:
          'Goals should fit your life, not the other way round. A gentler timeframe is a perfectly good choice, and you can change it again any time.',
        because: reasons(c, ['A steady pace is easier to sustain.']),
        proposedChanges: g
          ? [
              {
                kind: 'adjust_goal',
                summary: `Replace your ${g.period} goal with a gentler monthly one`,
                payload: { type: g.type, period: 'monthly', replacePeriod: g.period },
              },
            ]
          : [],
      };
    }
    case 'weight_question': {
      const t = c.weightTrend;
      return {
        message: `Weight moves day to day with water, food timing and sleep, so the overall direction matters more than any single number.${t ? ` Lately it looks ${t === 'steady' ? 'fairly steady' : t === 'down' ? 'to be drifting down' : 'to be drifting up'}, which is normal variation.` : ''} Progress is also energy, mood, strength and how much you enjoy moving.`,
        because: reasons(c, ['Weight is only one part of progress.']),
        proposedChanges: [],
      };
    }
    case 'weekly_review':
      return {
        message:
          'Your weekly review is ready to generate from the Weekly review screen. It looks at consistency, effort and non-scale wins.',
        because: reasons(c),
        proposedChanges: [],
      };
    case 'plan_today': {
      const open = (c.plan?.items ?? [])
        .filter((i) => !i.done)
        .slice(0, 3)
        .map((i) => i.title);
      const w = !c.plan?.items.some((i) => i.kind === 'workout') ? quick(10) : null;
      return {
        message: open.length
          ? `Here is a simple day: ${open.join('; ')}. All of it is optional, so take what helps.`
          : 'A simple day: a short dance session, a balanced meal and one small habit like a glass of water. All of it is optional.',
        because: reasons(c, ['Small, specific steps are easier to follow.']),
        proposedChanges: w ? [addWorkout(w)] : [],
      };
    }
    default:
      return {
        message:
          'I can plan your day, suggest a Quick Fit session, adapt for a busy day or travel, help you ease back in, compare food swaps, or review your week. What would help most?',
        because: reasons(c),
        proposedChanges: [],
      };
  }
}

export function composeWeeklyReview(f: WeekFacts): WeeklyReviewResponse {
  const highlights: string[] = [];
  if (f.sessions > 0)
    highlights.push(
      `You moved on ${f.activeDays} day(s) this week, ${f.minutes} minutes in total.`,
    );
  else highlights.push('You checked in this week, and that counts. A fresh week is a fresh start.');
  if (f.foodLoggedDays > 0) highlights.push(`You logged food on ${f.foodLoggedDays} day(s).`);
  const wins: string[] = [];
  if (f.styles.length >= 2) wins.push(`You tried ${f.styles.length} different dance styles.`);
  if (f.lowImpactSessions > 0) wins.push('You chose the low-impact version when it suited you.');
  if (f.sessions > 0) wins.push('You showed up at your own level.');
  if (f.weightTrend === 'steady') wins.push('Your weight stayed steady, which is a fine result.');
  const tips: string[] = [];
  if (f.sessions === 0) tips.push('Try one 5-minute Quick Fit on your busiest day.');
  else if (f.sessions < 3) tips.push('Pick a regular slot for a 10-minute session.');
  else tips.push('Keep what is working, and add a gentle stretch after sessions.');
  if (f.foodLoggedDays === 0) tips.push('Log one meal a day to see patterns, if you like.');
  if (f.weightTrend)
    tips.push('Remember that weight moves day to day; the overall direction matters more.');
  return {
    highlights: highlights.slice(0, 5),
    nonScaleWins: wins.slice(0, 5),
    suggestions: tips.slice(0, 3),
    tone: 'encouraging',
  };
}

export const dateForTests = addDaysIso;
