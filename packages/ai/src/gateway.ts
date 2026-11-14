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
import { crossedThresholds, newBudget, type BudgetState } from './budget';
import type { AiProvider } from './provider';
import {
  InMemoryBudgetPort,
  type BudgetPort,
  type QuotaPort,
  type StaffControlsPort,
  type UserAiPausePort,
} from './ports';
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
  /** Monthly ceiling passed to the budget port. Defaults to the $50 product ceiling. */
  budgetCeilingUsd?: number;
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

/** Optional async ports. Without them the gateway uses in-process state (development and tests). */
export interface GatewayPorts {
  budget?: BudgetPort;
  quota?: QuotaPort;
  /** Staff kill switch, read live on every request. Falls back to the static `killAll`/`killFeatures` config. */
  staff?: StaffControlsPort;
  /** The person's own AI pause. Separate from, and never able to change, the staff kill switch. */
  userPause?: UserAiPausePort;
}

export class AiGateway {
  private readonly budgetPort: BudgetPort;
  constructor(
    private readonly provider: AiProvider,
    private readonly usage: UsageStore,
    private readonly cfg: GatewayConfig,
    budget: BudgetState = newBudget(),
    private readonly ports: GatewayPorts = {},
  ) {
    this.budgetPort = ports.budget ?? new InMemoryBudgetPort(budget);
  }

  /** In-process budget state (only when no external budget port is used). */
  get budget(): BudgetState {
    if (this.budgetPort instanceof InMemoryBudgetPort) return this.budgetPort.state;
    throw new Error('Budget lives in the external budget port.');
  }

  async run(req: GatewayRequest): Promise<unknown> {
    return (await this.runDetailed(req)).data;
  }

  /** Like `run`, but also reports the outcome so callers can tell a fixed safety redirect from a normal answer. */
  async runDetailed(
    req: GatewayRequest,
  ): Promise<{ data: unknown; outcome: UsageEvent['outcome'] }> {
    const at = this.cfg.now();
    const month = at.toISOString().slice(0, 7);
    // 1. Kill switches come first: they cost nothing and must always win.
    const staff = this.ports.staff
      ? await this.ports.staff.load()
      : { killAll: this.cfg.killAll, killFeatures: this.cfg.killFeatures };
    if (staff.killAll || staff.killFeatures[req.feature]) {
      throw new AppError('feature_disabled', 'This feature is temporarily unavailable.');
    }
    // 1b. The person's own pause. A different code and message from the kill switch: it is their choice, and only theirs.
    if (await this.ports.userPause?.isPaused(req.userId)) {
      throw new AppError(
        'ai_paused',
        'AI is paused in your settings. You can turn it back on any time.',
      );
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
          outcome: screen.kind === 'risk' ? 'risk_referral' : 'safety_redirect',
          data: {
            message: r.message,
            because: r.because,
            proposedChanges: [],
            supportReferral: r.supportReferral,
          },
        };
      }
    }
    // 3. Entitlement and per-user quota.
    const used = this.ports.quota
      ? 0
      : await this.usage.monthlyCount(req.userId, req.feature, month);
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
    // With a quota port, the allowance is consumed atomically (check-and-increment) instead of read-then-write.
    let quotaTaken = false;
    if (this.ports.quota) {
      const limit = access.remaining; // used is 0 here, so remaining is the full monthly allowance
      quotaTaken = await this.ports.quota.consume(req.userId, month, req.feature, limit);
      if (!quotaTaken)
        throw new AppError(
          'quota_exceeded',
          'You have used this feature’s allowance for the month.',
        );
    }
    const refundQuota = async () => {
      if (quotaTaken) await this.ports.quota!.refund(req.userId, month, req.feature);
    };
    // 4. Budget: reserve the worst case before the call.
    const model = this.cfg.models[req.feature];
    const price = PLACEHOLDER_PRICES[model];
    if (!price) {
      await refundQuota();
      throw new AppError('internal', 'Model pricing is not configured.');
    }
    const inputTokens = Math.ceil(req.prompt.length / 4) + (req.hasImage ? 1600 : 0);
    const worst = maxCostUsd(price, inputTokens, this.cfg.maxOutputTokens);
    const reserved = await this.budgetPort.reserve(month, worst, this.cfg.budgetCeilingUsd ?? 50);
    if (!reserved) {
      await refundQuota();
      throw new AppError(
        'budget_exhausted',
        'AI features are paused for now. Please try again later.',
      );
    }
    // 5. Call, validate, settle, record.
    try {
      const raw = await this.provider.complete({
        feature: req.feature,
        model,
        prompt: req.prompt,
        hasImage: req.hasImage,
        maxOutputTokens: this.cfg.maxOutputTokens,
      });
      const actual = costUsd(price, raw.usage);
      const after = await this.budgetPort.settle(month, worst, actual);
      const beforeUsd = after.settledUsd - actual;
      for (const t of crossedThresholds(after.ceilingUsd, beforeUsd, after.settledUsd))
        this.cfg.onAlert?.(t, {
          ceilingUsd: after.ceilingUsd,
          settledUsd: after.settledUsd,
          reservedUsd: 0,
        });
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
      return { data: parsed.data, outcome: 'ok' };
    } catch (e) {
      if (e instanceof AppError) throw e;
      // Provider failure: release the reservation (no billed cost known) and record it.
      await this.budgetPort.settle(month, worst, 0);
      await refundQuota();
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
