-- PATCH 1 to social.up.sql (already folded into it): the friend's weekly summary counts a repeated workout once, exactly like app.social_sync_group.
-- Replaces one function with the same signature; grants are unchanged. Safe to run on a database that has social.up.sql applied.
-- A friend's week (the last seven days): workout counts and minutes only, and only if they chose to show it to this viewer. Reads nothing else.
create or replace function app.social_view_friend(p_user uuid, p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name); r jsonb := null;
begin
  if o is null or not app.social_friends(p_user, o) or app.social_blocked(p_user, o) then raise exception 'not_friends'; end if;
  if exists (select 1 from public.social_shares where owner_id = o and viewer_id = p_user and category = 'activity_summary') then
    -- Same counting rule as app.social_sync_group: a repeat of the same workout recorded within ten minutes of another counts once.
    select jsonb_build_object('sessions', count(*), 'minutes', coalesce(sum(coalesce(round(s.duration_s / 60.0), s.minutes)), 0)::int, 'activeDays', count(distinct (s.completed_at at time zone 'UTC')::date))
      into r from public.workout_sessions s
     where s.user_id = o and s.status = 'completed' and s.completed_at >= now() - interval '7 days'
       and not exists (select 1 from public.workout_sessions t where t.user_id = s.user_id and t.status = 'completed' and t.id <> s.id
                          and coalesce(t.workout_id, lower(t.title)) = coalesce(s.workout_id, lower(s.title))
                          and t.completed_at <= s.completed_at and s.completed_at - t.completed_at < interval '10 minutes'
                          and (t.completed_at < s.completed_at or t.id < s.id));
  end if;
  return jsonb_build_object('username', (select username from public.community_members where user_id = o), 'activity', r);
end $$;
