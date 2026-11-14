-- Identity, private profile and consent. Every table enables RLS in this file; nothing is exposed by default.
-- Health data is private by default: owner-only policies, explicit column grants, consent-gated writes.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Hard safety limits used by database triggers. Mirrors PROVISIONAL_LIMITS in packages/shared (a test keeps them equal).
-- PROVISIONAL: not reviewed by a registered dietitian or clinician.
create or replace function app.safety_limits() returns jsonb language sql immutable set search_path = '' as $$
  select '{"min_age_years":18,"min_target_bmi":18.5,"max_weekly_loss_fraction":0.01,"max_weekly_gain_fraction":0.005}'::jsonb
$$;

-- profiles: non-sensitive account settings. One row per auth user, created by trigger.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  country text check (country ~ '^[A-Z]{2}$'),
  locale text not null default 'en' check (char_length(locale) between 2 and 10),
  time_zone text check (char_length(time_zone) between 1 and 64),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, country, locale, time_zone, unit_system) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create trigger profiles_updated_at before update on public.profiles for each row execute function app.set_updated_at();

-- A profile row is created for every new auth user. SECURITY DEFINER with a pinned search_path.
create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function app.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- consents: append-only history. The latest row per purpose is the current state; withdrawal is a new row with granted = false.
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in (
    'health_data_processing', 'ai_processing_of_food_photos', 'ai_coach_personalization', 'health_platform_sync', 'social_sharing')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  granted boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
create index consents_user_purpose_idx on public.consents (user_id, purpose, id desc);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
grant insert (purpose, policy_version, granted) on public.consents to authenticated;
create policy consents_select_own on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = (select auth.uid()));

-- True when the signed-in user's latest decision for the purpose is "granted".
create or replace function app.has_consent(p_purpose text) returns boolean language sql stable set search_path = '' as $$
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = (select auth.uid()) and c.purpose = p_purpose
    order by c.id desc limit 1), false)
$$;
revoke all on function app.has_consent(text) from public, anon;
grant execute on function app.has_consent(text) to authenticated, service_role;

-- profile_private: sensitive personal details. Writes require health-data consent. Adults only.
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date not null,
  height_cm numeric(5, 1) not null check (height_cm between 100 and 250),
  sex text not null default 'unspecified' check (sex in ('female', 'male', 'unspecified')),
  activity_level text not null default 'light' check (activity_level in ('low', 'light', 'moderate', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app.check_adult() returns trigger language plpgsql set search_path = '' as $$
declare v_min int := (app.safety_limits() ->> 'min_age_years')::int;
begin
  if new.birth_date > (current_date - make_interval(years => v_min))::date then
    raise exception 'adults_only: you must be % or older', v_min using errcode = 'check_violation';
  end if;
  if new.birth_date < (current_date - make_interval(years => 120))::date then
    raise exception 'invalid_birth_date' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger profile_private_adult before insert or update on public.profile_private for each row execute function app.check_adult();
create trigger profile_private_updated_at before update on public.profile_private for each row execute function app.set_updated_at();

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon, authenticated;
grant select on public.profile_private to authenticated;
grant insert (user_id, birth_date, height_cm, sex, activity_level) on public.profile_private to authenticated;
grant update (birth_date, height_cm, sex, activity_level) on public.profile_private to authenticated;
create policy profile_private_select_own on public.profile_private for select to authenticated using (user_id = (select auth.uid()));
create policy profile_private_insert_own on public.profile_private for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy profile_private_update_own on public.profile_private for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));

-- Marks onboarding complete once the required pieces exist. The only way to set onboarded_at.
create or replace function public.complete_onboarding() returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_p public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_p from public.profiles where id = v_uid;
  if v_p.display_name is null or v_p.country is null or v_p.time_zone is null
     or not exists (select 1 from public.profile_private where user_id = v_uid) then
    raise exception 'profile_incomplete' using errcode = 'check_violation';
  end if;
  if not app.has_consent('health_data_processing') then
    raise exception 'consent_required' using errcode = 'check_violation';
  end if;
  update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = v_uid returning onboarded_at into v_p.onboarded_at;
  return v_p.onboarded_at;
end $$;
revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
