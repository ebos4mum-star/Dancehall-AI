import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PREFS,
  buildCoachContext,
  buildWeekFacts,
  calorieNeedsFromRecords,
  energyGuideFromTargets,
  addDaysIso,
  coachWellnessContext,
  parsePrefs,
  wellnessEntryFromRow,
  WELLNESS_FAIL_CLOSED,
  type WellnessEntry,
  type WellnessPrefs,
  FREE_ENTITLEMENT,
  localDateKey,
  weekStartOf,
  type ConsentPurpose,
  type Entitlement,
} from '@dancehall/shared';
import type { PhotoStorage, ServerRepo } from './ports';

type Row = Record<string, unknown>;
function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/**
 * ServerRepo over Supabase for TRUSTED SERVER CODE (service-role client). Every query is scoped by the verified userId, because the
 * service role bypasses row-level security: the scoping here IS the authorization. Not yet run against a live project.
 */
export class SupabaseServerRepo implements ServerRepo {
  constructor(private readonly db: SupabaseClient) {}

  async authenticate(token: string) {
    const { data, error } = await this.db.auth.getUser(token);
    return error || !data.user ? null : { userId: data.user.id };
  }
  /** No store webhook exists yet, so everyone is on the free entitlement. Paid tiers cannot be reached by accident. */
  async entitlement(_userId: string): Promise<Entitlement> {
    return FREE_ENTITLEMENT;
  }
  async hasConsent(userId: string, purpose: ConsentPurpose) {
    const r = ok(
      await this.db
        .from('consents')
        .select('granted')
        .eq('user_id', userId)
        .eq('purpose', purpose)
        .order('id', { ascending: false })
        .limit(1),
      'consents',
    ) as Row[];
    return r[0]?.granted === true;
  }

  /**
   * The person's wellness logs (last 8 days) and preferences, validated. Scoped by userId like every other query here. If either read fails, the
   * result is `failed`, and callers share NO wellness numbers rather than risk showing numbers a person asked not to see.
   */
  private async wellness(
    userId: string,
    today: string,
    sinceDay = addDaysIso(today, -8),
  ): Promise<
    { failed: false; entries: WellnessEntry[]; prefs: WellnessPrefs | null } | { failed: true }
  > {
    try {
      const [entries, prefs] = await Promise.all([
        this.db
          .from('wellness_entries')
          .select('id,kind,day,amount,amount2,label,created_at')
          .eq('user_id', userId)
          .gte('day', sinceDay)
          .order('day', { ascending: false })
          .limit(500),
        this.db.from('wellness_prefs').select('data').eq('user_id', userId).maybeSingle(),
      ]);
      const rows = (ok(entries, 'wellness_entries') ?? []) as Row[];
      const p = ok(prefs, 'wellness_prefs') as Row | null;
      return {
        failed: false,
        entries: rows
          .map((r) => wellnessEntryFromRow(r, today))
          .filter((e): e is WellnessEntry => e !== null),
        prefs: p ? parsePrefs(p.data) : null,
      };
    } catch {
      return { failed: true };
    }
  }

  private async records(userId: string) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const [profile, sessions, logs, weights, goals] = await Promise.all([
      this.db.from('profiles').select('time_zone, unit_system').eq('id', userId).maybeSingle(),
      this.db
        .from('workout_sessions')
        .select('status, completed_at, duration_s, minutes, style, low_impact, planned_for, title')
        .eq('user_id', userId)
        .gte('created_at', since),
      this.db
        .from('food_logs')
        .select('logged_at, food_log_items(kcal)')
        .eq('user_id', userId)
        .gte('logged_at', since),
      this.db
        .from('weight_entries')
        .select('weight_kg, measured_at')
        .eq('user_id', userId)
        .gte('measured_at', since),
      this.db.from('goals').select('type, period').eq('user_id', userId).eq('status', 'active'),
    ]);
    return {
      profile: (ok(profile, 'profiles') ?? {}) as Row,
      sessions: (ok(sessions, 'workout_sessions') ?? []) as Row[],
      logs: (ok(logs, 'food_logs') ?? []) as Row[],
      weights: (ok(weights, 'weight_entries') ?? []) as Row[],
      goals: (ok(goals, 'goals') ?? []) as Row[],
    };
  }

  /**
   * The daily calorie guide the coach may mention, from the SAME engine as every screen in the app (`calorieNeedsFromRecords`), so the coach can never quote a number the
   * person's own Goals screen would not show. Read-only; every query is scoped by the verified user id. Uses the latest weight however old it is. Fails closed: any
   * read error, missing fact or withheld estimate (cautious readiness, hidden numbers, professional advice needed) gives NO guide. PROVISIONAL: not professionally reviewed.
   */
  private async calorieGuide(
    userId: string,
    prefs: WellnessPrefs | null,
    now: Date,
  ): Promise<{ kcal: number; weightDaysOld?: number } | undefined> {
    try {
      const first = (v: unknown): Row | null =>
        (Array.isArray(v) ? (v[0] ?? null) : v) as Row | null;
      const [priv, weights, goals, readiness] = await Promise.all([
        this.db
          .from('profile_private')
          .select('birth_date, height_cm, sex, activity_level')
          .eq('user_id', userId)
          .maybeSingle(),
        this.db
          .from('weight_entries')
          .select('weight_kg, measured_at')
          .eq('user_id', userId)
          .order('measured_at', { ascending: false })
          .limit(1),
        this.db
          .from('goals')
          .select('type, status, end_date, target_kg, planned_weekly_change_kg')
          .eq('user_id', userId)
          .eq('status', 'active'),
        this.db
          .from('readiness_screenings')
          .select('outcome')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      const p = first(ok(priv, 'profile_private'));
      const w = first(ok(weights, 'weight_entries'));
      const outcome = first(ok(readiness, 'readiness_screenings'))?.outcome;
      const targets = calorieNeedsFromRecords({
        prefs: prefs ?? DEFAULT_PREFS,
        readinessOutcome:
          outcome === 'clear' || outcome === 'low_impact_and_check_with_professional'
            ? outcome
            : null,
        priv: p
          ? ({
              birthDate: String(p.birth_date),
              heightCm: Number(p.height_cm),
              sex: p.sex,
              activityLevel: p.activity_level,
            } as never)
          : null,
        latestWeightKg: w ? Number(w.weight_kg) : null,
        latestWeightAt: w ? String(w.measured_at) : null,
        goals: ((ok(goals, 'goals') ?? []) as Row[]).map((g) => ({
          type: g.type,
          status: String(g.status),
          endDate: String(g.end_date),
          targetKg: Number(g.target_kg),
          plannedWeeklyChangeKg: Number(g.planned_weekly_change_kg),
        })) as never,
        now,
      });
      const g = energyGuideFromTargets(targets);
      return g ? { kcal: g.guideKcal, weightDaysOld: g.staleWeightDays } : undefined;
    } catch {
      return undefined;
    }
  }

  async coachContext(userId: string, personalized: boolean, now: Date) {
    const unitSystem = 'metric' as const;
    if (!personalized) return buildCoachContext({ personalized: false, unitSystem, now });
    const r = await this.records(userId);
    const tz = (r.profile.time_zone as string | null) ?? null;
    const today = localDateKey(now, tz);
    const wk = weekStartOf(today);
    const done = r.sessions.filter((s) => s.status === 'completed' && s.completed_at);
    const thisWeek = done.filter(
      (s) => weekStartOf(localDateKey(s.completed_at as string, tz)) === wk,
    );
    const last = done
      .map((s) => localDateKey(s.completed_at as string, tz))
      .sort()
      .pop();
    const todays = r.logs.filter((l) => localDateKey(l.logged_at as string, tz) === today);
    const w = r.weights
      .map((x) => ({ kg: Number(x.weight_kg), at: x.measured_at as string }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const change = w.length >= 2 ? w[w.length - 1]!.kg - w[0]!.kg : null;
    const wl = await this.wellness(userId, today);
    const guide = wl.failed ? undefined : await this.calorieGuide(userId, wl.prefs, now);
    return buildCoachContext({
      personalized: true,
      guideKcal: guide?.kcal,
      guideWeightDaysOld: guide?.weightDaysOld,
      unitSystem: r.profile.unit_system === 'imperial' ? 'imperial' : unitSystem,
      now,
      timeZone: tz,
      goals: r.goals.map((g) => ({ type: g.type, period: g.period })) as never,
      weightTrend:
        change === null ? null : Math.abs(change) < 0.3 ? 'steady' : change < 0 ? 'down' : 'up',
      activity: {
        sessionsThisWeek: thisWeek.length,
        minutesThisWeek: thisWeek.reduce(
          (n, s) =>
            n +
            (s.duration_s ? Math.max(1, Math.round(Number(s.duration_s) / 60)) : Number(s.minutes)),
          0,
        ),
        activeDaysThisWeek: new Set(thisWeek.map((s) => localDateKey(s.completed_at as string, tz)))
          .size,
        daysSinceLastSession: last
          ? Math.round(
              (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000,
            )
          : null,
        plannedToday: r.sessions
          .filter((s) => s.status === 'planned' && s.planned_for === today)
          .map((s) => String(s.title)),
        missedPlannedLast7: r.sessions.filter(
          (s) =>
            (s.status === 'planned' || s.status === 'skipped') &&
            s.planned_for &&
            (s.planned_for as string) < today,
        ).length,
      },
      wellness: wl.failed
        ? WELLNESS_FAIL_CLOSED
        : coachWellnessContext({ prefs: wl.prefs, entries: wl.entries, today }),
      food: {
        mealsToday: todays.length,
        kcalToday: todays
          .flatMap((l) => (l.food_log_items as Row[]) ?? [])
          .reduce((n, i) => n + Number(i.kcal), 0),
      },
    });
  }

  async weekFacts(userId: string, weekStart: string) {
    const r = await this.records(userId);
    const tz = (r.profile.time_zone as string | null) ?? null;
    const wl = await this.wellness(userId, localDateKey(new Date(), tz), weekStart);
    return buildWeekFacts({
      weekStart,
      timeZone: tz,
      sessions: r.sessions.map((s) => ({
        status: String(s.status),
        completedAt: (s.completed_at as string | null) ?? null,
        durationS: (s.duration_s as number | null) ?? null,
        minutes: Number(s.minutes),
        style: (s.style as string | null) ?? null,
        lowImpact: s.low_impact === true,
      })),
      foodLogTimes: r.logs.map((l) => l.logged_at as string),
      weights: r.weights.map((x) => ({
        weightKg: Number(x.weight_kg),
        measuredAt: x.measured_at as string,
      })),
      activeGoals: r.goals.length,
      wellness: wl.failed ? [] : wl.entries,
      hideWellnessNumbers:
        wl.failed ||
        coachWellnessContext({ prefs: wl.prefs, entries: [], today: weekStart })?.numbersHidden ===
          true,
    });
  }

  async conversationHistory(userId: string, conversationId: string) {
    const c = ok(
      await this.db
        .from('ai_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .maybeSingle(),
      'ai_conversations',
    );
    if (!c) return null;
    const rows = ok(
      await this.db
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('seq', { ascending: false })
        .limit(6),
      'ai_messages',
    ) as Array<{ role: 'user' | 'assistant'; content: string }>;
    return rows.reverse();
  }
  async createConversation(userId: string, title: string) {
    const r = ok(
      await this.db
        .from('ai_conversations')
        .insert({ user_id: userId, title })
        .select('id')
        .single(),
      'ai_conversations',
    );
    return (r as Row).id as string;
  }
  async appendUserMessage(userId: string, conversationId: string, content: string) {
    const r = ok(
      await this.db
        .from('ai_messages')
        .insert({ user_id: userId, conversation_id: conversationId, role: 'user', content })
        .select('id')
        .single(),
      'ai_messages',
    );
    return (r as Row).id as string;
  }
  async appendAssistantMessage(
    userId: string,
    conversationId: string,
    reply: {
      message: string;
      because: string[];
      supportReferral: boolean;
      usedPersonalData: boolean;
      proposedChanges: Array<{ kind: string; summary: string; payload: unknown }>;
    },
    provider: 'mock' | 'live',
  ) {
    const m = ok(
      await this.db
        .from('ai_messages')
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          role: 'assistant',
          content: reply.message,
          because: reply.because,
          support_referral: reply.supportReferral,
          used_personal_data: reply.usedPersonalData,
          provider,
        })
        .select('id')
        .single(),
      'ai_messages',
    ) as Row;
    const messageId = m.id as string;
    let actionIds: string[] = [];
    if (reply.proposedChanges.length) {
      const a = ok(
        await this.db
          .from('coach_actions')
          .insert(
            reply.proposedChanges.map((c) => ({
              message_id: messageId,
              user_id: userId,
              kind: c.kind,
              summary: c.summary,
              payload: c.payload,
            })),
          )
          .select('id'),
        'coach_actions',
      ) as Row[];
      actionIds = a.map((x) => x.id as string);
    }
    await this.db
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', userId);
    return { messageId, actionIds };
  }
  async saveWeeklyReview(
    userId: string,
    weekStart: string,
    content: unknown,
    provider: 'mock' | 'live',
  ) {
    const r = ok(
      await this.db
        .from('weekly_reviews')
        .upsert(
          { user_id: userId, week_start: weekStart, content, provider },
          { onConflict: 'user_id,week_start' },
        )
        .select('id')
        .single(),
      'weekly_reviews',
    );
    return (r as Row).id as string;
  }

  async beginPhotoAnalysis(userId: string, storagePath: string, provider: 'mock' | 'live') {
    const r = ok(
      await this.db
        .from('food_photo_analyses')
        .insert({ user_id: userId, storage_path: storagePath, provider })
        .select('id')
        .single(),
      'food_photo_analyses',
    );
    return (r as Row).id as string;
  }
  async completePhotoAnalysis(id: string, result: unknown) {
    ok(
      await this.db.rpc('food_photo_complete', { p_id: id, p_result: result }),
      'food_photo_complete',
    );
  }
  async failPhotoAnalysis(id: string) {
    ok(await this.db.rpc('food_photo_fail', { p_id: id }), 'food_photo_fail');
  }
  async expiredPhotos(now: Date) {
    const rows = ok(
      await this.db.rpc('food_photo_expired', { p_now: now.toISOString() }),
      'food_photo_expired',
    ) as Row[] | null;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      storagePath: (r.storage_path as string | null) ?? null,
    }));
  }
  async markPhotoDeleted(id: string) {
    ok(await this.db.rpc('food_photo_mark_deleted', { p_id: id }), 'food_photo_mark_deleted');
  }

  async deletionGraceDays() {
    const r = ok(
      await this.db
        .from('app_config')
        .select('int_value')
        .eq('key', 'account_deletion_grace_days')
        .maybeSingle(),
      'app_config',
    ) as Row | null;
    return Number(r?.int_value ?? 30);
  }
  async requestAccountDeletion(userId: string, now: Date, graceDays: number) {
    const existing = ok(
      await this.db
        .from('account_deletion_requests')
        .select('id, scheduled_for')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle(),
      'account_deletion_requests',
    ) as Row | null;
    if (existing)
      return { id: existing.id as string, scheduledFor: existing.scheduled_for as string };
    const scheduled = new Date(now.getTime() + graceDays * 86_400_000).toISOString();
    const r = ok(
      await this.db
        .from('account_deletion_requests')
        .insert({ user_id: userId, scheduled_for: scheduled })
        .select('id, scheduled_for')
        .single(),
      'account_deletion_requests',
    ) as Row;
    return { id: r.id as string, scheduledFor: r.scheduled_for as string };
  }
  async cancelAccountDeletion(userId: string) {
    const r = ok(
      await this.db
        .from('account_deletion_requests')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id'),
      'account_deletion_requests',
    ) as Row[];
    return r.length > 0;
  }
}

/** Private `food-photos` bucket. Deletes through the Storage API; the database row is marked deleted only afterwards. */
export class SupabasePhotoStorage implements PhotoStorage {
  constructor(
    private readonly db: SupabaseClient,
    private readonly bucket = 'food-photos',
  ) {}
  async remove(path: string) {
    const { error } = await this.db.storage.from(this.bucket).remove([path]);
    if (error) throw new Error(`storage remove: ${error.message}`);
  }
}
