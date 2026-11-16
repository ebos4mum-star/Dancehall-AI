-- Social patch 2 (one physical workout counts once). NOT APPLIED anywhere by this change; needs explicit migration approval. Already folded into social.up.sql.
-- Adds app.eligible_workouts (service role only) and makes two existing functions use it, with unchanged signatures, return types and grants:
--   app.social_sync_group    Group Goal totals count each physical workout once (an Apple Health copy of an in-app workout is not added again, in either order)
--   app.social_view_friend   a friend's weekly summary counts the same way
-- No tables, columns, policies or data are touched. Depends on social.up.sql (and, for the Apple Health source, health_sync.up.sql). Safe to run twice.
-- Rollback: run social.patch1_view_dedupe.sql and re-create app.social_sync_group from the previous social.up.sql (git history), then drop function app.eligible_workouts(uuid, timestamptz).
begin;
-- The one rule for which completed workouts count, once each (mirrors packages/shared/src/eligible-workouts.ts, same cases in supabase/tests/eligible-workout-cases.json). Used by
-- Group Goals, a friend's weekly summary and the progression engine's inputs, so every total sees the same activity.
--  1. Recorded in the app: a repeat of the same workout (same workout id or title) completed within ten minutes of an earlier one counts once.
--  2. Apple Health (source 'apple_health'): dropped if it starts within ten minutes of an in-app workout's start, or during one, whichever was saved first.
--  3. Apple Health records overlapping each other the same way count once; the earliest start wins, ties by id.
-- Nothing links the two records; this is recomputed on every call, so edits, deletions and late imports are handled by themselves. Separate workouts, even on the same day, never merge.
create or replace function app.eligible_workouts(p_user uuid, p_from timestamptz default null)
returns table (id uuid, completed_at timestamptz, started_at timestamptz, minutes smallint, duration_s integer, source text, style text, low_impact boolean, workout_id text, title text)
language sql stable security definer set search_path = '' as $$
  with c as (
    select s.id, s.completed_at, s.completed_at - make_interval(secs => coalesce(nullif(s.duration_s, 0), s.minutes * 60)) as started_at,
           s.minutes, s.duration_s, s.source, s.style, s.low_impact, s.workout_id, s.title
      from public.workout_sessions s
     where s.user_id = p_user and s.status = 'completed' and s.completed_at is not null),
  nat as (select * from c where c.source <> 'apple_health'),
  nat_kept as (
    select n.* from nat n
     where not exists (select 1 from nat m where m.id <> n.id and coalesce(m.workout_id, lower(m.title)) = coalesce(n.workout_id, lower(n.title))
                          and m.completed_at <= n.completed_at and n.completed_at - m.completed_at < interval '10 minutes'
                          and (m.completed_at < n.completed_at or m.id < n.id))),
  hk as (
    select a.* from c a
     where a.source = 'apple_health'
       and not exists (select 1 from nat n where abs(extract(epoch from a.started_at - n.started_at)) <= 600
                          or (a.started_at >= n.started_at - interval '10 minutes' and a.started_at <= n.completed_at))),
  hk_kept as (
    select a.* from hk a
     where not exists (select 1 from hk b where b.id <> a.id
                          and (abs(extract(epoch from a.started_at - b.started_at)) <= 600 or (a.started_at >= b.started_at - interval '10 minutes' and a.started_at <= b.completed_at))
                          and (b.started_at < a.started_at or (b.started_at = a.started_at and b.id < a.id))))
  select u.id, u.completed_at, u.started_at, u.minutes, u.duration_s, u.source, u.style, u.low_impact, u.workout_id, u.title
    from (select * from nat_kept union all select * from hk_kept) u
   where p_from is null or u.completed_at >= p_from
$$;
revoke all on function app.eligible_workouts(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.eligible_workouts(uuid, timestamptz) to service_role;

create or replace function app.social_view_friend(p_user uuid, p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name); r jsonb := null;
begin
  if o is null or not app.social_friends(p_user, o) or app.social_blocked(p_user, o) then raise exception 'not_friends'; end if;
  if exists (select 1 from public.social_shares where owner_id = o and viewer_id = p_user and category = 'activity_summary') then
    -- Counts each physical workout once (app.eligible_workouts): a repeat in the app, or an Apple Health copy of an in-app workout, is one.
    select jsonb_build_object('sessions', count(*), 'minutes', coalesce(sum(coalesce(round(w.duration_s / 60.0), w.minutes)), 0)::int, 'activeDays', count(distinct (w.completed_at at time zone 'UTC')::date))
      into r from app.eligible_workouts(o, now() - interval '7 days') w;
  end if;
  return jsonb_build_object('username', (select username from public.community_members where user_id = o), 'activity', r);
end $$;

create or replace function app.social_sync_group(p_user uuid, p_group uuid) returns int language plpgsql security definer set search_path = '' as $$
declare g public.social_groups; tz text; n int := 0; r record; today date;
begin
  select * into g from public.social_groups where id = p_group;
  if not found or not exists (select 1 from public.social_group_members where group_id = p_group and user_id = p_user and status = 'joined') then raise exception 'not_member'; end if;
  select coalesce((select time_zone from public.profiles where id = p_user), 'UTC') into tz;
  begin perform now() at time zone tz; exception when others then tz := 'UTC'; end;
  today := (now() at time zone tz)::date;
  delete from public.social_contributions where group_id = p_group and user_id = p_user;
  for r in
    select (w.completed_at at time zone tz)::date as d, sum(coalesce(round(w.duration_s / 60.0), w.minutes))::int as mins
      from app.eligible_workouts(p_user) w
     where (w.completed_at at time zone tz)::date between g.start_day and least(g.end_day, today)
     group by 1 having sum(coalesce(round(w.duration_s / 60.0), w.minutes)) > 0
  loop
    insert into public.social_contributions (group_id, user_id, day, value)
    values (p_group, p_user, r.d, case g.metric when 'active_days' then 1 else least(600, greatest(1, r.mins)) end);
    n := n + 1;
  end loop;
  return n;
end $$;
commit;
