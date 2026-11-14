-- OWNER-APPLIED MIGRATION 3 of 4: household_join_limit
-- Repository file: supabase/migrations/20261211000100_household_join_limit.sql
-- SHA-256 of that file: 4e911d275de17d619044a8a412634b20322d0943bbd05273de72f66cc89bc247
-- Run ONLY in the Supabase Dashboard SQL Editor of project vvwjhbsyxetnktimgaxg (development). Do not run it twice: a guard stops a re-run.
-- Everything below is one transaction: if any statement fails, nothing is applied and nothing is recorded.
begin;

do $guard$
begin
  -- Identity: this must be the DanceHall development database (its first migration is recorded under this exact version and name).
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261114150446' and name = 'identity_consent') then
    raise exception 'Wrong project: the DanceHall identity_consent migration is not recorded here. Nothing was applied.';
  end if;
  -- Not already applied.
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'household_join_limit') then
    raise exception 'household_join_limit is already recorded as applied. Do not run this again. Nothing was changed.';
  end if;
  -- Order: everything this one depends on is already recorded.
  if (select count(*) from supabase_migrations.schema_migrations where name in ('household', 'wellness')) <> 2 then
    raise exception 'Out of order: apply household, wellness first. Nothing was applied.';
  end if;
end
$guard$;

-- ===== BEGIN exact repository migration: 20261211000100_household_join_limit.sql =====
-- Household invite attempt limit. Codes are ~40 bits and single use, so guessing is already impractical; this adds a per-person cap so it is also
-- not worth trying. After 5 incorrect codes in 15 minutes, joining is paused for that person until the window passes.
-- A normal join (right code, or a typo or two) is unaffected.
--
-- Design note: a failed attempt must be RECORDED, and an exception would roll the record back. So an incorrect or used code now returns NULL
-- (the app shows "invalid invite") instead of raising; the limit itself raises `too_many_attempts` (nothing to record then).
-- Additive: one new table, and the function is replaced in place with the same name, arguments, owner, search_path and grants.
create table public.household_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index household_join_attempts_user_idx on public.household_join_attempts (user_id, attempted_at desc);
alter table public.household_join_attempts enable row level security;
-- People may see their own attempts; nothing is writable directly: only the definer function below writes here.
revoke all on public.household_join_attempts from anon, authenticated;
grant select on public.household_join_attempts to authenticated;
create policy household_join_attempts_select_own on public.household_join_attempts for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.household_join(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); inv public.household_invites; recent integer;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where member_id = me) then
    raise exception 'already_in_household' using errcode = 'check_violation';
  end if;
  -- Housekeeping for this person only, then the limit.
  delete from public.household_join_attempts where user_id = me and attempted_at < now() - interval '1 day';
  select count(*) into recent from public.household_join_attempts where user_id = me and attempted_at > now() - interval '15 minutes';
  if recent >= 5 then raise exception 'too_many_attempts' using errcode = 'check_violation'; end if;

  select * into inv from public.household_invites
   where code_hash = sha256(convert_to(upper(btrim(p_code)), 'utf8')) and used_at is null and expires_at > now() for update;
  if not found then
    insert into public.household_join_attempts (user_id) values (me);
    return null;
  end if;
  if (select count(*) from public.household_members where household_id = inv.household_id) >= 6 then
    raise exception 'household_full' using errcode = 'check_violation';
  end if;
  update public.household_invites set used_at = now() where id = inv.id;
  insert into public.household_members (household_id, member_id, role) values (inv.household_id, me, 'member');
  delete from public.household_join_attempts where user_id = me;
  return inv.household_id;
end $$;
-- ===== END exact repository migration =====

-- History, in the same format the migration tool records: apply-time version, the migration's name, and its text.
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), 'household_join_limit', array['Applied by the owner-operated script from supabase/migrations/20261211000100_household_join_limit.sql (sha256 4e911d275de17d619044a8a412634b20322d0943bbd05273de72f66cc89bc247); the exact text is in the repository.']);

commit;
