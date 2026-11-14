-- Wellness: optional logs (hydration, sleep, walking, strength, body measurements, hunger and recovery check-ins) and preferences.
-- One table for logs with per-kind range checks that mirror packages/shared/src/wellness.ts. Nothing is required and nothing is derived
-- here: no streaks, no scores. A missing day has no row. NOT applied to hosted Supabase without separate authorization.
create table public.wellness_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('hydration','sleep','walk','strength','measurement','hunger','recovery')),
  day date not null,
  -- ml (hydration), hours (sleep), minutes (walk, strength), cm (measurement), 0 for check-ins
  amount numeric(8,2) not null,
  -- walk distance in km, optional
  amount2 numeric(6,2),
  label text,
  -- Idempotency: a double tap or a retry with the same key records nothing new.
  client_key text check (client_key is null or char_length(client_key) between 8 and 64),
  created_at timestamptz not null default now(),
  constraint wellness_amount_range check (
    (kind = 'hydration' and amount between 1 and 5000) or
    (kind = 'sleep' and amount between 0.5 and 16) or
    (kind = 'walk' and amount between 1 and 600) or
    (kind = 'strength' and amount between 1 and 300) or
    (kind = 'measurement' and amount between 10 and 300) or
    (kind in ('hunger','recovery') and amount = 0)
  ),
  constraint wellness_distance_walk_only check (amount2 is null or (kind = 'walk' and amount2 between 0 and 100)),
  constraint wellness_label_valid check (
    (kind in ('hydration','walk') and label is null) or
    (kind = 'sleep' and (label is null or label in ('rested','ok','tired'))) or
    (kind = 'strength' and (label is null or label in ('bodyweight','dumbbells','bands'))) or
    (kind = 'measurement' and label is not null and label in ('waist','hips','chest','thigh','arm')) or
    (kind = 'hunger' and label is not null and label in ('hungry','comfortable','full')) or
    (kind = 'recovery' and label is not null and label in ('fresh','ok','sore','worn'))
  ),
  constraint wellness_day_not_in_future check (day <= current_date + 1)
);
create index wellness_entries_user_idx on public.wellness_entries (user_id, day desc);
create unique index wellness_entries_client_key_idx on public.wellness_entries (user_id, client_key) where client_key is not null;
-- One sleep entry per night: logging the same night again is a correction, done by deleting and re-adding.
create unique index wellness_sleep_night_idx on public.wellness_entries (user_id, day) where kind = 'sleep';

alter table public.wellness_entries enable row level security;
revoke all on public.wellness_entries from anon, authenticated;
grant select, delete on public.wellness_entries to authenticated;
grant insert (kind, day, amount, amount2, label, client_key) on public.wellness_entries to authenticated;
create policy wellness_select_own on public.wellness_entries for select to authenticated using (user_id = (select auth.uid()));
create policy wellness_insert_own on public.wellness_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy wellness_delete_own on public.wellness_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Preferences: one row per person. A JSON document keeps the shape flexible; the app parses it tolerantly and the size is bounded here.
create table public.wellness_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048),
  updated_at timestamptz not null default now()
);
alter table public.wellness_prefs enable row level security;
revoke all on public.wellness_prefs from anon, authenticated;
grant select, delete on public.wellness_prefs to authenticated;
grant insert (data) on public.wellness_prefs to authenticated;
grant update (data, updated_at) on public.wellness_prefs to authenticated;
create policy wellness_prefs_select_own on public.wellness_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy wellness_prefs_insert_own on public.wellness_prefs for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy wellness_prefs_update_own on public.wellness_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wellness_prefs_delete_own on public.wellness_prefs for delete to authenticated using (user_id = (select auth.uid()));
