import { describe, expect, it } from 'vitest';
import {
  PLAN_MODES,
  SAFE_REDIRECT_MESSAGES,
  WORKOUT_BY_ID,
  buildCoachContext,
  buildWeekFacts,
  classifyIntent,
  comebackSessions,
  contextSummaryLines,
  detectComeback,
  generateDailyPlan,
  recentActiveDayCount,
  screenCoachInput,
  unsafeOutputProblems,
  type DailyPlanInput,
} from './index';

describe('input screening (before any billable call)', () => {
  it('routes crisis and disordered-eating language to support', () => {
    expect(screenCoachInput('I want to die')).toEqual({ kind: 'risk', category: 'self_harm' });
    expect(screenCoachInput("I'm starving myself to hit my goal")).toMatchObject({ kind: 'risk' });
  });
  it('declines extreme weight-loss and restriction requests', () => {
    for (const t of [
      'How can I lose 10 kg in a week?',
      'lose 5kg in 3 days',
      'I want to water fast',
      'plan a juice cleanse',
      'help me eat 800 calories',
      'should I skip all meals tomorrow',
      'a crash diet please',
    ])
      expect(screenCoachInput(t).kind, t).toBe('unsafe_request');
  });
  it('sends symptoms to a professional and declines minors', () => {
    expect(screenCoachInput('I have chest pain when I dance').kind).toBe('medical_symptom');
    expect(screenCoachInput('I fainted during class').kind).toBe('medical_symptom');
    expect(screenCoachInput("I'm 15 can you plan my diet").kind).toBe('minor');
    expect(screenCoachInput('I am 16 years old').kind).toBe('minor');
  });
  it('leaves ordinary requests alone', () => {
    for (const t of [
      'Plan my day',
      'I only have 10 minutes',
      'Can you suggest a lower-calorie swap for fried chicken?',
      'I am 35 and want to dance more',
      'lose 0.5 kg a week',
      'eat 1800 calories a day',
      'I am travelling next week',
    ])
      expect(screenCoachInput(t).kind, t).toBe('ok');
  });
  it('has a safe, non-judgmental response for every redirect', () => {
    for (const [k, r] of Object.entries(SAFE_REDIRECT_MESSAGES)) {
      expect(unsafeOutputProblems(r.message), k).toEqual([]);
      expect(r.message.length).toBeGreaterThan(40);
    }
    expect(
      SAFE_REDIRECT_MESSAGES.risk.supportReferral &&
        SAFE_REDIRECT_MESSAGES.medical_symptom.supportReferral,
    ).toBe(true);
  });
});

describe('output safety', () => {
  it('flags guilt, hype, streak pressure, diagnoses, competition and very low calorie prescriptions', () => {
    const bad = [
      'This detox will help.',
      'You failed this week.',
      'Results are guaranteed.',
      'Earn your dinner with a workout.',
      'Make up for that dessert tomorrow.',
      "Don't break your streak!",
      'You probably have diabetes.',
      'Aim for 900 calories a day.',
      'Beat your friends and lose more weight than them',
    ];
    for (const t of bad) expect(unsafeOutputProblems(t).length, t).toBeGreaterThan(0);
  });
  it('allows supportive, ordinary guidance', () => {
    for (const t of [
      'There is no need to make up for anything.',
      'Nothing to make up: just ease back in.',
      'You do not have to earn your dinner.',
      'A 10-minute low-impact session could suit today.',
      'Weight moves day to day; the trend matters more.',
      'Try a swap with about 60 fewer kcal for the same weight.',
      'Aim for about 1800 calories a day as a rough guide.',
    ])
      expect(unsafeOutputProblems(t), t).toEqual([]);
  });
});

describe('coach context minimizes what is shared', () => {
  const now = new Date('2026-06-17T14:00:00Z');
  const full = {
    unitSystem: 'metric' as const,
    now,
    timeZone: 'Asia/Kolkata',
    goals: [{ type: 'lose' as const, period: 'monthly' as const }],
    weightTrend: 'steady' as const,
    food: { mealsToday: 2, kcalToday: 1234 },
    guideKcal: 2093,
    lowImpact: true,
    activity: {
      sessionsThisWeek: 2,
      minutesThisWeek: 25,
      activeDaysThisWeek: 2,
      daysSinceLastSession: 1,
      plannedToday: [],
      missedPlannedLast7: 0,
    },
  };
  it('without personalization consent contains nothing personal', () => {
    const c = buildCoachContext({ ...full, personalized: false });
    expect(Object.keys(c).sort()).toEqual([
      'localHour',
      'personalized',
      'today',
      'unitSystem',
      'weekday',
    ]);
    expect(contextSummaryLines(c)).toEqual([
      'Nothing personal: general guidance only (personalization is off)',
    ]);
  });
  it('with consent rounds numbers, avoids identifiers and explains what it used', () => {
    const c = buildCoachContext({ ...full, personalized: true });
    expect(c.food?.kcalToday).toBe(1250);
    expect(c.guideKcal).toBe(2100);
    expect(c.localHour).toBe(19);
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/name|email|birth|height|\bweightKg\b|password|address/i);
    expect(contextSummaryLines(c).join(' ')).toMatch(/goals/i);
    expect(contextSummaryLines(c).join(' ')).toMatch(/low-impact/i);
  });
});

describe('intents', () => {
  it('routes common requests', () => {
    expect(classifyIntent('Plan my day').intent).toBe('plan_today');
    expect(classifyIntent('I only have 10 minutes').intent).toBe('busy');
    expect(classifyIntent("I'm travelling and staying in a hotel").intent).toBe('travel');
    expect(classifyIntent('I missed a few days, how do I restart?').intent).toBe('comeback');
    expect(classifyIntent('How was my week?').intent).toBe('weekly_review');
    expect(classifyIntent('My goal is too hard').intent).toBe('goal_too_hard');
    expect(classifyIntent('Any swap for fried chicken?').intent).toBe('food_swap');
    expect(classifyIntent('Give me a 15 minute workout')).toEqual({
      intent: 'workout_request',
      minutes: 15,
    });
    expect(classifyIntent('How many calories do I need?').intent).toBe('calorie_needs');
    expect(classifyIntent('what is my maintenance calories').intent).toBe('calorie_needs');
    expect(classifyIntent('How much protein should I have?').intent).toBe('nutrition_balance');
    expect(classifyIntent('What does a balanced plate look like?').intent).toBe(
      'nutrition_balance',
    );
    expect(classifyIntent('I reached my goal, what now?').intent).toBe('maintenance');
    expect(classifyIntent('How do I keep my weight steady?').intent).toBe('maintenance');
    // The older routes keep working.
    expect(classifyIntent('Any swap for fried chicken?').intent).toBe('food_swap');
    expect(classifyIntent('my weight has plateaued').intent).toBe('plateau');
    expect(classifyIntent('hello there').intent).toBe('general');
  });
});

describe('Daily Fit Plan', () => {
  const base: DailyPlanInput = {
    date: '2026-06-17',
    mode: 'normal',
    localHour: 9,
    lowImpact: false,
    plannedToday: [],
    doneToday: [],
    mealsLoggedToday: 0,
    activeGoalTypes: ['lose'],
    daysSinceWeight: 10,
    seed: 0,
  };
  it('combines movement, food, habits and an optional goal check-in, each with a reason', () => {
    const p = generateDailyPlan(base);
    expect(new Set(p.items.map((i) => i.kind))).toEqual(
      new Set(['workout', 'meal', 'habit', 'goal']),
    );
    for (const i of p.items) expect(i.why.length, i.title).toBeGreaterThan(10);
  });
  it('is deterministic and respects readiness (low-impact first)', () => {
    expect(generateDailyPlan(base)).toEqual(generateDailyPlan(base));
    for (let seed = 0; seed < 6; seed++) {
      const w = generateDailyPlan({ ...base, lowImpact: true, seed }).items.find(
        (i) => i.kind === 'workout',
      )!;
      expect(WORKOUT_BY_ID.get(w.ref!.workoutId!)!.impact).toBe('low');
      expect(w.ref!.lowImpact).toBe(true);
    }
  });
  it('recovery: after three active days it offers a lighter session and explicit rest, with no guilt or medical claims', () => {
    const r = generateDailyPlan({ ...base, recentActiveDays: 3 });
    const w = r.items.find((i) => i.kind === 'workout')!;
    expect(WORKOUT_BY_ID.get(w.ref!.workoutId!)!.impact).toBe('low');
    const rest = r.items.find((i) => i.title.startsWith('Rest'))!;
    expect(rest.detail).toMatch(/good choice/i);
    const text = JSON.stringify(r.items);
    expect(text).not.toMatch(/injur|ill|pregnan|diagnos|overtrain|must|should|failed|miss/i);
    // Not triggered by fewer active days, a planned session, or a session already done today.
    expect(
      generateDailyPlan({ ...base, recentActiveDays: 2 }).items.some((i) =>
        i.title.startsWith('Rest'),
      ),
    ).toBe(false);
    expect(
      generateDailyPlan({ ...base, recentActiveDays: 3, doneToday: [{ title: 'x' }] }).items.some(
        (i) => i.title.startsWith('Rest'),
      ),
    ).toBe(false);
    expect(
      generateDailyPlan({ ...base, mode: 'busy', recentActiveDays: 5 }).items.some((i) =>
        i.title.startsWith('Rest'),
      ),
    ).toBe(false);
  });
  it('counts recent active days in the person’s time zone, ignoring today and older days', () => {
    const done = (iso: string) => ({ status: 'completed', completedAt: iso });
    const sessions = [
      done('2026-06-16T10:00:00Z'),
      done('2026-06-16T20:00:00Z'),
      done('2026-06-15T10:00:00Z'),
      done('2026-06-17T08:00:00Z'),
      done('2026-06-10T10:00:00Z'),
      { status: 'planned', completedAt: null },
    ];
    expect(recentActiveDayCount(sessions, '2026-06-17', 'UTC')).toBe(2);
    // 23:30 UTC on the 16th is already the 17th in Auckland, so it no longer counts as "yesterday".
    expect(
      recentActiveDayCount([done('2026-06-16T23:30:00Z')], '2026-06-17', 'Pacific/Auckland'),
    ).toBe(0);
  });
  it('busy mode is short and light; travel is low-impact; comeback is gentle with no goals or catch-up', () => {
    const busy = generateDailyPlan({ ...base, mode: 'busy' });
    expect(busy.items.length).toBeLessThanOrEqual(3);
    expect(busy.items.find((i) => i.kind === 'workout')!.ref!.minutes).toBe(5);
    const travel = generateDailyPlan({ ...base, mode: 'travel' }).items.find(
      (i) => i.kind === 'workout',
    )!;
    expect(WORKOUT_BY_ID.get(travel.ref!.workoutId!)!.impact).toBe('low');
    const back = generateDailyPlan({
      ...base,
      mode: 'comeback',
      plannedToday: [
        {
          id: 's',
          workoutId: 'w30-afrobeats-party',
          title: 'Big one',
          minutes: 30,
          lowImpact: false,
        },
      ],
    });
    expect(back.items.some((i) => i.kind === 'goal')).toBe(false);
    const bw = back.items.find((i) => i.kind === 'workout')!;
    expect(bw.ref!.minutes).toBe(5);
    expect(bw.title).not.toMatch(/Big one/);
    expect(JSON.stringify(back)).toMatch(/nothing to make up|no need to make up/i);
  });
  it('shows what already happened and what was planned', () => {
    const done = generateDailyPlan({ ...base, doneToday: [{ title: 'Latin Rhythm 10' }] })
      .items[0]!;
    expect(done).toMatchObject({ done: true });
    const planned = generateDailyPlan({
      ...base,
      plannedToday: [
        {
          id: 's1',
          workoutId: 'qf10-latin-rhythm',
          title: 'Latin Rhythm 10',
          minutes: 10,
          lowImpact: false,
        },
      ],
    }).items[0]!;
    expect(planned.ref).toMatchObject({ sessionId: 's1', workoutId: 'qf10-latin-rhythm' });
  });
  it('only nudges a weigh-in when there are goals and it has been a week, and says it is optional', () => {
    expect(
      generateDailyPlan({ ...base, daysSinceWeight: 2 }).items.some((i) => i.kind === 'goal'),
    ).toBe(false);
    expect(
      generateDailyPlan({ ...base, activeGoalTypes: [] }).items.some((i) => i.kind === 'goal'),
    ).toBe(false);
    expect(generateDailyPlan(base).items.find((i) => i.kind === 'goal')!.detail).toMatch(
      /optional/i,
    );
  });
  it('never contains guilt, pressure or unsafe language in any mode, hour or seed', () => {
    for (const mode of PLAN_MODES)
      for (const lowImpact of [false, true])
        for (const seed of [0, 1, 2, 3, 4, 5])
          for (const localHour of [8, 13, 20]) {
            const p = generateDailyPlan({
              ...base,
              mode,
              lowImpact,
              seed,
              localHour,
              mealsLoggedToday: seed % 2,
            });
            expect(unsafeOutputProblems(JSON.stringify(p)), `${mode}/${seed}`).toEqual([]);
          }
  });
});

describe('comeback', () => {
  const done = (iso: string) => ({
    status: 'completed' as const,
    completedAt: iso,
    durationS: 600,
    minutes: 10,
    plannedFor: null,
  });
  const planned = (d: string, status: 'planned' | 'skipped' = 'planned') => ({
    status,
    completedAt: null,
    durationS: null,
    minutes: 10,
    plannedFor: d,
  });
  const now = new Date('2026-06-17T12:00:00Z');
  it('needs training history and a real gap', () => {
    expect(detectComeback([], { now, timeZone: 'UTC' })).toBeNull();
    expect(detectComeback([planned('2026-06-10')], { now, timeZone: 'UTC' })).toBeNull();
    expect(detectComeback([done('2026-06-16T10:00:00Z')], { now, timeZone: 'UTC' })).toBeNull();
    expect(detectComeback([done('2026-06-09T10:00:00Z')], { now, timeZone: 'UTC' })).toMatchObject({
      daysAway: 8,
    });
    expect(
      detectComeback(
        [done('2026-06-13T10:00:00Z'), planned('2026-06-14'), planned('2026-06-15', 'skipped')],
        { now, timeZone: 'UTC' },
      ),
    ).toMatchObject({ daysAway: 4, missedPlanned: 2 });
    expect(
      detectComeback([done('2026-06-13T10:00:00Z'), planned('2026-06-14')], {
        now,
        timeZone: 'UTC',
      }),
    ).toBeNull();
  });
  it('offers a short, low-impact three-session return', () => {
    const s = comebackSessions('2026-06-17');
    expect(s.map((x) => x.plannedFor)).toEqual(['2026-06-17', '2026-06-19', '2026-06-21']);
    for (const x of s) expect(WORKOUT_BY_ID.get(x.workoutId)!.impact).toBe('low');
    expect(s.reduce((n, x) => n + WORKOUT_BY_ID.get(x.workoutId)!.minutes, 0)).toBeLessThanOrEqual(
      25,
    );
  });
});

describe('week facts', () => {
  const s = (iso: string, style = 'latin', minutes = 10) => ({
    status: 'completed',
    completedAt: iso,
    durationS: null,
    minutes,
    style,
    lowImpact: false,
  });
  it("summarizes a week in the person's time zone and reduces weight to a direction", () => {
    const f = buildWeekFacts({
      weekStart: '2026-06-15',
      timeZone: 'UTC',
      activeGoals: 1,
      sessions: [
        s('2026-06-15T09:00:00Z'),
        s('2026-06-16T09:00:00Z', 'afrobeats', 15),
        s('2026-06-09T09:00:00Z'),
      ],
      foodLogTimes: [
        '2026-06-15T08:00:00Z',
        '2026-06-15T12:00:00Z',
        '2026-06-17T12:00:00Z',
        '2026-06-01T12:00:00Z',
      ],
      weights: [
        { weightKg: 80, measuredAt: '2026-06-13T08:00:00Z' },
        { weightKg: 79.9, measuredAt: '2026-06-18T08:00:00Z' },
      ],
    });
    expect(f).toMatchObject({
      sessions: 2,
      minutes: 25,
      activeDays: 2,
      foodLoggedDays: 2,
      activeGoals: 1,
      weightTrend: 'steady',
    });
    expect(f.styles.sort()).toEqual(['afrobeats', 'latin']);
    expect(
      buildWeekFacts({
        weekStart: '2026-06-15',
        timeZone: 'UTC',
        activeGoals: 0,
        sessions: [],
        foodLogTimes: [],
        weights: [],
      }).weightTrend,
    ).toBeNull();
  });
});

describe('minor detection is about a stated age, not any number after "I am"', () => {
  it.each([
    "I'm 16",
    'I am 15 years old',
    'im 17yo',
    "I'm sixteen",
    "I'm 14 and want to lose weight",
    'I am only 13.',
    "I'm 15 can you plan my diet",
  ])('treats %j as a minor', (t) => expect(screenCoachInput(t).kind).toBe('minor'));
  it.each([
    "I'm 5 minutes from the gym",
    'I am 12 weeks pregnant',
    "I'm 10 days into a plan",
    "I'm 7 months postpartum",
    "I'm 12 reps in",
    "I'm 5 kg down",
    "I'm 6 foot 2",
    'I am 8 stone',
    "I'm 45",
    'I am 30 minutes into my run',
  ])('does not call %j a minor', (t) => expect(screenCoachInput(t).kind).toBe('ok'));
});
