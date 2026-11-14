import type { AiFeature } from '@dancehall/shared';
import { reserve, settle, type BudgetState } from './budget';

/**
 * Async ports the gateway talks to. Production implementations are database-backed (see the Supabase adapters in
 * `supabase-ports.ts`); the in-memory versions below are for development and tests. Each port method is ATOMIC:
 * a single check-and-update, never read-then-write, so concurrent server instances cannot oversubscribe a limit.
 */
export interface BudgetPort {
  /** Reserves a worst-case cost. False when it would cross the ceiling. */
  reserve(month: string, worstUsd: number, ceilingUsd: number): Promise<boolean>;
  settle(
    month: string,
    reservedUsd: number,
    actualUsd: number,
  ): Promise<{ settledUsd: number; ceilingUsd: number }>;
}
export interface QuotaPort {
  /** Consumes one unit of the person's monthly allowance. False when `limit` is already reached. */
  consume(userId: string, month: string, feature: AiFeature, limit: number): Promise<boolean>;
  refund(userId: string, month: string, feature: AiFeature): Promise<void>;
}

/** STAFF-only controls (the kill switch). Users cannot read or change these through the app. */
export interface StaffControls {
  killAll: boolean;
  killFeatures: Partial<Record<AiFeature, boolean>>;
}
export interface StaffControlsPort {
  load(): Promise<StaffControls>;
}
/** The PERSON's own choice to pause AI. Entirely separate from the staff kill switch: it affects only that person. */
export interface UserAiPausePort {
  isPaused(userId: string): Promise<boolean>;
}

export class InMemoryBudgetPort implements BudgetPort {
  constructor(public state: BudgetState) {}
  async reserve(_month: string, worstUsd: number) {
    const r = reserve(this.state, worstUsd);
    if (r.ok) this.state = r.budget;
    return r.ok;
  }
  async settle(_month: string, reservedUsd: number, actualUsd: number) {
    this.state = settle(this.state, reservedUsd, actualUsd);
    return { settledUsd: this.state.settledUsd, ceilingUsd: this.state.ceilingUsd };
  }
}

export class InMemoryQuotaPort implements QuotaPort {
  counts = new Map<string, number>();
  private k = (u: string, m: string, f: string) => `${u}|${m}|${f}`;
  async consume(userId: string, month: string, feature: AiFeature, limit: number) {
    const k = this.k(userId, month, feature);
    const n = this.counts.get(k) ?? 0;
    if (n >= limit) return false;
    this.counts.set(k, n + 1);
    return true;
  }
  async refund(userId: string, month: string, feature: AiFeature) {
    const k = this.k(userId, month, feature);
    this.counts.set(k, Math.max(0, (this.counts.get(k) ?? 0) - 1));
  }
}
