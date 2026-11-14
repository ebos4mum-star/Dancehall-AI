import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiFeature } from '@dancehall/shared';
import type { UsageEvent, UsageStore } from './gateway';
import type { BudgetPort, QuotaPort, StaffControlsPort, UserAiPausePort } from './ports';

/**
 * Supabase-backed ports for TRUSTED SERVER CODE ONLY. The client passed in must use the service-role key, which lives in the server
 * environment and is never shipped in the app. These call the atomic SQL functions from the coach migration, so concurrent server
 * instances cannot oversubscribe the budget or a person's allowance.
 */
function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export class SupabaseBudgetPort implements BudgetPort {
  constructor(private readonly db: SupabaseClient) {}
  async reserve(month: string, worstUsd: number, ceilingUsd: number) {
    const data = check(
      await this.db.rpc('ai_budget_reserve', {
        p_month: month,
        p_worst: worstUsd,
        p_ceiling: ceilingUsd,
      }),
      'ai_budget_reserve',
    );
    return data === true;
  }
  async settle(month: string, reservedUsd: number, actualUsd: number) {
    const rows = check(
      await this.db.rpc('ai_budget_settle', {
        p_month: month,
        p_reserved: reservedUsd,
        p_actual: actualUsd,
      }),
      'ai_budget_settle',
    ) as Array<{ settled: number | string; ceiling: number | string }> | null;
    const r = rows?.[0];
    return { settledUsd: Number(r?.settled ?? 0), ceilingUsd: Number(r?.ceiling ?? 50) };
  }
}

export class SupabaseQuotaPort implements QuotaPort {
  constructor(private readonly db: SupabaseClient) {}
  async consume(userId: string, month: string, feature: AiFeature, limit: number) {
    const data = check(
      await this.db.rpc('ai_quota_consume', {
        p_user: userId,
        p_month: month,
        p_feature: feature,
        p_limit: limit,
      }),
      'ai_quota_consume',
    );
    return data === true;
  }
  async refund(userId: string, month: string, feature: AiFeature) {
    check(
      await this.db.rpc('ai_quota_refund', { p_user: userId, p_month: month, p_feature: feature }),
      'ai_quota_refund',
    );
  }
}

/** Reads the staff kill switches from feature_flags on every request, so flipping one takes effect immediately. */
export class SupabaseStaffControls implements StaffControlsPort {
  constructor(private readonly db: SupabaseClient) {}
  async load() {
    const rows = check(
      await this.db.from('feature_flags').select('key, enabled').like('key', 'ai.kill%'),
      'feature_flags',
    ) as Array<{ key: string; enabled: boolean }> | null;
    const killFeatures: Partial<Record<AiFeature, boolean>> = {};
    let killAll = false;
    for (const r of rows ?? []) {
      if (r.key === 'ai.kill_all') killAll = r.enabled;
      else if (r.key.startsWith('ai.kill.') && r.enabled)
        killFeatures[r.key.slice(8) as AiFeature] = true;
    }
    return { killAll, killFeatures };
  }
}

/** The person's own pause (public.ai_preferences). Never consults, and cannot change, the staff flags. */
export class SupabaseUserAiPause implements UserAiPausePort {
  constructor(private readonly db: SupabaseClient) {}
  async isPaused(userId: string) {
    return (
      check(await this.db.rpc('ai_user_paused', { p_user: userId }), 'ai_user_paused') === true
    );
  }
}

/** Append-only usage log (public.ai_usage_events). The person is detached, not deleted, when an account is removed. */
export class SupabaseUsageStore implements UsageStore {
  constructor(private readonly db: SupabaseClient) {}
  async monthlyCount(userId: string, feature: AiFeature, month: string) {
    const res = await this.db
      .from('ai_user_usage')
      .select('count')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('feature', feature)
      .maybeSingle();
    return Number(check(res, 'ai_user_usage')?.count ?? 0);
  }
  async record(e: UsageEvent) {
    check(
      await this.db.from('ai_usage_events').insert({
        user_id: e.userId,
        feature: e.feature,
        model: e.model,
        input_tokens: e.inputTokens,
        output_tokens: e.outputTokens,
        cost_usd: e.costUsd,
        outcome: e.outcome,
        created_at: e.at,
      }),
      'ai_usage_events',
    );
  }
}
