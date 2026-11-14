-- Personal habits: up to five small, named things a person wants to do, checked off per day. Gentle by design: no streak is stored
-- or computed anywhere, a missed day has no record at all, and removing a habit archives it instead of deleting history.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id, created_at);

-- At most five active habits per person, enforced here so no client can exceed it.
create or replace function app.habit_limit() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.archived_at is null and (
    select count(*) from public.habits h where h.user_id = new.user_id and h.archived_at is null and h.id is distinct from new.id
  ) >= 5 then
    raise exception 'habit_limit_reached: at most 5 active habits' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger habits_limit before insert or update of archived_at on public.habits for each row execute function app.habit_limit();

alter table public.habits enable row level security;
revoke all on public.habits from anon, authenticated;
grant select on public.habits to authenticated;
grant insert (name) on public.habits to authenticated;
grant update (name, archived_at) on public.habits to authenticated;
create policy habits_select_own on public.habits for select to authenticated using (user_id = (select auth.uid()));
create policy habits_insert_own on public.habits for insert to authenticated
  with check (user_id = (select auth.uid()) and archived_at is null and app.has_consent('health_data_processing'));
create policy habits_update_own on public.habits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One row per habit per day that it was done. Un-checking deletes the row.
create table public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day),
  constraint habit_day_not_in_future check (day <= current_date + 1)
);
create index habit_checkins_user_idx on public.habit_checkins (user_id, day desc);
alter table public.habit_checkins enable row level security;
revoke all on public.habit_checkins from anon, authenticated;
grant select, delete on public.habit_checkins to authenticated;
grant insert (habit_id, day) on public.habit_checkins to authenticated;
create policy checkins_select_own on public.habit_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy checkins_insert_own on public.habit_checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing')
              and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()) and h.archived_at is null));
create policy checkins_delete_own on public.habit_checkins for delete to authenticated using (user_id = (select auth.uid()));
