-- Rollback for 20261215000100_account_recovery_replay_fix.sql: restores the previous acct_tx_complete / acct_tx_revert bodies, removes acct_tx_applied and the column.
-- Not a migration; applied only with approval. After it, the old replay behaviour (re-applying the follow-up work) is back.
drop function if exists public.acct_tx_applied(jsonb);

create or replace function public.acct_tx_complete(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx; a app.acct_recovery; now_ bigint := (p ->> 'now')::bigint;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  if found and t.state = 'done' and t.completion_mac = p ->> 'completionMac' and now_ < t.expires_at and t.secret_mac = p ->> 'newSecretMac'
     and exists (select 1 from app.acct_recovery r where r.user_id = t.user_id and r.digest_mac = p ->> 'newDigestMac') then
    return jsonb_build_object('result', 'ok', 'userId', t.user_id);
  end if;
  if not found or t.state <> 'verified' or t.completion_mac is distinct from p ->> 'completionMac' then return jsonb_build_object('result', 'invalid'); end if;
  if now_ >= t.expires_at then return jsonb_build_object('result', 'invalid'); end if;
  if now_ < t.ready_at then return jsonb_build_object('result', 'early', 'readyAt', t.ready_at); end if;
  select * into a from app.acct_recovery where user_id = t.user_id for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  begin
    update app.acct_recovery set digest_mac = p ->> 'newDigestMac', rotated_at = now_ where user_id = a.user_id;
  exception when unique_violation then
    return jsonb_build_object('result', 'invalid');
  end;
  update app.acct_tx set state = 'done', prev_digest_mac = a.digest_mac, secret_mac = p ->> 'newSecretMac' where tx_id = t.tx_id;
  return jsonb_build_object('result', 'ok', 'userId', t.user_id);
end $$;

create or replace function public.acct_tx_revert(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  if found and t.state = 'done' and t.prev_digest_mac is not null then
    update app.acct_recovery set digest_mac = t.prev_digest_mac where user_id = t.user_id;
    update app.acct_tx set state = 'verified' where tx_id = t.tx_id;
  end if;
  return 'null'::jsonb;
end $$;

alter table app.acct_tx drop column if exists applied_at;
