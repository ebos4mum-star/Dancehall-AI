import { describe, expect, it } from 'vitest';
import { MockAiProvider, type AiRequest } from '@dancehall/ai';
import { unsafeOutputProblems } from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
class Spy extends MockAiProvider {
  prompts: string[] = [];
  constructor(overrides: ConstructorParameters<typeof MockAiProvider>[0] = {}) {
    super(overrides);
  }
  override async complete(req: AiRequest) {
    this.prompts.push(req.prompt);
    return super.complete(req);
  }
}
const clock = { t: new Date('2026-06-17T09:00:00Z') };
const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );

async function setup(opts: { personalize?: boolean; weightKg?: number; reply?: unknown } = {}) {
  clock.t = new Date('2026-06-17T09:00:00Z');
  const spy = new Spy(opts.reply ? { concierge_chat: opts.reply } : {});
  const s = new MockStore(memory(), () => clock.t, spy);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  if (opts.personalize !== false) await s.setConsent('ai_coach_personalization', true);
  await s.updateProfile({
    displayName: 'Ama Mensah',
    country: 'GH',
    timeZone: 'UTC',
    unitSystem: 'metric',
  });
  await s.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await s.completeOnboarding();
  await s.addWeight({ weightKg: opts.weightKg ?? 81.37, measuredAt: '2026-06-16T08:00:00Z' });
  return { s, spy };
}
const ask = (s: MockStore, text: string, conversationId?: string) =>
  s.sendCoachMessage({ conversationId, text });

describe('privacy of what the coach is sent', () => {
  it('sends nothing personal without the separate personalization consent', async () => {
    const { s, spy } = await setup({ personalize: false });
    const r = await ask(s, 'Plan my day');
    const p = spy.prompts.at(-1)!;
    expect(p).toContain('"personalized":false');
    expect(p).not.toMatch(/\bAma\b|Mensah|1990|81\.37|goals|weightTrend|"activity"/);
    expect(r.reply.usedPersonalData).toBe(false);
    expect(r.reply.because.join(' ')).toMatch(/personalization is off/i);
    expect(await s.getCoachContextSummary!()).toEqual([
      'Nothing personal: general guidance only (personalization is off)',
    ]);
  });
  it('with consent sends a minimal context: no name, birth date, exact weight or free text from records', async () => {
    const { s, spy } = await setup();
    await s.createGoal({
      type: 'lose',
      period: 'monthly',
      startDate: '2026-06-17',
      endDate: '2026-07-17',
      startKg: 81.37,
      targetKg: 79.5,
    });
    const r = await ask(s, 'Plan my day');
    const p = spy.prompts.at(-1)!;
    expect(p).toContain('"personalized":true');
    expect(p).toContain('"goals"');
    expect(p).not.toMatch(/\bAma\b|Mensah|1990|81\.37|dev-user/);
    expect(r.reply.usedPersonalData).toBe(true);
    expect((await s.getCoachContextSummary!()).join(' ')).toMatch(/goals/i);
  });
  it('keeps the user message in history even when the AI cannot answer', async () => {
    const { s } = await setup();
    await s.devSetKillSwitch!(true);
    expect(await code(ask(s, 'Plan my day'))).toBe('feature_disabled');
    const [c] = await s.listConversations!();
    expect(c!.messages.map((m) => m.role)).toEqual(['user']);
  });
});

describe('every change needs confirmation', () => {
  it('proposes but does not apply until the person confirms; dismissing changes nothing', async () => {
    const { s } = await setup();
    const { reply } = await ask(s, 'I only have 10 minutes');
    const add = reply.actions.find((a) => a.kind === 'add_workout')!;
    expect(reply.actions.every((a) => a.status === 'proposed')).toBe(true);
    expect(await s.listSessions()).toHaveLength(0);
    expect((await s.getDailyPlan!())!.mode).toBe('normal');
    const done = await s.decideCoachAction!(add.id, 'applied');
    expect(done.status).toBe('applied');
    expect((await s.listSessions())[0]).toMatchObject({
      plannedFor: '2026-06-17',
      status: 'planned',
    });
    const plan = reply.actions.find((a) => a.kind === 'update_daily_plan')!;
    await s.decideCoachAction!(plan.id, 'dismissed');
    expect((await s.getDailyPlan!())!.mode).toBe('normal');
    expect(await code(s.decideCoachAction!(add.id, 'applied'))).toBe('invalid_input'); // already decided
    expect(await s.listSessions()).toHaveLength(1);
  });
  it('applying a plan change switches the mode', async () => {
    const { s } = await setup();
    const { reply } = await ask(s, "I'm travelling next week");
    await s.decideCoachAction!(
      reply.actions.find((a) => a.kind === 'update_daily_plan')!.id,
      'applied',
    );
    const plan = (await s.getDailyPlan!())!;
    expect(plan.mode).toBe('travel');
    expect(plan.items.find((i) => i.kind === 'workout')!.why).toMatch(/Travelling/);
  });
  it('applies a swap and a habit as plan items, not as edits to the food diary', async () => {
    const { s } = await setup();
    await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-17T08:00:00Z',
      items: [
        {
          name: 'Fried chicken',
          foodId: 'fried-chicken',
          grams: 130,
          kcal: 320,
          proteinG: 23,
          carbsG: 13,
          fatG: 20,
          kcalLow: 272,
          kcalHigh: 368,
          source: 'curated',
          confidence: 'high',
          userEdited: false,
        },
      ],
    });
    const { reply } = await ask(s, 'Any swap for my lunch?');
    const swap = reply.actions.find((a) => a.kind === 'swap_meal')!;
    expect(swap.summary).toMatch(/instead of Chicken, fried|instead of Fried chicken/i);
    await s.decideCoachAction!(swap.id, 'applied');
    expect((await s.getDailyPlan!())!.items.some((i) => /instead of/.test(i.title))).toBe(true);
    expect((await s.listFoodLogs())[0]!.items[0]).toMatchObject({
      foodId: 'fried-chicken',
      grams: 130,
    });
  });
  it('a coach-proposed goal change passes through the normal goal safety rules and never carries a target', async () => {
    const { s } = await setup();
    await s.createGoal({
      type: 'lose',
      period: 'weekly',
      startDate: '2026-06-17',
      endDate: '2026-06-24',
      startKg: 81.37,
      targetKg: 80.6,
    });
    const { reply } = await ask(s, 'My goal is too hard');
    const adj = reply.actions.find((a) => a.kind === 'adjust_goal')!;
    expect(Object.keys(adj.payload).sort()).toEqual(['period', 'replacePeriod', 'type']); // no target field: the rules choose the pace
    await s.decideCoachAction!(adj.id, 'applied');
    const goals = await s.listGoals();
    expect(goals.find((g) => g.period === 'weekly')!.status).toBe('abandoned');
    const fresh = goals.find((g) => g.period === 'monthly' && g.status === 'active')!;
    expect(fresh.targetKg).toBeLessThan(81.37);
    expect(-fresh.plannedWeeklyChangeKg).toBeLessThanOrEqual(81.37 * 0.005 + 0.01); // the gentle default pace
  });
  it('refuses and leaves everything unchanged when a (valid-looking) proposal would break the goal safety rules', async () => {
    // A provider that proposes a loss goal for someone already below the safe range. The schema allows it; confirmation does not make it safe.
    const reply = {
      message: 'Let us set a goal.',
      because: ['x'],
      supportReferral: false,
      proposedChanges: [
        {
          kind: 'adjust_goal',
          summary: 'Set a loss goal',
          payload: { type: 'lose', period: 'monthly' },
        },
      ],
    };
    const { s } = await setup({ weightKg: 52, reply });
    await s.createGoal({
      type: 'maintain',
      period: 'weekly',
      startDate: '2026-06-17',
      endDate: '2026-06-24',
      startKg: 52,
      targetKg: 52,
    });
    const r = await ask(s, 'Plan my day');
    expect(await code(s.decideCoachAction!(r.reply.actions[0]!.id, 'applied'))).toBe(
      'goal_blocked',
    );
    const goals = await s.listGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ type: 'maintain', status: 'active' });
    expect((await s.getConversation!(r.conversation.id))!.messages[1]!.actions[0]!.status).toBe(
      'proposed',
    ); // still open, nothing half-applied
  });
  it('rejects a proposal that points at something that does not exist', async () => {
    const reply = {
      message: 'Try this.',
      because: ['x'],
      supportReferral: false,
      proposedChanges: [
        {
          kind: 'add_workout',
          summary: 'Add a workout',
          payload: { workoutId: 'does-not-exist', plannedFor: '2026-06-17' },
        },
      ],
    };
    const { s } = await setup({ reply });
    const r = await ask(s, 'Plan my day');
    expect(await code(s.decideCoachAction!(r.reply.actions[0]!.id, 'applied'))).toBe(
      'invalid_input',
    );
    expect(await s.listSessions()).toHaveLength(0);
  });
});

describe('safeguards', () => {
  it('answers risky, extreme, medical and minor messages with fixed safe text and no proposals', async () => {
    const { s, spy } = await setup();
    const before = spy.prompts.length;
    for (const t of [
      'How can I lose 10 kg in a week?',
      'I have chest pain when I dance',
      "I'm starving myself",
      "I'm 15",
    ]) {
      const { reply } = await ask(s, t);
      expect(reply.actions, t).toEqual([]);
      expect(reply.usedPersonalData, t).toBe(false);
      expect(unsafeOutputProblems(reply.content), t).toEqual([]);
    }
    expect(spy.prompts.length).toBe(before); // no AI call was made for any of them
    expect((await s.getAiUsage!()).features.find((f) => f.feature === 'concierge_chat')!.used).toBe(
      0,
    );
  });
  it('safety replies are never blocked by quota, budget or the kill switch state of normal chat', async () => {
    const { s } = await setup();
    for (let i = 0; i < 20; i++) await ask(s, 'Plan my day');
    expect(await code(ask(s, 'Plan my day'))).toBe('quota_exceeded');
    const r = await ask(s, 'I want to die');
    expect(r.reply.supportReferral).toBe(true);
  });
  it('enforces the free allowance, shows usage, and lets the allowance reset next month', async () => {
    const { s } = await setup();
    for (let i = 0; i < 20; i++) await ask(s, 'Plan my day');
    const u = await s.getAiUsage!();
    expect(u.features.find((f) => f.feature === 'concierge_chat')).toEqual({
      feature: 'concierge_chat',
      used: 20,
      allowance: 20,
    });
    expect(await code(ask(s, 'Plan my day'))).toBe('quota_exceeded');
    clock.t = new Date('2026-07-02T09:00:00Z');
    expect((await ask(s, 'Plan my day')).reply.content.length).toBeGreaterThan(10);
  });
  it('the kill switch and the monthly budget pause AI but not the rule-based plan or logging', async () => {
    const { s } = await setup();
    await s.devSetKillSwitch!(true);
    expect((await s.getAiUsage!()).paused).toBe(true);
    expect(await code(ask(s, 'Plan my day'))).toBe('feature_disabled');
    expect(await code(s.analyzeMealPhoto!({ seed: 0 }))).toBeTruthy();
    expect((await s.getDailyPlan!())!.items.length).toBeGreaterThan(2);
    await s.createSession({ title: 'x', minutes: 10, status: 'completed' });
    await s.devSetKillSwitch!(false);
    await s.devSetBudgetCeiling!(0.00001);
    expect(await code(ask(s, 'Plan my day'))).toBe('budget_exhausted');
    expect((await s.getAiUsage!()).paused).toBe(true);
  });
  it('never produces unsafe text across a range of questions', async () => {
    const { s } = await setup();
    for (const t of [
      'Plan my day',
      'I missed a week',
      'I only have 5 minutes',
      'My goal is too hard',
      'What about my weight?',
      "I'm travelling",
      'How was my week?',
    ]) {
      const { reply } = await ask(s, t);
      expect(unsafeOutputProblems(JSON.stringify(reply)), t).toEqual([]);
    }
  });
});

describe('Daily Fit Plan', () => {
  it('is created once per day, keeps ticks, and can switch mode', async () => {
    const { s } = await setup();
    const p = (await s.getDailyPlan!())!;
    expect(p.items.length).toBeGreaterThan(3);
    expect(p.items.every((i) => i.why.length > 10)).toBe(true);
    const habit = p.items.find((i) => i.kind === 'habit')!;
    await s.setPlanItemDone!(habit.id, true);
    const again = (await s.getDailyPlan!())!;
    expect(again.id).toBe(p.id);
    expect(again.items.find((i) => i.id === habit.id)!.doneAt).not.toBeNull();
    await s.setPlanItemDone!(habit.id, false);
    const busy = await s.regenerateDailyPlan!('busy');
    expect(busy.mode).toBe('busy');
    expect(busy.items.length).toBeLessThanOrEqual(3);
    expect(await code(s.setPlanItemDone!('missing', true))).toBe('not_found');
  });
  it("reflects today's sessions and respects readiness", async () => {
    const { s } = await setup();
    await s.saveReadiness({ dizziness_or_loss_of_balance: true });
    const done = await s.createSession({
      workoutId: 'qf10-latin-rhythm',
      title: 'Latin Rhythm 10',
      minutes: 10,
      status: 'completed',
      durationS: 600,
    });
    expect(done.status).toBe('completed');
    const p = (await s.regenerateDailyPlan!('normal'))!;
    expect(p.items[0]).toMatchObject({ kind: 'workout' });
    expect(p.items[0]!.doneAt).not.toBeNull();
  });
  it('does not create a new plan without health consent, but keeps the existing one readable', async () => {
    const { s } = await setup();
    await s.getDailyPlan!();
    await s.setConsent('health_data_processing', false);
    expect(await s.getDailyPlan!()).not.toBeNull();
    expect(await s.getDailyPlan!('2026-06-30')).toBeNull();
    expect(await code(s.regenerateDailyPlan!('busy'))).toBe('consent_required');
  });
  it('detects a comeback and offers gentle low-impact sessions, applied only on confirmation', async () => {
    const { s } = await setup();
    await s.createSession({
      workoutId: 'qf10-latin-rhythm',
      title: 'Latin Rhythm 10',
      minutes: 10,
      status: 'completed',
      completedAt: '2026-06-07T09:00:00Z',
      durationS: 600,
    });
    expect(await s.comebackStatus!()).toMatchObject({ daysAway: 10 });
    const { reply } = await ask(s, 'I missed a few days');
    expect(reply.content).toMatch(/Welcome back/);
    const sessions = reply.actions.filter((a) => a.kind === 'add_workout');
    expect(sessions).toHaveLength(3);
    expect((await s.listSessions()).filter((x) => x.status === 'planned')).toHaveLength(0);
    for (const a of sessions) await s.decideCoachAction!(a.id, 'applied');
    const planned = (await s.listSessions()).filter((x) => x.status === 'planned');
    expect(planned).toHaveLength(3);
    expect(planned.every((x) => x.lowImpact)).toBe(true);
  });
});

describe('weekly review', () => {
  it('needs the personalization consent, is encouraging, replaces the same week, and is metered', async () => {
    const a = await setup({ personalize: false });
    expect(await code(a.s.generateWeeklyReview!())).toBe('coach_consent_required');
    const { s } = await setup();
    await s.createSession({
      workoutId: 'qf10-latin-rhythm',
      title: 'Latin Rhythm 10',
      minutes: 10,
      status: 'completed',
      completedAt: '2026-06-15T09:00:00Z',
      durationS: 600,
      style: 'latin',
    });
    const r = await s.generateWeeklyReview!();
    expect(r.weekStart).toBe('2026-06-15');
    expect(r.content.tone).toBe('encouraging');
    expect(r.content.highlights.join(' ')).toMatch(/moved on 1 day/);
    expect(unsafeOutputProblems(JSON.stringify(r.content))).toEqual([]);
    expect(await code(s.generateWeeklyReview!())).toBe('quota_exceeded'); // free tier: one a month
    expect(await s.listWeeklyReviews!()).toHaveLength(1);
    expect(
      (await s.getAiUsage!()).features.find((f) => f.feature === 'weekly_review'),
    ).toMatchObject({ used: 1, allowance: 1 });
  });
});

describe('conversation history and privacy controls', () => {
  it('lists, continues, deletes one or all, and purges old conversations', async () => {
    const { s } = await setup();
    const first = await ask(s, 'Plan my day');
    const cont = await ask(s, 'I only have 10 minutes', first.conversation.id);
    expect(cont.conversation.messages).toHaveLength(4);
    const second = await ask(s, 'hello');
    expect((await s.listConversations!()).map((c) => c.id)).toEqual([
      second.conversation.id,
      first.conversation.id,
    ]);
    expect((await s.getConversation!(first.conversation.id))!.messages).toHaveLength(4);
    await s.deleteConversation!(second.conversation.id);
    expect(await s.getConversation!(second.conversation.id)).toBeNull();
    clock.t = new Date('2026-09-20T09:00:00Z'); // 95+ days later
    expect(await s.purgeOldCoachData!()).toBe(1);
    expect(await s.listConversations!()).toHaveLength(0);
    await ask(s, 'hello');
    await s.deleteAllConversations!();
    expect(await s.listConversations!()).toHaveLength(0);
    expect(await code(ask(s, 'x', 'no-such-conversation'))).toBe('not_found');
    expect(await code(ask(s, ''))).toBe('invalid_input');
  });
  it('needs health-data consent to chat but history stays readable after withdrawal', async () => {
    const { s } = await setup();
    await ask(s, 'Plan my day');
    await s.setConsent('health_data_processing', false);
    expect(await code(ask(s, 'Plan my day'))).toBe('consent_required');
    expect(await s.listConversations!()).toHaveLength(1);
  });
});
