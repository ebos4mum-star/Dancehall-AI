-- Weight history, weekly/monthly/yearly goals and exercise-readiness screening. Owner-only, consent-gated writes.

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  weight_kg numeric(5, 2) not null check (weight_kg between 25 and 400),
  measured_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'health_platform')),
  created_at timestamptz not null default now(),
  constraint weight_not_in_future check (measured_at <= now() + interval '1 day')
);
create index weight_entries_user_time_idx on public.weight_entries (user_id, measured_at desc);
alter table public.weight_entries enable row level security;
revoke all on public.weight_entries from anon, authenticated;
grant select, delete on public.weight_entries to authenticated;
grant insert (weight_kg, measured_at, source) on public.weight_entries to authenticated;
grant update (weight_kg, measured_at) on public.weight_entries to authenticated;
create policy weight_select_own on public.weight_entries for select to authenticated using (user_id = (select auth.uid()));
create policy weight_insert_own on public.weight_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy weight_update_own on public.weight_entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy weight_delete_own on public.weight_entries for delete to authenticated using (user_id = (select auth.uid()));

-- goals: type + period (weekly, monthly, yearly) with a start/end date and kg targets.
-- planned_weekly_change_kg is computed by the trigger, never trusted from the client.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type text not null check (type in ('lose', 'maintain', 'gain')),
  period text not null check (period in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date not null,
  start_kg numeric(5, 2) not null check (start_kg between 25 and 400),
  target_kg numeric(5, 2) not null check (target_kg between 25 and 400),
  planned_weekly_change_kg numeric(6, 3) not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_dates_ordered check (end_date > start_date)
);
create unique index goals_one_active_per_period on public.goals (user_id, period) where status = 'active';
create index goals_user_idx on public.goals (user_id, created_at desc);

create or replace function app.validate_goal() returns trigger language plpgsql set search_path = '' as $$
declare
  v_lim jsonb := app.safety_limits();
  v_pp public.profile_private;
  v_days int := new.end_date - new.start_date;
  v_weeks numeric;
  v_bmi_start numeric;
  v_bmi_target numeric;
begin
  if tg_op = 'UPDATE' then
    -- Only status may change after creation (column grants already restrict this; this guards trusted callers too).
    if (new.type, new.period, new.start_date, new.end_date, new.start_kg, new.target_kg, new.user_id)
       is distinct from (old.type, old.period, old.start_date, old.end_date, old.start_kg, old.target_kg, old.user_id) then
      raise exception 'goal_immutable: create a new goal instead of editing one' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into v_pp from public.profile_private where user_id = new.user_id;
  if not found then raise exception 'profile_incomplete' using errcode = 'check_violation'; end if;
  if v_pp.birth_date > (current_date - make_interval(years => (v_lim ->> 'min_age_years')::int))::date then
    raise exception 'adults_only' using errcode = 'check_violation';
  end if;

  if (new.period = 'weekly' and v_days <> 7)
     or (new.period = 'monthly' and v_days not between 28 and 31)
     or (new.period = 'yearly' and v_days not between 365 and 366) then
    raise exception 'goal_period_mismatch: dates do not match the % period', new.period using errcode = 'check_violation';
  end if;

  v_weeks := v_days / 7.0;
  new.planned_weekly_change_kg := round((new.target_kg - new.start_kg) / v_weeks, 3);

  if new.type = 'maintain' and new.target_kg <> new.start_kg then
    raise exception 'goal_direction_mismatch: a maintenance goal keeps the same weight' using errcode = 'check_violation';
  elsif new.type = 'lose' and new.target_kg >= new.start_kg then
    raise exception 'goal_direction_mismatch: a loss goal needs a lower target' using errcode = 'check_violation';
  elsif new.type = 'gain' and new.target_kg <= new.start_kg then
    raise exception 'goal_direction_mismatch: a gain goal needs a higher target' using errcode = 'check_violation';
  end if;

  if new.type = 'lose' then
    v_bmi_start := new.start_kg / power(v_pp.height_cm / 100.0, 2);
    v_bmi_target := new.target_kg / power(v_pp.height_cm / 100.0, 2);
    if v_bmi_start < (v_lim ->> 'min_target_bmi')::numeric then
      raise exception 'goal_unsafe_underweight: a weight-loss goal is not a good fit right now' using errcode = 'check_violation';
    end if;
    if v_bmi_target < (v_lim ->> 'min_target_bmi')::numeric then
      raise exception 'goal_target_below_healthy_range' using errcode = 'check_violation';
    end if;
    if -new.planned_weekly_change_kg > new.start_kg * (v_lim ->> 'max_weekly_loss_fraction')::numeric then
      raise exception 'goal_pace_too_fast' using errcode = 'check_violation';
    end if;
  elsif new.type = 'gain' then
    if new.planned_weekly_change_kg > new.start_kg * (v_lim ->> 'max_weekly_gain_fraction')::numeric then
      raise exception 'goal_pace_too_fast' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger goals_validate before insert or update on public.goals for each row execute function app.validate_goal();
create trigger goals_updated_at before update on public.goals for each row execute function app.set_updated_at();

alter table public.goals enable row level security;
revoke all on public.goals from anon, authenticated;
grant select, delete on public.goals to authenticated;
grant insert (type, period, start_date, end_date, start_kg, target_kg) on public.goals to authenticated;
grant update (status) on public.goals to authenticated;
create policy goals_select_own on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert_own on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy goals_update_own on public.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete_own on public.goals for delete to authenticated using (user_id = (select auth.uid()));

-- readiness_screenings: private answers to the exercise-readiness questions and the resulting routing.
create table public.readiness_screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  outcome text not null check (outcome in ('clear', 'low_impact_and_check_with_professional')),
  created_at timestamptz not null default now()
);
create index readiness_user_idx on public.readiness_screenings (user_id, created_at desc);
alter table public.readiness_screenings enable row level security;
revoke all on public.readiness_screenings from anon, authenticated;
grant select, delete on public.readiness_screenings to authenticated;
grant insert (answers, outcome) on public.readiness_screenings to authenticated;
create policy readiness_select_own on public.readiness_screenings for select to authenticated using (user_id = (select auth.uid()));
create policy readiness_insert_own on public.readiness_screenings for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy readiness_delete_own on public.readiness_screenings for delete to authenticated using (user_id = (select auth.uid()));
