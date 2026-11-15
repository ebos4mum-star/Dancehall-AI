-- Cloud accounts without email or passwords: server-side state for provisioning and lost-phone recovery.
-- NOT APPLIED to any hosted project by this change: it ships as code, tested on local Postgres, and needs separate approval before hosted use.
--
-- What is stored (and what is not):
--   * Never the Recovery Key, the PIN or the security answers. The app sends a one-way digest of the key and a slow-hash proof of the answers; the Edge Function
--     stores an HMAC of each under a server-only pepper (`ACCOUNT_PEPPER`), so a leaked copy of these tables cannot be used to guess answers or keys offline.
--   * Questions (catalogue ids) and the answer salt, which are not secret.
-- Access: the tables live in the unexposed `app` schema with every API role locked out. The only entry points are the `acct_*` functions below, callable by
-- the service role alone (the Edge Function). Signed-in users, anon and PUBLIC cannot execute them. Existing RLS on every other table is untouched.
-- Every state change is ONE function = one transaction with row locks, so concurrent attempts cannot interleave.
create schema if not exists app;

create table app.acct_provisioning (
  request_id text primary key check (request_id ~ '^[0-9a-f]{32}$'),
  secret_mac text not null,
  user_id uuid references auth.users (id) on delete cascade,
  identifier text,
  state text not null check (state in ('pending', 'ready', 'failed')),
  created_at bigint not null
);
create index acct_provisioning_pending_idx on app.acct_provisioning (created_at) where state = 'pending';

create table app.acct_recovery (
  user_id uuid primary key references auth.users (id) on delete cascade,
  digest_mac text not null unique,
  q1 text not null,
  q2 text not null,
  salt text not null check (salt ~ '^[0-9a-f]{32}$'),
  proof_mac text not null,
  fails int not null default 0,
  locked_until bigint not null default 0,
  rotated_at bigint not null,
  check (q1 < q2)
);

create table app.acct_tx (
  tx_id text primary key check (tx_id ~ '^[0-9a-f]{32}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null check (state in ('open', 'verified', 'done', 'cancelled', 'burned')),
  completion_mac text,
  ready_at bigint,
  expires_at bigint not null,
  prev_digest_mac text,
  secret_mac text
);
create index acct_tx_user_idx on app.acct_tx (user_id) where state in ('open', 'verified');

create table app.acct_hits (
  bucket text primary key,
  window_start bigint not null,
  n int not null
);

alter table app.acct_provisioning enable row level security;
alter table app.acct_recovery enable row level security;
alter table app.acct_tx enable row level security;
alter table app.acct_hits enable row level security;
revoke all on app.acct_provisioning, app.acct_recovery, app.acct_tx, app.acct_hits from public, anon, authenticated;

-- Deletes every session and refresh token of a user: the "sign out everywhere" used when a recovery completes.
-- Access tokens already issued stay valid until they expire, so keep the project's JWT expiry short (see docs/ACCOUNT_SECURITY.md).
create function app.revoke_user_sessions(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end $$;
revoke execute on function app.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function app.revoke_user_sessions(uuid) to service_role;

-- All entry points take ONE jsonb argument and return jsonb, so the Edge Function and the tests call them identically.
create function public.acct_provision_begin(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r app.acct_provisioning; ins int;
begin
  insert into app.acct_provisioning (request_id, secret_mac, state, created_at)
  values (p ->> 'requestId', p ->> 'secretMac', 'pending', (p ->> 'now')::bigint) on conflict (request_id) do nothing;
  get diagnostics ins = row_count;
  if ins = 1 then return jsonb_build_object('state', 'created'); end if;
  select * into r from app.acct_provisioning where request_id = p ->> 'requestId' for update;
  if r.state = 'failed' then
    update app.acct_provisioning set secret_mac = p ->> 'secretMac', state = 'pending', user_id = null, identifier = null, created_at = (p ->> 'now')::bigint where request_id = r.request_id;
    return jsonb_build_object('state', 'created');
  end if;
  if r.secret_mac <> p ->> 'secretMac' then return jsonb_build_object('state', 'conflict'); end if;
  return jsonb_strip_nulls(jsonb_build_object('state', r.state, 'userId', r.user_id, 'identifier', r.identifier));
end $$;

create function public.acct_provision_attach(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r app.acct_provisioning;
begin
  select * into r from app.acct_provisioning where request_id = p ->> 'requestId' for update;
  if r.user_id is null then
    update app.acct_provisioning set user_id = (p ->> 'userId')::uuid, identifier = p ->> 'identifier' where request_id = r.request_id returning * into r;
  end if;
  return jsonb_build_object('userId', r.user_id, 'identifier', r.identifier);
end $$;

create function public.acct_provision_finalize(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r app.acct_provisioning;
begin
  select * into r from app.acct_provisioning where request_id = p ->> 'requestId' for update;
  if not found or r.user_id is distinct from (p ->> 'userId')::uuid then return to_jsonb('missing'::text); end if;
  begin
    insert into app.acct_recovery (user_id, digest_mac, q1, q2, salt, proof_mac, rotated_at)
    values (r.user_id, p ->> 'digestMac', p ->> 'q1', p ->> 'q2', p ->> 'salt', p ->> 'proofMac', (p ->> 'now')::bigint);
  exception when unique_violation then
    if exists (select 1 from app.acct_recovery where user_id = r.user_id) then
      update app.acct_provisioning set state = 'ready' where request_id = r.request_id;
      return to_jsonb('ok'::text);   -- a retry of a finalize that already committed
    end if;
    return to_jsonb('digest_taken'::text);
  end;
  update app.acct_provisioning set state = 'ready' where request_id = r.request_id;
  return to_jsonb('ok'::text);
end $$;

create function public.acct_provision_abort(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update app.acct_provisioning set state = 'failed' where request_id = p ->> 'requestId';
  delete from app.acct_recovery where user_id = (select user_id from app.acct_provisioning where request_id = p ->> 'requestId');
  return 'null'::jsonb;
end $$;

create function public.acct_stale_pending(p jsonb) returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('requestId', request_id, 'userId', user_id)), '[]'::jsonb)
    from app.acct_provisioning where state = 'pending' and created_at < (p ->> 'before')::bigint
$$;

create function public.acct_hit(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v int; now_ bigint := (p ->> 'now')::bigint; win bigint := (p ->> 'windowMs')::bigint;
begin
  insert into app.acct_hits as h (bucket, window_start, n) values (p ->> 'bucket', now_, 1)
  on conflict (bucket) do update set
    window_start = case when now_ - h.window_start >= win then now_ else h.window_start end,
    n = case when now_ - h.window_start >= win then 1 else h.n + 1 end
  returning n into v;
  return to_jsonb(v <= (p ->> 'limit')::int);
end $$;

create function public.acct_by_digest(p jsonb) returns jsonb language sql security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('userId', user_id, 'q1', q1, 'q2', q2, 'salt', salt) from app.acct_recovery where digest_mac = p ->> 'digestMac'), 'null'::jsonb)
$$;

create function public.acct_tx_open(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into app.acct_tx (tx_id, user_id, state, expires_at) values (p ->> 'txId', (p ->> 'userId')::uuid, 'open', (p ->> 'now')::bigint + (p ->> 'ttlMs')::bigint);
  return 'null'::jsonb;
end $$;

create function public.acct_tx_verify(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx; a app.acct_recovery; now_ bigint := (p ->> 'now')::bigint; ready bigint;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  if not found or t.state <> 'open' then return jsonb_build_object('result', 'unknown'); end if;
  select * into a from app.acct_recovery where user_id = t.user_id for update;
  if not found then return jsonb_build_object('result', 'unknown'); end if;
  if now_ >= t.expires_at then
    update app.acct_tx set state = 'burned' where tx_id = t.tx_id;
    return jsonb_build_object('result', 'expired');
  end if;
  if now_ < a.locked_until then return jsonb_build_object('result', 'locked'); end if;
  if a.proof_mac <> p ->> 'proofMac' then
    update app.acct_tx set state = 'burned' where tx_id = t.tx_id;   -- one guess per transaction: another needs the key again
    if a.fails + 1 >= (p ->> 'maxFailures')::int then
      update app.acct_recovery set fails = 0, locked_until = now_ + (p ->> 'lockMs')::bigint where user_id = a.user_id;
    else
      update app.acct_recovery set fails = fails + 1 where user_id = a.user_id;
    end if;
    return jsonb_build_object('result', 'wrong');
  end if;
  ready := now_ + (p ->> 'cooldownMs')::bigint;
  update app.acct_recovery set fails = 0 where user_id = a.user_id;
  update app.acct_tx set state = 'cancelled' where user_id = t.user_id and tx_id <> t.tx_id and state in ('open', 'verified');
  update app.acct_tx set state = 'verified', completion_mac = p ->> 'completionMac', ready_at = ready, expires_at = ready + 72 * 3600000 where tx_id = t.tx_id;
  return jsonb_build_object('result', 'cooling', 'readyAt', ready);
end $$;

create function public.acct_tx_complete(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx; a app.acct_recovery; now_ bigint := (p ->> 'now')::bigint;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  -- An identical retry of a completion whose reply was lost returns the same success (same secret, same new key); anything else on a finished transaction fails.
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

create function public.acct_tx_revert(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.acct_tx;
begin
  select * into t from app.acct_tx where tx_id = p ->> 'txId' for update;
  if found and t.state = 'done' and t.prev_digest_mac is not null then
    update app.acct_recovery set digest_mac = t.prev_digest_mac where user_id = t.user_id;
    update app.acct_tx set state = 'verified' where tx_id = t.tx_id;
  end if;
  return 'null'::jsonb;
end $$;

create function public.acct_cancel_recoveries(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update app.acct_tx set state = 'cancelled' where user_id = (p ->> 'userId')::uuid and state in ('open', 'verified');
  get diagnostics n = row_count;
  return to_jsonb(n);
end $$;

create function public.acct_rotate(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a app.acct_recovery; now_ bigint := (p ->> 'now')::bigint;
begin
  select * into a from app.acct_recovery where user_id = (p ->> 'userId')::uuid for update;
  if not found then return to_jsonb('missing'::text); end if;
  if now_ < a.locked_until then return to_jsonb('locked'::text); end if;
  if a.proof_mac <> p ->> 'proofMac' then
    if a.fails + 1 >= (p ->> 'maxFailures')::int then
      update app.acct_recovery set fails = 0, locked_until = now_ + (p ->> 'lockMs')::bigint where user_id = a.user_id;
    else
      update app.acct_recovery set fails = fails + 1 where user_id = a.user_id;
    end if;
    return to_jsonb('wrong'::text);
  end if;
  update app.acct_recovery set fails = 0, digest_mac = p ->> 'newDigestMac', rotated_at = now_ where user_id = a.user_id;
  return to_jsonb('ok'::text);
end $$;

create function public.acct_status(p jsonb) returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'hasRecovery', exists (select 1 from app.acct_recovery where user_id = (p ->> 'userId')::uuid),
    'rotatedAt', (select rotated_at from app.acct_recovery where user_id = (p ->> 'userId')::uuid),
    'pendingRecovery', (select jsonb_build_object('readyAt', max(ready_at)) from app.acct_tx where user_id = (p ->> 'userId')::uuid and state = 'verified' having count(*) > 0),
    'questions', (select jsonb_build_array(q1, q2) from app.acct_recovery where user_id = (p ->> 'userId')::uuid),
    'salt', (select salt from app.acct_recovery where user_id = (p ->> 'userId')::uuid))
$$;

create function public.acct_revoke_sessions(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app.revoke_user_sessions((p ->> 'userId')::uuid);
  return 'null'::jsonb;
end $$;

-- Housekeeping, run on a schedule by the Edge Function: finished transactions and old rate-limit buckets do not accumulate.
create function public.acct_prune(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int; m int; now_ bigint := (p ->> 'now')::bigint;
begin
  delete from app.acct_tx where state in ('done', 'cancelled', 'burned') and expires_at < now_ - 7 * 86400000::bigint;
  get diagnostics n = row_count;
  delete from app.acct_hits where window_start < now_ - 86400000::bigint;
  get diagnostics m = row_count;
  return jsonb_build_object('tx', n, 'hits', m);
end $$;

-- Lock every entry point to the service role. Supabase grants new public functions to the API roles by default; take that back explicitly.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'acct\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
grant usage on schema app to service_role;
