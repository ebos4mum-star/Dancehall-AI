import {
  AppError,
  checkAiAccess,
  SAFE_REDIRECT_MESSAGES,
  screenCoachInput,
  unsafeOutputProblems,
  type AiFeature,
  type Entitlement,
  type FeatureFlag,
} from '@dancehall/shared';
import { maxCostUsd, costUsd, PLACEHOLDER_PRICES } from './cost';
import { crossedThresholds, newBudget, reserve, settle, type BudgetState } from './budget';
import type { AiProvider } from './provider';
import { AI_RESPONSE_SCHEMAS, containsGuiltLanguage, type SchemaFeature } from './schemas';

export interface UsageEvent {
  userId: string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outcome:
    | 'ok'
    | 'schema_rejected'
    | 'output_rejected'
    | 'provider_error'
    | 'risk_referral'
    | 'safety_redirect';
  at: string;
}

/** Port: the real implementation is a Postgres table written by trusted server code (Phase 1+). */
export interface UsageStore {
  monthlyCount(userId: string, feature: AiFeature, month: string): Promise<number>;
  record(e: UsageEvent): Promise<void>;
}

export class InMemoryUsageStore implements UsageStore {
  events: UsageEvent[] = [];
  async monthlyCount(userId: string, feature: AiFeature, month: string) {
    return this.events.filter(
      (e) =>
        e.userId === userId &&
        e.feature === feature &&
        e.at.startsWith(month) &&
        e.outcome !== 'risk_referral' &&
        e.outcome !== 'safety_redirect',
    ).length;
  }
  async record(e: UsageEvent) {
    this.events.push(e);
  }
}

export interface GatewayConfig {
  flags: Partial<Record<FeatureFlag, boolean>>;
  /** Global kill switch: when true, every billable request is refused. */
  killAll: boolean;
  /** Per-feature kill switches. */
  killFeatures: Partial<Record<AiFeature, boolean>>;
  models: Record<AiFeature, string>;
  maxOutputTokens: number;
  now: () => Date;
  onAlert?: (threshold: number, budget: BudgetState) => void;
}

export interface GatewayRequest {
  userId: string;
  entitlement: Entitlement;
  feature: SchemaFeature & AiFeature;
  prompt: string;
  /** What the person typed, for safety screening (the prompt also carries context and instructions). Defaults to the prompt. */
  userText?: string;
  hasImage?: boolean;
}

export class AiGateway {
  budget: BudgetState;
  constructor(
    private readonly provider: AiProvider,
    private readonly usage: UsageStore,
    private readonly cfg: GatewayConfig,
    budget: BudgetState = newBudget(),
  ) {
    this.budget = budget;
  }

  async run(req: GatewayRequest): Promise<unknown> {
    const at = this.cfg.now();
    const month = at.toISOString().slice(0, 7);
    // 1. Kill switches come first: they cost nothing and must always win.
    if (this.cfg.killAll || this.cfg.killFeatures[req.feature]) {
      throw new AppError('feature_disabled', 'This feature is temporarily unavailable.');
    }
    // 2. Safety screen BEFORE any billable call: crisis, extreme-restriction, symptom and under-18 messages get a fixed, safe response and cost nothing.
    if (req.feature === 'concierge_chat') {
      const screen = screenCoachInput(req.userText ?? req.prompt);
      if (screen.kind !== 'ok') {
        await this.usage.record({
          userId: req.userId,
          feature: req.feature,
          model: 'none',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          outcome: screen.kind === 'risk' ? 'risk_referral' : 'safety_redirect',
          at: at.toISOString(),
        });
        const r = SAFE_REDIRECT_MESSAGES[screen.kind];
        return {
          message: r.message,
          because: r.because,
          proposedChanges: [],
          supportReferral: r.supportReferral,
        };
      }
    }
    // 3. Entitlement and per-user quota.
    const used = await this.usage.monthlyCount(req.userId, req.feature, month);
    const access = checkAiAccess({
      entitlement: req.entitlement,
      feature: req.feature,
      usedThisMonth: used,
      flags: this.cfg.flags,
      now: at,
    });
    if (!access.allowed) {
      throw access.reason === 'quota_used' || access.reason === 'not_in_tier'
        ? new AppError('quota_exceeded', 'You have used this feature’s allowance for the month.')
        : new AppError('feature_disabled', 'This feature is not available yet.');
    }
    // 4. Budget: reserve the worst case before the call.
    const model = this.cfg.models[req.feature];
    const price = PLACEHOLDER_PRICES[model];
    if (!price) throw new AppError('internal', 'Model pricing is not configured.');
    const inputTokens = Math.ceil(req.prompt.length / 4) + (req.hasImage ? 1600 : 0);
    const worst = maxCostUsd(price, inputTokens, this.cfg.maxOutputTokens);
    const reserved = reserve(this.budget, worst);
    if (!reserved.ok)
      throw new AppError(
        'budget_exhausted',
        'AI features are paused for now. Please try again later.',
      );
    this.budget = reserved.budget;
    // 5. Call, validate, settle, record.
    const before = this.budget.settledUsd;
    try {
      const raw = await this.provider.complete({
        feature: req.feature,
        model,
        prompt: req.prompt,
        hasImage: req.hasImage,
        maxOutputTokens: this.cfg.maxOutputTokens,
      });
      const actual = costUsd(price, raw.usage);
      this.budget = settle(this.budget, worst, actual);
      for (const t of crossedThresholds(this.budget.ceilingUsd, before, this.budget.settledUsd))
        this.cfg.onAlert?.(t, this.budget);
      const parsed = AI_RESPONSE_SCHEMAS[req.feature].safeParse(raw.json);
      const base = {
        userId: req.userId,
        feature: req.feature,
        model,
        inputTokens: raw.usage.inputTokens,
        outputTokens: raw.usage.outputTokens,
        costUsd: actual,
        at: at.toISOString(),
      };
      if (!parsed.success) {
        await this.usage.record({ ...base, outcome: 'schema_rejected' });
        throw new AppError(
          'upstream_failure',
          'We could not prepare that safely. Please try again.',
        );
      }
      // Unsafe or pressuring text never reaches the person, whatever the provider produced. The call's cost is still recorded.
      const shown = JSON.stringify(parsed.data);
      if (containsGuiltLanguage(shown) || unsafeOutputProblems(shown).length > 0) {
        await this.usage.record({ ...base, outcome: 'output_rejected' });
        throw new AppError(
          'upstream_failure',
          'We could not prepare that safely. Please try again.',
        );
      }
      await this.usage.record({ ...base, outcome: 'ok' });
      return parsed.data;
    } catch (e) {
      if (e instanceof AppError) throw e;
      // Provider failure: release the reservation (no billed cost known) and record it.
      this.budget = settle(this.budget, worst, 0);
      await this.usage.record({
        userId: req.userId,
        feature: req.feature,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        outcome: 'provider_error',
        at: at.toISOString(),
      });
      throw new AppError('upstream_failure', 'The assistant is unavailable right now.', {
        cause: e,
      });
    }
  }
}
