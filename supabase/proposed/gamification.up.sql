-- PROPOSED, NOT APPLIED. Server-authoritative gamification: an XP ledger, the optional Friends league, and the one door the server uses. Needs community.up.sql and social.up.sql first
-- (usernames, friendships, blocks). Mirrors packages/shared/src/gamification.ts, which stays the reference: the server runs THAT code over the person's own rows (app.gm_inputs) and
-- records the result here. The client never supplies XP.
--
-- Same pattern as Community and Friends: clients get NO direct access to any table here and no function is executable by `anon` or `authenticated`.
--  * gm_ledger: one row per earned event, unique per (user, event id), so a replayed, retried or imported-twice record cannot pay twice. Amounts are bounded per kind and
--    days must be recent. Deleting the account deletes the ledger (cascade).
--  * gm_league_optin: a person appears in a league only if they opted in; a friend appears only if they also opted in, are an accepted friend, and neither has blocked the other.
--    The league shows a username and one number (this week's XP), never any health, food or weight record.
create table public.gm_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null check (event_id ~ '^(workout|meal|habit|quest|badge):[A-Za-z0-9:_-]{1,70}$'),
  kind text not null check (kind in ('workout', 'meal_day', 'habit_day', 'quest', 'badge')),
  day date not null,
  xp int not null check (xp between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  check (split_part(event_id, ':', 1) = case kind when 'meal_day' then 'meal' when 'habit_day' then 'habit' else kind end)
);
create index gm_ledger_week_idx on public.gm_ledger (user_id, day);
create table public.gm_league_optin (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['gm_ledger', 'gm_league_optin'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (false) with check (false)', t || '_deny', t);
  end loop;
end $$;

-- The person's own recent records, as the engine's input. Facts only: ids, times, durations and days. Food content, weights and notes are never selected.
create or replace function app.gm_inputs(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare tz text;
begin
  select coalesce((select time_zone from public.profiles where id = p_user), 'UTC') into tz;
  begin perform now() at time zone tz; exception when others then tz := 'UTC'; end;
  return jsonb_build_object(
    'timeZone', tz,
    'today', to_char((now() at time zone tz)::date, 'YYYY-MM-DD'),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id::text, 'status', s.status, 'completedAt', s.completed_at, 'durationS', s.duration_s, 'minutes', s.minutes,
        'source', s.source, 'style', s.style, 'lowImpact', s.low_impact) order by s.completed_at desc)
      from (select * from public.workout_sessions where user_id = p_user and status = 'completed' and completed_at >= now() - interval '75 days' order by completed_at desc limit 500) s), '[]'::jsonb),
    'mealLogDays', coalesce((select jsonb_agg(d order by d) from (select distinct to_char((logged_at at time zone tz)::date, 'YYYY-MM-DD') d from public.food_logs
        where user_id = p_user and logged_at >= now() - interval '75 days') x), '[]'::jsonb),
    'habitDays', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(c.day, 'YYYY-MM-DD'), 'habitId', c.habit_id::text))
      from public.habit_checkins c where c.user_id = p_user and c.day >= current_date - 75), '[]'::jsonb),
    'activeHabitCount', (select count(*) from public.habits where user_id = p_user and archived_at is null)
  );
end $$;

-- Records engine output. Everything is re-validated here; a duplicate is silently ignored. Returns the person's totals.
create or replace function app.gm_record(p_user uuid, p_events jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e jsonb; k text; d date; x int; mx int; added int := 0; n int := 0; tz text;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 400 then raise exception 'invalid_input'; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    n := n + 1;
    k := e ->> 'kind';
    mx := case k when 'workout' then 45 when 'meal_day' then 5 when 'habit_day' then 5 when 'quest' then 30 when 'badge' then 25 else null end;
    if mx is null then raise exception 'invalid_input'; end if;
    begin d := (e ->> 'day')::date; x := (e ->> 'xp')::int; exception when others then raise exception 'invalid_input'; end;
    -- Recent only: no back-dating more than 75 days and nothing in the future beyond today's timezone slack.
    if d is null or x is null or x < 0 or d < current_date - 75 or d > current_date + 1 then raise exception 'invalid_input'; end if;
    insert into public.gm_ledger (user_id, event_id, kind, day, xp) values (p_user, e ->> 'id', k, d, least(x, mx)) on conflict (user_id, event_id) do nothing;
    if found then added := added + 1; end if;
  end loop;
  return app.gm_state(p_user) || jsonb_build_object('added', added);
end $$;

create or replace function app.gm_state(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'totalXp', coalesce((select sum(xp) from public.gm_ledger where user_id = p_user), 0)::int,
    'weekXp', coalesce((select sum(xp) from public.gm_ledger where user_id = p_user and kind <> 'badge'
        and day >= date_trunc('week', (current_date)::timestamp)::date), 0)::int,
    'leagueOptIn', exists (select 1 from public.gm_league_optin where user_id = p_user))
$$;

create or replace function app.gm_set_league(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.social_require_name(p_user);
  if p_on then insert into public.gm_league_optin (user_id) values (p_user) on conflict do nothing;
  else delete from public.gm_league_optin where user_id = p_user; end if;
end $$;

-- The weekly league: me plus accepted, unblocked friends who also opted in. A username and one number each.
create or replace function app.gm_league(p_user uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare wk date := date_trunc('week', (current_date)::timestamp)::date; r jsonb;
begin
  if not exists (select 1 from public.gm_league_optin where user_id = p_user) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('username', m.username, 'weekXp', least(600, w.xp), 'isMe', w.uid = p_user) order by w.xp desc, m.username), '[]'::jsonb) into r
    from (select o.user_id as uid, coalesce((select sum(l.xp) from public.gm_ledger l where l.user_id = o.user_id and l.kind <> 'badge' and l.day >= wk and l.day < wk + 7), 0)::int as xp
            from public.gm_league_optin o
           where o.user_id = p_user
              or (app.social_friends(p_user, o.user_id) and not app.social_blocked(p_user, o.user_id))) w
    join public.community_members m on m.user_id = w.uid;
  return r;
end $$;

-- ========== the one door the server uses ==========
create or replace function public.gm_rpc(fn text, args jsonb default '{}'::jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare
  allowed text[] := array['gm_inputs', 'gm_record', 'gm_state', 'gm_set_league', 'gm_league'];
  f record; call_args text := ''; i int; k text; t text; result jsonb;
begin
  if fn is null or not (fn = any (allowed)) then raise exception 'not_found'; end if;
  if args is null or jsonb_typeof(args) <> 'object' then raise exception 'invalid_input'; end if;
  select p.oid, p.proname, p.proargnames, string_to_array(p.proargtypes::text, ' ')::oid[] as types, p.prorettype into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = fn;
  if not found then raise exception 'not_found'; end if;
  for i in 1 .. coalesce(array_length(f.types, 1), 0) loop
    k := f.proargnames[i];
    if args ? k then
      t := format_type(f.types[i], null);
      call_args := call_args || case when call_args = '' then '' else ', ' end || format('%I := %s', k,
        case when t = 'jsonb' then format('nullif(%L::jsonb -> %L, ''null''::jsonb)', args::text, k)
             else format('(%L::jsonb ->> %L)::%s', args::text, k, t) end);
    end if;
  end loop;
  if f.prorettype = 'void'::regtype then execute format('select app.%I(%s)', fn, call_args); result := null;
  else execute format('select to_jsonb(app.%I(%s))', fn, call_args) into result; end if;
  return result;
end $$;
revoke all on function public.gm_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.gm_rpc(text, jsonb) to service_role;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'gm\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
