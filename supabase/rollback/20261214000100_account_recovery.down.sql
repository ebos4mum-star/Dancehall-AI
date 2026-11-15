-- Rollback for 20261214000100_account_recovery.sql. NOT a migration: it is never applied automatically and is applied to a hosted project only with approval.
-- Removes the recovery state and its entry points. Supabase Auth users created through the flow are NOT touched: they keep working with Supabase directly, but can no
-- longer be recovered. Deleting those users (which deletes their data) is a separate, deliberate step. Nothing outside the objects below is changed.
drop function if exists
  public.acct_provision_begin(jsonb), public.acct_provision_attach(jsonb), public.acct_provision_finalize(jsonb), public.acct_provision_abort(jsonb),
  public.acct_stale_pending(jsonb), public.acct_hit(jsonb), public.acct_by_digest(jsonb), public.acct_tx_open(jsonb), public.acct_tx_verify(jsonb),
  public.acct_tx_complete(jsonb), public.acct_tx_revert(jsonb), public.acct_cancel_recoveries(jsonb), public.acct_rotate(jsonb), public.acct_status(jsonb),
  public.acct_revoke_sessions(jsonb), public.acct_prune(jsonb), app.revoke_user_sessions(uuid);
drop table if exists app.acct_tx, app.acct_recovery, app.acct_provisioning, app.acct_hits;
