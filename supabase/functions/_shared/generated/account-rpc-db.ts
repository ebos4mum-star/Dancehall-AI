// GENERATED from packages/shared/src/account-rpc-db.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
/**
 * AccountDb over the `public.acct_*` SQL functions (supabase/migrations/20261214000100_account_recovery.sql). It is transport-agnostic: the Edge Function passes a
 * supabase-js `.rpc` caller, the Postgres contract test passes a `pg` caller. Each call is one SQL function = one transaction.
 */
import type { AccountDb } from './account-core.ts';

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export function createRpcAccountDb(rpc: Rpc): AccountDb {
  const call = <T>(fn: string, args: Record<string, unknown>) => rpc(fn, args) as Promise<T>;
  return {
    provisionBegin: (a) => call('acct_provision_begin', a),
    provisionAttach: (requestId, userId, identifier) =>
      call('acct_provision_attach', { requestId, userId, identifier }),
    provisionFinalize: (a) => call('acct_provision_finalize', a),
    async provisionAbort(requestId) {
      await call('acct_provision_abort', { requestId });
    },
    stalePending: (beforeMs) => call('acct_stale_pending', { before: beforeMs }),
    hit: (bucket, now, windowMs, limit) => call('acct_hit', { bucket, now, windowMs, limit }),
    accountByDigest: (digestMac) => call('acct_by_digest', { digestMac }),
    async txOpen(a) {
      await call('acct_tx_open', a);
    },
    txVerify: (a) => call('acct_tx_verify', a),
    txComplete: (a) => call('acct_tx_complete', a),
    async txApplied(txId, now) {
      await call('acct_tx_applied', { txId, now });
    },
    async txRevert(txId) {
      await call('acct_tx_revert', { txId });
    },
    cancelRecoveries: (userId) => call('acct_cancel_recoveries', { userId }),
    rotate: (a) => call('acct_rotate', a),
    status: (userId, now) => call('acct_status', { userId, now }),
    async revokeSessions(userId) {
      await call('acct_revoke_sessions', { userId });
    },
  };
}
