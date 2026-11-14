-- OWNER-APPLIED MIGRATION 4 of 4: celebrations
-- Repository file: supabase/migrations/20261212000100_celebrations.sql
-- SHA-256 of that file: 09b8409918de302d704468d2fe0cd33fded514d8c13a6c31acf9ace760fd439c
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
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'celebrations') then
    raise exception 'celebrations is already recorded as applied. Do not run this again. Nothing was changed.';
  end if;
  -- Order: everything this one depends on is already recorded.
  if (select count(*) from supabase_migrations.schema_migrations where name in ('household_join_limit')) <> 1 then
    raise exception 'Out of order: apply household_join_limit first. Nothing was applied.';
  end if;
end
$guard$;

-- ===== BEGIN exact repository migration: 20261212000100_celebrations.sql =====
-- Pulse celebration ledger: which goal achievements have already been celebrated (or deliberately not shown because the person turned celebrations
-- off), so a refresh, a retry, a second device or a restored device never celebrates the same achievement again.
-- Achievements themselves are NOT stored: they are recomputed from the person's own records and goals. This table only remembers what was handled.
-- One row per achievement (e.g. `daily:water:2026-06-17`); insert-only, so the first device to handle it wins and the row can never be forged or
-- rewritten. No weight, calorie or food data is ever referenced. NOT applied to hosted Supabase without separate authorization.
create table public.celebrations (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  achievement_id text not null
    check (achievement_id ~ '^(daily|weekly|monthly|yearly):(water|habits|movement|movement_minutes|movement_weeks):[0-9]{4}(-[0-9]{2}){0,2}$'),
  -- How it was handled: shown in full, shown gently, or recorded without showing (celebrations off, or first sync of existing history).
  mode text not null check (mode in ('full', 'gentle', 'off')),
  shown_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index celebrations_user_idx on public.celebrations (user_id, shown_at desc);
alter table public.celebrations enable row level security;
revoke all on public.celebrations from anon, authenticated;
grant select, delete on public.celebrations to authenticated;
grant insert (achievement_id, mode) on public.celebrations to authenticated;
create policy celebrations_select_own on public.celebrations for select to authenticated using (user_id = (select auth.uid()));
create policy celebrations_insert_own on public.celebrations for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy celebrations_delete_own on public.celebrations for delete to authenticated using (user_id = (select auth.uid()));
-- ===== END exact repository migration =====

-- History, in the same format the migration tool records: apply-time version, the migration's name, and its text.
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), 'celebrations', array[$dhmig$-- Pulse celebration ledger: which goal achievements have already been celebrated (or deliberately not shown because the person turned celebrations
-- off), so a refresh, a retry, a second device or a restored device never celebrates the same achievement again.
-- Achievements themselves are NOT stored: they are recomputed from the person's own records and goals. This table only remembers what was handled.
-- One row per achievement (e.g. `daily:water:2026-06-17`); insert-only, so the first device to handle it wins and the row can never be forged or
-- rewritten. No weight, calorie or food data is ever referenced. NOT applied to hosted Supabase without separate authorization.
create table public.celebrations (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  achievement_id text not null
    check (achievement_id ~ '^(daily|weekly|monthly|yearly):(water|habits|movement|movement_minutes|movement_weeks):[0-9]{4}(-[0-9]{2}){0,2}$'),
  -- How it was handled: shown in full, shown gently, or recorded without showing (celebrations off, or first sync of existing history).
  mode text not null check (mode in ('full', 'gentle', 'off')),
  shown_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index celebrations_user_idx on public.celebrations (user_id, shown_at desc);
alter table public.celebrations enable row level security;
revoke all on public.celebrations from anon, authenticated;
grant select, delete on public.celebrations to authenticated;
grant insert (achievement_id, mode) on public.celebrations to authenticated;
create policy celebrations_select_own on public.celebrations for select to authenticated using (user_id = (select auth.uid()));
create policy celebrations_insert_own on public.celebrations for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy celebrations_delete_own on public.celebrations for delete to authenticated using (user_id = (select auth.uid()));
$dhmig$]);

commit;
