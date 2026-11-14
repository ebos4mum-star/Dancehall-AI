-- Live-integration foundations: the person's own AI pause (separate from the staff kill switch in feature_flags) and
-- account-deletion requests (a 30-day, cancellable grace period; the irreversible purge is a separate trusted job).

-- ========== The person's own AI pause ==========
-- Entirely separate from public.feature_flags ('ai.kill_all' etc.), which only staff with 'flags.manage' can change. Pausing affects only
-- the person who set it; it can never switch a kill switch on or off, and a kill switch is never reflected here.
create table public.ai_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  ai_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.ai_preferences enable row level security;
revoke all on public.ai_preferences from anon, authenticated;
grant select on public.ai_preferences to authenticated;
grant insert (ai_paused) on public.ai_preferences to authenticated;
grant update (ai_paused) on public.ai_preferences to authenticated;
create policy ai_prefs_select_own on public.ai_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy ai_prefs_insert_own on public.ai_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_prefs_update_own on public.ai_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function app.ai_prefs_stamp() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger ai_preferences_stamp before update on public.ai_preferences for each row execute function app.ai_prefs_stamp();

-- Server read of the person's pause (service role only).
create or replace function public.ai_user_paused(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select ai_paused from public.ai_preferences where user_id = p_user), false)
$$;
revoke all on function public.ai_user_paused(uuid) from public, anon, authenticated;
grant execute on function public.ai_user_paused(uuid) to service_role;

-- ========== Account-deletion requests ==========
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default now() + interval '30 days',
  resolved_at timestamptz
);
create unique index account_deletion_one_open on public.account_deletion_requests (user_id) where status = 'pending';
create index account_deletion_due_idx on public.account_deletion_requests (scheduled_for) where status = 'pending';
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
create policy deletion_select_own on public.account_deletion_requests for select to authenticated using (user_id = (select auth.uid()));
-- No consent is needed to ask for deletion, and no direct writes are allowed: people use the two functions below.

create or replace function public.request_account_deletion() returns public.account_deletion_requests language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r public.account_deletion_requests;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.account_deletion_requests (user_id) values (v_uid) on conflict (user_id) where status = 'pending' do nothing;
  select * into r from public.account_deletion_requests where user_id = v_uid and status = 'pending';
  return r;
end $$;
create or replace function public.cancel_account_deletion() returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); n integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.account_deletion_requests set status = 'cancelled', resolved_at = now() where user_id = v_uid and status = 'pending';
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.request_account_deletion(), public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion(), public.cancel_account_deletion() to authenticated;

-- Trusted job (service role only): which accounts are past their grace period, and recording that the purge finished.
create or replace function public.account_deletion_due(p_now timestamptz default now()) returns table (id uuid, user_id uuid) language sql stable security definer set search_path = '' as $$
  select r.id, r.user_id from public.account_deletion_requests r where r.status = 'pending' and r.scheduled_for <= p_now
$$;
create or replace function public.account_deletion_complete(p_id uuid) returns void language sql security definer set search_path = '' as $$
  update public.account_deletion_requests set status = 'completed', resolved_at = now() where id = p_id and status = 'pending'
$$;
revoke all on function public.account_deletion_due(timestamptz), public.account_deletion_complete(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_due(timestamptz), public.account_deletion_complete(uuid) to service_role;
