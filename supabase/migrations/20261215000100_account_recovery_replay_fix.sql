-- Fix: an identical replay of a COMPLETED recovery must not sign the new device out.
-- NOT APPLIED to any hosted project: it needs separate approval. Apply it BEFORE deploying the Edge Function version that uses it (it is backward compatible: the
-- currently deployed function ignores the new fields and keeps its old behaviour until it is replaced).
--
-- Found in the live Gate 5 test: repeating the identical `recover/complete` request (designed so a lost reply can be retried) returned success AND re-ran the secret
-- update and the session revocation, so a replay arriving after the new device had signed in revoked its refresh token. Skipping that work on every replay would be
-- wrong too: if the function dies after the transaction is marked done but before the secret is changed, the retry is what finishes the job.
-- So the transaction now records when its follow-up work (new device secret set, all sessions revoked) was FULLY applied (`applied_at`). A replay of a fully applied
-- completion returns the account identifier and does nothing else; a replay of one that was not yet fully applied still completes the work.
alter table app.acct_tx add column applied_at bigint;

create or replace function public.acct_tx_complete(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx; a app.acct_recovery; now_ bigint := (p ->> 'now')::bigint;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  -- An identical retry (same completion secret, same new key, same device secret) of a finished completion succeeds. It says whether the follow-up work is already
  -- fully applied, and with the account identifier, so a fully applied replay needs no further action at all.
  if found and t.state = 'done' and t.completion_mac = p ->> 'completionMac' and now_ < t.expires_at and t.secret_mac = p ->> 'newSecretMac'
     and exists (select 1 from app.acct_recovery r where r.user_id = t.user_id and r.digest_mac = p ->> 'newDigestMac') then
    return jsonb_strip_nulls(jsonb_build_object('result', 'ok', 'userId', t.user_id, 'applied', t.applied_at is not null,
      'identifier', (select g.identifier from app.acct_provisioning g where g.user_id = t.user_id and g.state = 'ready' limit 1)));
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
  update app.acct_tx set state = 'done', prev_digest_mac = a.digest_mac, secret_mac = p ->> 'newSecretMac', applied_at = null where tx_id = t.tx_id;
  return jsonb_build_object('result', 'ok', 'userId', t.user_id, 'applied', false);
end $$;

-- Called by the function once the new device secret is set AND every session is revoked. Only a finished (`done`) transaction can be marked, and only once.
create function public.acct_tx_applied(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update app.acct_tx set applied_at = (p ->> 'now')::bigint where tx_id = p ->> 'txId' and state = 'done' and applied_at is null;
  return 'null'::jsonb;
end $$;
revoke execute on function public.acct_tx_applied(jsonb) from public, anon, authenticated;
grant execute on function public.acct_tx_applied(jsonb) to service_role;

-- Keep the invariant "verified means not applied" when a failed follow-up is rolled back.
create or replace function public.acct_tx_revert(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  if found and t.state = 'done' and t.prev_digest_mac is not null then
    update app.acct_recovery set digest_mac = t.prev_digest_mac where user_id = t.user_id;
    update app.acct_tx set state = 'verified', applied_at = null where tx_id = t.tx_id;
  end if;
  return 'null'::jsonb;
end $$;
