import {
  FOOD_BY_ID,
  MAINTENANCE_EDUCATION,
  PLATE_MODEL,
  PLATE_NOTE,
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
      const hidden = c.wellness?.numbersHidden === true;
      // With numbers hidden the calorie-based "lighter" comparison is not used and no figure is quoted.
      const swap = item
        ? suggestSwaps(
            { foodId: item.foodId, grams: item.grams, kcal: item.kcal },
            hidden ? 'more_fiber' : 'lighter',
          )[0]
        : undefined;
      if (item && swap) {
        const from = FOOD_BY_ID.get(item.foodId!)!;
        return {
          message: hidden
            ? `A comparable swap for ${from.name} is ${swap.food.name}, which has more fiber. These are ideas, not rules, and both are fine.`
            : `A comparable swap for ${from.name} is ${swap.food.name}: ${swap.reason}. These are ideas, not rules, and both are fine.`,
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
    case 'plan_explain': {
      const items = (c.plan?.items ?? []).slice(0, 5);
      return {
        message: items.length
          ? `Here is why each suggestion is in today's plan: ${items.map((i) => `${i.title}: ${i.why ?? 'a small, optional step'}${i.done ? ' (done)' : ''}`).join('; ')}. You can skip any of it.`
          : 'Open the Daily Fit Plan on the Coach tab and tap "Why" on any item to see the reason. Every suggestion is rule-based, optional and based only on what you have logged.',
        because: reasons(c, ['Suggestions come from simple rules, not from a model.']),
        proposedChanges: [],
      };
    }
    case 'plateau': {
      const wl = c.wellness;
      if (wl?.numbersHidden)
        return {
          message:
            'Progress is more than any number. If food or weight feel hard right now, it is completely okay to focus on how you feel, sleep and the movement you enjoy. A doctor or registered dietitian can give support that fits you.',
          because: reasons(c, ['You asked us not to focus on numbers.']),
          proposedChanges: [],
          supportReferral: true,
        };
      const notes: string[] = [];
      if (wl && wl.sleepAvgHours !== null && wl.sleepAvgHours < 7)
        notes.push(`you logged about ${wl.sleepAvgHours} hours of sleep on average`);
      if (
        wl &&
        wl.walkMinutesWeek === 0 &&
        wl.strengthSessionsWeek === 0 &&
        !c.activity?.sessionsThisWeek
      )
        notes.push('no movement is logged this week');
      return {
        message: `Plateaus are common and usually temporary. Weight moves day to day with water, hormones, sleep and stress, so one flat stretch rarely means anything is wrong. Look at the 2 to 3 week direction, and at other signs like energy, strength and how clothes fit.${notes.length ? ` From what you logged: ${notes.join(' and ')}, which can matter.` : ''} Avoid cutting food sharply; that tends to backfire. If you are worried, a doctor or registered dietitian can look at your whole picture.`,
        because: reasons(c, ['This is general education, not a diagnosis.']),
        proposedChanges: [],
      };
    }
    case 'recovery': {
      const wl = c.wellness;
      const lowSleep = !wl?.numbersHidden && wl?.sleepAvgHours != null && wl.sleepAvgHours < 6.5;
      const w = quick(5, true);
      return {
        message: `Rest is part of progress. ${wl?.recoveryToday === 'sore' || wl?.recoveryToday === 'worn' ? `You said your body feels ${wl.recoveryToday === 'worn' ? 'worn out' : 'sore'} today, so ` : 'On days like this '}a gentle walk, light stretching or a short low-impact session can feel better than pushing, and taking the day off is fine.${lowSleep ? ` You logged about ${wl!.sleepAvgHours} hours of sleep on average this week; a regular wind-down time may help.` : ''} If pain is sharp or lasts, please see a health professional.`,
        because: reasons(c, ['Recovery supports energy and keeps movement enjoyable.']),
        proposedChanges: [
          {
            kind: 'update_daily_plan',
            summary: 'Switch today to a gentle Comeback plan',
            payload: { mode: 'comeback', date: today },
          },
          ...(w ? [addWorkout(w, today, true)] : []),
        ],
      };
    }
    case 'habits': {
      const wl = c.wellness;
      const ideas = [
        'a glass of water with each meal',
        'a 10-minute walk after one meal',
        'a fixed wind-down time at night',
      ];
      return {
        message: `Habits stick when they are small and tied to something you already do. Pick one: ${ideas.join(', ')}. Missing a day does not reset anything.${wl && !wl.numbersHidden && wl.walkMinutesWeek > 0 ? ` You have logged ${wl.walkMinutesWeek} minutes of walking this week, which is a good base.` : ''}`,
        because: reasons(c, ['Small habits are easier to repeat than big changes.']),
        proposedChanges: [],
      };
    }
    case 'calorie_needs': {
      const hidden = c.wellness?.numbersHidden === true;
      if (hidden)
        return {
          message:
            'I will not share calorie numbers, because of the privacy choices you made. We can focus on how meals feel, regular movement, sleep and water instead.',
          because: reasons(c, ['Your settings turn calorie and weight numbers off.']),
          proposedChanges: [],
        };
      if (c.guideKcal === undefined)
        return {
          message:
            'I do not have a calorie estimate for you yet, and I will not guess one. The Goals screen shows what is still needed: usually your weight, height, birth date, usual activity and the quick safety questions. Some answers also mean we suggest talking to a professional first.',
          because: reasons(c, ['Estimates come from the same calculation as your Goals screen.']),
          proposedChanges: [],
        };
      const old =
        c.guideWeightDaysOld !== undefined
          ? ` It rests on a weight recorded about ${c.guideWeightDaysOld} days ago, not a current measurement, so updating your weight would refresh it.`
          : '';
      return {
        message: `Your current daily estimate is about ${c.guideKcal} kcal. It is provisional: a rough estimate from general formulas that no dietitian has reviewed, not a target to hit. Your usual activity level already includes your regular exercise, so I do not add workout calories on top.${old}`,
        because: reasons(c, [
          'This is the same estimate your Goals and Food screens show, rounded.',
        ]),
        proposedChanges: [],
      };
    }
    case 'nutrition_balance':
      return {
        message: `A simple plate picture, for any cuisine: ${PLATE_MODEL.map((p) => `${p.share} ${p.label.toLowerCase()}`).join('; ')}. ${PLATE_NOTE} Your Food tab shows today's protein and fibre guidance${c.wellness?.numbersHidden ? ' as a plate picture only' : ''}.`,
        because: reasons(c, ['Plate guidance is general and provisional, not medical advice.']),
        proposedChanges: [],
      };
    case 'maintenance': {
      if (c.wellness?.numbersHidden === true)
        return {
          message:
            'Keeping steady is mostly about habits you enjoy: movement, regular meals, sleep and water. We can build those together without any numbers.',
          because: reasons(c, ['Your settings turn weight and calorie numbers off.']),
          proposedChanges: [],
        };
      return {
        message: `${MAINTENANCE_EDUCATION[0]} ${MAINTENANCE_EDUCATION[2]} If you have reached a goal, you can choose Maintain weight on the Goals screen at any time; your history stays as it is.`,
        because: reasons(c, ['This is general guidance, not medical advice.']),
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
  const wl = f.wellness;
  if (wl) {
    if (wl.walkMinutes > 0)
      highlights.push(`You walked on ${wl.walkDays} day(s), ${wl.walkMinutes} minutes in total.`);
    if (wl.strengthSessions > 0)
      wins.push(`You logged ${wl.strengthSessions} strength session(s).`);
    if (wl.sleepAvgHours !== null)
      highlights.push(
        `You logged ${wl.sleepNights} nights of sleep, about ${wl.sleepAvgHours} hours on average.`,
      );
    if (wl.waterLoggedDays > 0) wins.push(`You tracked water on ${wl.waterLoggedDays} day(s).`);
    if (wl.hungerCheckins > 0) wins.push('You checked in with your hunger and fullness.');
  }
  const tips: string[] = [];
  if (f.sessions === 0) tips.push('Try one 5-minute Quick Fit on your busiest day.');
  else if (f.sessions < 3) tips.push('Pick a regular slot for a 10-minute session.');
  else tips.push('Keep what is working, and add a gentle stretch after sessions.');
  if (wl && wl.sleepAvgHours !== null && wl.sleepAvgHours < 6.5)
    tips.push('Try a regular wind-down time; sleep supports energy and appetite.');
  if (f.activeDays === 0 || (wl && wl.walkMinutes === 0 && f.sessions === 0))
    tips.push('A 10-minute walk is an easy way to start the week.');
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
