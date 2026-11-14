import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FOOD_BY_ID,
  PLAN_MODES,
  WORKOUT_BY_ID,
  ageYearsOn,
  buildCoachContext,
  contextSummaryLines,
  detectComeback,
  generateDailyPlan,
  localDateKey,
  monthlyAllowance,
  proposeGoal,
  weekStartOf,
  type PlanMode,
} from '@dancehall/shared';
import { proposedChangeSchema } from '@dancehall/ai';
import {
  StoreError,
  type AiUsageSummary,
  type CoachAction,
  type CoachMessage,
  type Conversation,
  type DailyPlan,
  type DailyPlanItem,
  type DataStore,
  type StoreErrorCode,
  type WeeklyReviewRecord,
} from './types';

type Row = Record<string, unknown>;
type Base = Pick<
  DataStore,
  | 'getProfile'
  | 'getPrivate'
  | 'getConsents'
  | 'listSessions'
  | 'listFoodLogs'
  | 'listWeights'
  | 'listGoals'
  | 'latestReadiness'
  | 'createSession'
  | 'createGoal'
>;
export interface CoachAdapterDeps {
  db: SupabaseClient;
  base: Base;
  /** Base URL of the server AI gateway (EXPO_PUBLIC_AI_API_URL). Absent until the owner deploys it: AI calls then report "unavailable". */
  aiApiUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  emit: () => void;
}

const SERVER_CODES: Record<string, StoreErrorCode> = {
  quota_exceeded: 'quota_exceeded',
  budget_exhausted: 'budget_exhausted',
  feature_disabled: 'feature_disabled',
  ai_paused: 'ai_paused',
  unauthenticated: 'not_authenticated',
  forbidden: 'ai_consent_required',
  not_found: 'not_found',
  validation_failed: 'invalid_input',
};

export function createCoachAdapter(d: CoachAdapterDeps): Partial<DataStore> {
  const { db, base, emit } = d;
  const now = d.now ?? (() => new Date());
  const ok = <T>(r: { data: T | null; error: { message?: string } | null }): T => {
    if (r.error) {
      const m = r.error.message ?? '';
      if (/row-level security|consent_required/i.test(m))
        throw new StoreError('consent_required', m);
      throw new StoreError('unknown', m);
    }
    return r.data as T;
  };
  const uid = async () => {
    const { data } = await db.auth.getUser();
    if (!data.user) throw new StoreError('not_authenticated');
    return data.user.id;
  };
  const today = async () => localDateKey(now(), (await base.getProfile()).timeZone);

  /** Calls the server AI gateway with the person's session token. The app never holds a provider key. */
  async function callServer<T>(path: string, body: unknown): Promise<T> {
    if (!d.aiApiUrl) throw new StoreError('ai_unavailable', 'The AI service is not available yet.');
    const { data } = await db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new StoreError('not_authenticated');
    let res: Response;
    try {
      res = await (d.fetchImpl ?? fetch)(`${d.aiApiUrl}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new StoreError('ai_unavailable');
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    if (!res.ok)
      throw new StoreError(
        SERVER_CODES[json.error?.code ?? ''] ?? 'ai_unavailable',
        json.error?.message,
      );
    return json as T;
  }

  const toAction = (r: Row): CoachAction => ({
    id: r.id as string,
    messageId: r.message_id as string,
    kind: r.kind as CoachAction['kind'],
    summary: r.summary as string,
    payload: r.payload as Record<string, unknown>,
    status: r.status as CoachAction['status'],
    decidedAt: (r.decided_at as string | null) ?? null,
  });
  const toMessage = (r: Row): CoachMessage => ({
    id: r.id as string,
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
    because: (r.because as string[]) ?? [],
    supportReferral: r.support_referral === true,
    usedPersonalData: r.used_personal_data === true,
    provider: r.provider as 'mock' | 'live',
    createdAt: r.created_at as string,
    actions: ((r.coach_actions as Row[] | undefined) ?? []).map(toAction),
  });
  const toConversation = (r: Row): Conversation => ({
    id: r.id as string,
    title: r.title as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    messages: ((r.ai_messages as Row[] | undefined) ?? [])
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map(toMessage),
  });
  const SELECT_CONV = '*, ai_messages(*, coach_actions(*))';

  const toPlan = (r: Row): DailyPlan => ({
    id: r.id as string,
    planDate: r.plan_date as string,
    mode: r.mode as PlanMode,
    generatedBy: r.generated_by as 'rules' | 'coach',
    items: ((r.daily_plan_items as Row[] | undefined) ?? [])
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((i): DailyPlanItem => ({
        id: i.id as string,
        position: Number(i.position),
        kind: i.kind as DailyPlanItem['kind'],
        title: i.title as string,
        detail: (i.detail as string | null) ?? '',
        why: (i.why as string | null) ?? '',
        ref: (i.ref as DailyPlanItem['ref']) ?? undefined,
        doneAt: (i.done_at as string | null) ?? null,
      })),
  });

  async function buildDraft(date: string, mode: PlanMode) {
    const [profile, sessions, logs, goals, weights, readiness] = await Promise.all([
      base.getProfile(),
      base.listSessions(),
      base.listFoodLogs(),
      base.listGoals(),
      base.listWeights(),
      base.latestReadiness(),
    ]);
    const tz = profile.timeZone;
    const latestW = [...weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
    const hour =
      Number(
        new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          hour12: false,
          timeZone: tz ?? 'UTC',
        }).format(now()),
      ) % 24;
    return generateDailyPlan({
      date,
      mode,
      localHour: hour,
      lowImpact: readiness?.outcome === 'low_impact_and_check_with_professional',
      plannedToday: sessions
        .filter((x) => x.status === 'planned' && x.plannedFor === date)
        .map((x) => ({
          id: x.id,
          workoutId: x.workoutId,
          title: x.title,
          minutes: x.minutes,
          lowImpact: x.lowImpact,
        })),
      doneToday: sessions
        .filter(
          (x) =>
            x.status === 'completed' && x.completedAt && localDateKey(x.completedAt, tz) === date,
        )
        .map((x) => ({ title: x.title })),
      mealsLoggedToday: logs.filter((l) => localDateKey(l.loggedAt, tz) === date).length,
      activeGoalTypes: goals.filter((g) => g.status === 'active').map((g) => g.type),
      daysSinceWeight: latestW
        ? Math.floor((now().getTime() - Date.parse(latestW.measuredAt)) / 86_400_000)
        : null,
      seed: Number(date.replace(/-/g, '')) % 97,
    });
  }
  async function savePlan(date: string, mode: PlanMode): Promise<DailyPlan> {
    const draft = await buildDraft(date, mode);
    const p = ok(
      await db
        .from('daily_plans')
        .insert({ plan_date: date, mode, generated_by: 'rules' })
        .select('*')
        .single(),
    ) as Row;
    if (draft.items.length) {
      ok(
        await db.from('daily_plan_items').insert(
          draft.items.map((it, position) => ({
            plan_id: p.id,
            position,
            kind: it.kind,
            title: it.title,
            detail: it.detail,
            why: it.why,
            ref: it.ref ?? null,
            done_at: it.done ? now().toISOString() : null,
          })),
        ),
      );
    }
    const full = ok(
      await db
        .from('daily_plans')
        .select('*, daily_plan_items(*)')
        .eq('id', p.id as string)
        .single(),
    ) as Row;
    emit();
    return toPlan(full);
  }
  async function appendItem(
    date: string,
    it: {
      kind: DailyPlanItem['kind'];
      title: string;
      detail: string;
      why: string;
      ref?: DailyPlanItem['ref'];
    },
  ) {
    let plan = ok(
      await db
        .from('daily_plans')
        .select('id, daily_plan_items(id)')
        .eq('plan_date', date)
        .maybeSingle(),
    ) as Row | null;
    if (!plan) {
      const created = await savePlan(date, 'normal');
      plan = { id: created.id, daily_plan_items: created.items };
    }
    const position = ((plan.daily_plan_items as unknown[]) ?? []).length;
    ok(
      await db
        .from('daily_plan_items')
        .insert({ plan_id: plan.id, position, ...it, ref: it.ref ?? null }),
    );
  }

  async function applyChange(a: CoachAction) {
    const parsed = proposedChangeSchema.safeParse({
      kind: a.kind,
      summary: a.summary,
      payload: a.payload,
    });
    if (!parsed.success) throw new StoreError('invalid_input', 'proposal');
    const c = parsed.data;
    const date = await today();
    switch (c.kind) {
      case 'add_workout': {
        const w = WORKOUT_BY_ID.get(c.payload.workoutId);
        if (!w) throw new StoreError('invalid_input', 'workout');
        await base.createSession({
          workoutId: w.id,
          title: w.title,
          style: w.style,
          minutes: w.minutes,
          plannedFor: c.payload.plannedFor,
          lowImpact: c.payload.lowImpact ?? false,
          source: 'quick_fit',
        });
        return;
      }
      case 'update_daily_plan':
        await api.regenerateDailyPlan!(c.payload.mode, c.payload.date);
        return;
      case 'add_habit':
        await appendItem(date, {
          kind: 'habit',
          title: c.payload.title,
          detail: 'Added from your coach. Tick it off whenever you do it.',
          why: 'You asked your coach to add this habit.',
        });
        return;
      case 'swap_meal': {
        const to = FOOD_BY_ID.get(c.payload.toFoodId);
        const from = FOOD_BY_ID.get(c.payload.fromFoodId);
        if (!to || !from) throw new StoreError('invalid_input', 'food');
        await appendItem(date, {
          kind: 'meal',
          title: `Try ${to.name} instead of ${from.name}`,
          detail: `About ${Math.round(c.payload.grams)} g, whenever it suits.`,
          why: 'A comparable swap from the reference data. An idea, not a rule.',
          ref: { foodId: to.id },
        });
        return;
      }
      case 'adjust_goal': {
        // Same safety rules as any goal: the model never supplies a target.
        const [priv, weights, goals] = await Promise.all([
          base.getPrivate(),
          base.listWeights(),
          base.listGoals(),
        ]);
        const latest = [...weights].sort((x, y) => y.measuredAt.localeCompare(x.measuredAt))[0];
        if (!priv || !latest) throw new StoreError('profile_incomplete');
        const proposal = proposeGoal({
          type: c.payload.type,
          period: c.payload.period,
          startDate: date,
          startKg: latest.weightKg,
          heightCm: priv.heightCm,
          ageYears: ageYearsOn(priv.birthDate, now()),
        });
        if (proposal.status === 'block' || !proposal.goal)
          throw new StoreError('goal_blocked', proposal.reasons[0]);
        const ending = goals.filter(
          (g) =>
            g.status === 'active' &&
            (g.period === c.payload.period || g.period === c.payload.replacePeriod),
        );
        for (const g of ending)
          ok(await db.from('goals').update({ status: 'abandoned' }).eq('id', g.id));
        try {
          await base.createGoal(proposal.goal);
        } catch (e) {
          for (const g of ending)
            await db.from('goals').update({ status: 'active' }).eq('id', g.id);
          throw e;
        }
        return;
      }
    }
  }

  const api: Partial<DataStore> = {
    async listConversations() {
      return (
        ok(
          await db
            .from('ai_conversations')
            .select(SELECT_CONV)
            .order('updated_at', { ascending: false })
            .limit(50),
        ) as Row[]
      ).map(toConversation);
    },
    async getConversation(id) {
      const r = ok(
        await db.from('ai_conversations').select(SELECT_CONV).eq('id', id).maybeSingle(),
      ) as Row | null;
      return r ? toConversation(r) : null;
    },
    async sendCoachMessage(input) {
      const text = input.text.trim();
      if (text.length < 1 || text.length > 1000) throw new StoreError('invalid_input', 'message');
      const out = await callServer<{ conversationId: string; messageId: string }>(
        '/v1/coach/messages',
        { conversationId: input.conversationId ?? null, text },
      );
      const conversation = (await api.getConversation!(out.conversationId))!;
      const reply =
        conversation.messages.find((m) => m.id === out.messageId) ??
        conversation.messages[conversation.messages.length - 1]!;
      emit();
      return { conversation, reply };
    },
    async deleteConversation(id) {
      ok(await db.from('ai_conversations').delete().eq('id', id));
      emit();
    },
    async deleteAllConversations() {
      ok(await db.from('ai_conversations').delete().not('id', 'is', null));
      emit();
    },
    async purgeOldCoachData() {
      return 0; // retention runs as a server job (coach_purge_old); nothing to do on the device
    },
    /** Applies first, then records the decision: if applying fails the proposal stays open. */
    async decideCoachAction(id, decision) {
      const row = ok(
        await db.from('coach_actions').select('*').eq('id', id).maybeSingle(),
      ) as Row | null;
      if (!row) throw new StoreError('not_found');
      const action = toAction(row);
      if (action.status !== 'proposed') throw new StoreError('invalid_input', 'already decided');
      if (decision === 'applied') await applyChange(action);
      const updated = ok(
        await db
          .from('coach_actions')
          .update({ status: decision })
          .eq('id', id)
          .select('*')
          .single(),
      ) as Row;
      emit();
      return toAction(updated);
    },

    async getDailyPlan(date) {
      const d = date ?? (await today());
      const r = ok(
        await db
          .from('daily_plans')
          .select('*, daily_plan_items(*)')
          .eq('plan_date', d)
          .maybeSingle(),
      ) as Row | null;
      if (r) return toPlan(r);
      const consents = await base.getConsents();
      return consents.health_data_processing ? savePlan(d, 'normal') : null;
    },
    async regenerateDailyPlan(mode, date) {
      if (!PLAN_MODES.includes(mode)) throw new StoreError('invalid_input', 'mode');
      const d = date ?? (await today());
      ok(await db.from('daily_plans').delete().eq('plan_date', d));
      return savePlan(d, mode);
    },
    async setPlanItemDone(itemId, done) {
      ok(
        await db
          .from('daily_plan_items')
          .update({ done_at: done ? now().toISOString() : null })
          .eq('id', itemId),
      );
      emit();
    },
    async comebackStatus() {
      const [sessions, profile] = await Promise.all([base.listSessions(), base.getProfile()]);
      return detectComeback(sessions, { now: now(), timeZone: profile.timeZone });
    },

    async listWeeklyReviews() {
      return (
        ok(
          await db
            .from('weekly_reviews')
            .select('*')
            .order('week_start', { ascending: false })
            .limit(52),
        ) as Row[]
      ).map((r): WeeklyReviewRecord => ({
        id: r.id as string,
        weekStart: r.week_start as string,
        content: r.content as WeeklyReviewRecord['content'],
        provider: r.provider as 'mock' | 'live',
        createdAt: r.created_at as string,
      }));
    },
    async generateWeeklyReview(weekStart) {
      const out = await callServer<{
        id: string;
        weekStart: string;
        content: WeeklyReviewRecord['content'];
        provider: 'mock' | 'live';
      }>('/v1/coach/weekly-review', weekStart ? { weekStart } : {});
      emit();
      return {
        id: out.id,
        weekStart: out.weekStart,
        content: out.content,
        provider: out.provider,
        createdAt: now().toISOString(),
      };
    },

    async getAiUsage(): Promise<AiUsageSummary> {
      const month = now().toISOString().slice(0, 7);
      const [usage, flags, prefs, consents] = await Promise.all([
        db.from('ai_user_usage').select('feature, count').eq('month', month),
        db.from('feature_flags').select('key, enabled').like('key', 'ai.kill%'),
        db.from('ai_preferences').select('ai_paused').maybeSingle(),
        base.getConsents(),
      ]);
      const used = new Map((ok(usage) as Row[]).map((r) => [r.feature as string, Number(r.count)]));
      const staffPaused = ((ok(flags) as Row[]) ?? []).some(
        (f) => f.key === 'ai.kill_all' && f.enabled === true,
      );
      const userPaused = ((ok(prefs) as Row | null)?.ai_paused ?? false) === true;
      return {
        month,
        features: (['concierge_chat', 'weekly_review', 'food_photo'] as const).map((feature) => ({
          feature,
          used: used.get(feature) ?? 0,
          allowance: monthlyAllowance('free', feature),
        })),
        paused: staffPaused || userPaused || !d.aiApiUrl,
        userPaused,
        staffPaused,
        personalization: consents.ai_coach_personalization,
      };
    },
    /** The person's own AI pause. Separate from the staff kill switch, which the app can neither read as a setting nor change. */
    async setAiPaused(on) {
      await uid();
      ok(await db.from('ai_preferences').upsert({ ai_paused: on }, { onConflict: 'user_id' }));
      emit();
    },
    async getCoachContextSummary() {
      const [consents, sessions, profile] = await Promise.all([
        base.getConsents(),
        base.listSessions(),
        base.getProfile(),
      ]);
      const personalized = consents.ai_coach_personalization;
      const tz = profile.timeZone;
      const wk = weekStartOf(localDateKey(now(), tz));
      const done = sessions.filter(
        (s) =>
          s.status === 'completed' &&
          s.completedAt &&
          weekStartOf(localDateKey(s.completedAt, tz)) === wk,
      );
      return contextSummaryLines(
        buildCoachContext({
          personalized,
          unitSystem: profile.unitSystem,
          now: now(),
          timeZone: tz,
          activity: personalized
            ? {
                sessionsThisWeek: done.length,
                minutesThisWeek: done.reduce((n, s) => n + s.minutes, 0),
                activeDaysThisWeek: new Set(done.map((s) => localDateKey(s.completedAt!, tz))).size,
                daysSinceLastSession: null,
                plannedToday: [],
                missedPlannedLast7: 0,
              }
            : undefined,
        }),
      );
    },

    async listPhotoAnalyses() {
      return (
        ok(
          await db
            .from('food_photo_analyses')
            .select('*')
            .order('requested_at', { ascending: false })
            .limit(100),
        ) as Row[]
      ).map((r) => ({
        id: r.id as string,
        status: r.status as 'uploaded' | 'succeeded' | 'failed' | 'deleted',
        provider: r.provider as 'mock' | 'live',
        requestedAt: r.requested_at as string,
        analyzedAt: (r.analyzed_at as string | null) ?? null,
        deleteAfter: (r.delete_after as string | null) ?? null,
        saved: r.saved === true,
        deletedAt: (r.deleted_at as string | null) ?? null,
      }));
    },
    /** Keeping a photo is the person's choice; un-saving restarts the 24-hour clock (a database trigger). */
    async setPhotoSaved(id, saved) {
      ok(await db.from('food_photo_analyses').update({ saved }).eq('id', id));
      emit();
    },
    async purgeExpiredPhotos() {
      return 0; // deletion of stored photos is a server job (see runPhotoRetention); the device never deletes storage objects
    },

    /** Records the request; the irreversible purge is a separate trusted server job after a configurable grace period (app_config). */
    async requestAccountDeletion() {
      const r = ok(await db.rpc('request_account_deletion')) as Row;
      emit();
      return {
        id: r.id as string,
        scheduledFor: r.scheduled_for as string,
        status: 'requested' as const,
      };
    },
    async cancelAccountDeletion() {
      const r = ok(await db.rpc('cancel_account_deletion')) as boolean;
      emit();
      return r === true;
    },
    async getAccountDeletionRequest() {
      const r = ok(
        await db
          .from('account_deletion_requests')
          .select('id, scheduled_for')
          .eq('status', 'pending')
          .maybeSingle(),
      ) as Row | null;
      return r
        ? {
            id: r.id as string,
            scheduledFor: r.scheduled_for as string,
            status: 'requested' as const,
          }
        : null;
    },
  };
  return api;
}
