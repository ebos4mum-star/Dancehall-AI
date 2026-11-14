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
