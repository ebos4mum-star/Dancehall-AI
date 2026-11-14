-- Free personal Fit Challenges (7, 14 or 30 days). Solo only: no leaderboards, teams or sharing (those are gated on moderation, M1).
-- Progress is derived from workout_sessions by the app; this table only records the commitment and its status.
-- Safety: the target can never exceed 5 active days in every 7, so every challenge leaves rest days. There is no stake of any kind.

create table public.fit_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  length_days smallint not null check (length_days in (7, 14, 30)),
  target_days smallint not null,
  start_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint target_leaves_rest_days check (target_days between 1 and (length_days * 5) / 7)
);
create unique index fit_challenges_one_active on public.fit_challenges (user_id) where status = 'active';
create index fit_challenges_user_idx on public.fit_challenges (user_id, start_date desc);

create or replace function app.fit_challenge_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger fit_challenges_touch before update on public.fit_challenges for each row execute function app.fit_challenge_touch();

alter table public.fit_challenges enable row level security;
revoke all on public.fit_challenges from anon, authenticated;
grant select, delete on public.fit_challenges to authenticated;
grant insert (length_days, target_days, start_date) on public.fit_challenges to authenticated;
grant update (status) on public.fit_challenges to authenticated;
create policy challenges_select_own on public.fit_challenges for select to authenticated using (user_id = (select auth.uid()));
create policy challenges_insert_own on public.fit_challenges for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'active' and app.has_consent('health_data_processing'));
create policy challenges_update_own on public.fit_challenges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy challenges_delete_own on public.fit_challenges for delete to authenticated using (user_id = (select auth.uid()));
