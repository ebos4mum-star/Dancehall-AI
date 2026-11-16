-- PROPOSED, NOT APPLIED. Friends, per-friend sharing, and group challenges / couple / family goals. Mirrors packages/shared/src/social-engine.ts, which stays the reference.
-- Rehearsed on a throwaway local database by supabase/proposed/social-dry-run.sh; never applied to a hosted project without separate approval.
--
-- Same pattern as Community: clients get NO direct access to any social table and no social function is executable by `anon` or `authenticated`. A server (an Edge
-- Function using the service role, NOT YET WRITTEN) verifies the caller's JWT and passes the verified user id. People are addressed only by their public Community
-- username, so this needs supabase/proposed/community.up.sql first.
--
-- Privacy by construction:
--  * The only shareable category is 'activity_summary' (a CHECK constraint). Food diaries, weights, body measurements and health data have no category, no column and no
--    function path here. app.social_view_friend reads workout_sessions only, and only when the friend turned sharing on for that viewer.
--  * Sharing is per friend, one-way, and removed the moment the friendship, a block or the account goes. Groups share one number (active minutes or days) with the
--    group's joined members only; leaving deletes the person's numbers.
--  * A blocked person gets the same "not_found" as an unknown name.
--  * Deleting an account (auth.users) removes everything by cascade.

create table public.social_friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create table public.social_blocks (
  by_user uuid not null references auth.users (id) on delete cascade,
  blocked_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (by_user, blocked_user),
  check (by_user <> blocked_user)
);
create table public.social_shares (
  owner_id uuid not null references auth.users (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('activity_summary')),
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id, category),
  check (owner_id <> viewer_id)
);
create table public.social_groups (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('challenge', 'couple', 'family')),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  metric text not null check (metric in ('active_minutes', 'active_days')),
  target int check (target is null or target between 1 and 100000),
  start_day date not null,
  end_day date not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_day >= start_day and end_day - start_day <= 91),
  check (kind = 'challenge' or target is not null)
);
create table public.social_group_members (
  group_id uuid not null references public.social_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('invited', 'joined')),
  primary key (group_id, user_id)
);
create table public.social_contributions (
  group_id uuid not null,
  user_id uuid not null,
  day date not null,
  value int not null check (value between 1 and 600),
  primary key (group_id, user_id, day),
  foreign key (group_id, user_id) references public.social_group_members (group_id, user_id) on delete cascade
);
create index social_group_members_user_idx on public.social_group_members (user_id);

do $$ declare t text; begin
  foreach t in array array['social_friendships', 'social_blocks', 'social_shares', 'social_groups', 'social_group_members', 'social_contributions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (false) with check (false)', t || '_deny', t);
  end loop;
end $$;

-- ========== helpers ==========
create or replace function app.social_id(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from public.community_members where username = lower(btrim(p_name))
$$;
create or replace function app.social_blocked(p_a uuid, p_b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_blocks where (by_user = p_a and blocked_user = p_b) or (by_user = p_b and blocked_user = p_a))
$$;
create or replace function app.social_friends(p_a uuid, p_b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_friendships where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b) and status = 'accepted')
$$;
create or replace function app.social_sever(p_a uuid, p_b uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.social_friendships where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b);
  delete from public.social_shares where (owner_id = p_a and viewer_id = p_b) or (owner_id = p_b and viewer_id = p_a);
end $$;

-- ========== friends ==========
create or replace function app.social_request(p_user uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name); f public.social_friendships;
begin
  if o is null or o <> p_user and app.social_blocked(p_user, o) then raise exception 'not_found'; end if;
  if o = p_user then raise exception 'self'; end if;
  select * into f from public.social_friendships where user_a = least(p_user, o) and user_b = greatest(p_user, o);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends'; end if;
    if f.requested_by = p_user then raise exception 'already_requested'; end if;
    update public.social_friendships set status = 'accepted' where user_a = f.user_a and user_b = f.user_b;
    return 'accepted';
  end if;
  if (select count(*) from public.social_friendships where status = 'accepted' and p_user in (user_a, user_b)) >= 100
     or (select count(*) from public.social_friendships where status = 'pending' and requested_by = p_user) >= 20 then raise exception 'limit_reached'; end if;
  insert into public.social_friendships (user_a, user_b, status, requested_by) values (least(p_user, o), greatest(p_user, o), 'pending', p_user);
  return 'requested';
end $$;
create or replace function app.social_respond(p_user uuid, p_name text, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if o is null or app.social_blocked(p_user, o) or not exists (select 1 from public.social_friendships where user_a = least(p_user, o) and user_b = greatest(p_user, o)
     and status = 'pending' and requested_by = o) then raise exception 'no_request'; end if;
  if p_accept then
    if (select count(*) from public.social_friendships where status = 'accepted' and (p_user in (user_a, user_b) or o in (user_a, user_b))) >= 200 then raise exception 'limit_reached'; end if;
    update public.social_friendships set status = 'accepted' where user_a = least(p_user, o) and user_b = greatest(p_user, o);
  else perform app.social_sever(p_user, o); end if;
end $$;
create or replace function app.social_cancel(p_user uuid, p_name text) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if o is null or not exists (select 1 from public.social_friendships where user_a = least(p_user, o) and user_b = greatest(p_user, o) and status = 'pending' and requested_by = p_user)
  then raise exception 'no_request'; end if;
  perform app.social_sever(p_user, o);
end $$;
create or replace function app.social_remove(p_user uuid, p_name text) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if o is null or not app.social_friends(p_user, o) then raise exception 'not_friends'; end if;
  perform app.social_sever(p_user, o);
end $$;
create or replace function app.social_block(p_user uuid, p_name text) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if o is null then raise exception 'not_found'; end if;
  if o = p_user then raise exception 'self'; end if;
  insert into public.social_blocks (by_user, blocked_user) values (p_user, o) on conflict do nothing;
  perform app.social_sever(p_user, o);
  -- Out of each other's groups when one of them owns the group.
  delete from public.social_group_members m using public.social_groups g where m.group_id = g.id and ((g.owner_id = p_user and m.user_id = o) or (g.owner_id = o and m.user_id = p_user));
end $$;
create or replace function app.social_unblock(p_user uuid, p_name text) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if o is null then raise exception 'not_found'; end if;
  delete from public.social_blocks where by_user = p_user and blocked_user = o;
end $$;

-- ========== sharing ==========
create or replace function app.social_set_share(p_user uuid, p_name text, p_category text, p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name);
begin
  if p_category is distinct from 'activity_summary' then raise exception 'invalid_category'; end if;
  if o is null or not app.social_friends(p_user, o) or app.social_blocked(p_user, o) then raise exception 'not_friends'; end if;
  delete from public.social_shares where owner_id = p_user and viewer_id = o and category = p_category;
  if p_on then insert into public.social_shares (owner_id, viewer_id, category) values (p_user, o, p_category); end if;
end $$;
create or replace function app.social_shares_with(p_user uuid, p_name text) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(category order by category), '{}') from public.social_shares where owner_id = p_user and viewer_id = app.social_id(p_name)
$$;
-- A friend's week (the last seven days): workout counts and minutes only, and only if they chose to show it to this viewer. Reads nothing else.
create or replace function app.social_view_friend(p_user uuid, p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid := app.social_id(p_name); r jsonb := null;
begin
  if o is null or not app.social_friends(p_user, o) or app.social_blocked(p_user, o) then raise exception 'not_friends'; end if;
  if exists (select 1 from public.social_shares where owner_id = o and viewer_id = p_user and category = 'activity_summary') then
    select jsonb_build_object('sessions', count(*), 'minutes', coalesce(sum(coalesce(duration_s / 60, minutes)), 0), 'activeDays', count(distinct (completed_at at time zone 'UTC')::date))
      into r from public.workout_sessions where user_id = o and status = 'completed' and completed_at >= now() - interval '7 days';
  end if;
  return jsonb_build_object('username', (select username from public.community_members where user_id = o), 'activity', r);
end $$;
create or replace function app.social_lists(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(m.username order by m.username) from public.social_friendships f join public.community_members m on m.user_id = case when f.user_a = p_user then f.user_b else f.user_a end
      where f.status = 'accepted' and p_user in (f.user_a, f.user_b) and not app.social_blocked(p_user, m.user_id)), '[]'),
    'incoming', coalesce((select jsonb_agg(m.username order by m.username) from public.social_friendships f join public.community_members m on m.user_id = f.requested_by
      where f.status = 'pending' and p_user in (f.user_a, f.user_b) and f.requested_by <> p_user and not app.social_blocked(p_user, m.user_id)), '[]'),
    'outgoing', coalesce((select jsonb_agg(m.username order by m.username) from public.social_friendships f join public.community_members m on m.user_id = case when f.user_a = p_user then f.user_b else f.user_a end
      where f.status = 'pending' and f.requested_by = p_user and not app.social_blocked(p_user, m.user_id)), '[]'),
    'blocked', coalesce((select jsonb_agg(m.username order by m.username) from public.social_blocks b join public.community_members m on m.user_id = b.blocked_user where b.by_user = p_user), '[]'))
$$;

-- ========== groups ==========
create or replace function app.social_create_group(p_user uuid, p_kind text, p_title text, p_metric text, p_target int, p_start date, p_end date, p_invite text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; n text; o uuid; ids uuid[] := '{}'; cap int := case p_kind when 'couple' then 2 when 'family' then 6 else 12 end;
begin
  foreach n in array coalesce(p_invite, '{}') loop
    o := app.social_id(n);
    if o is null or o = p_user or not app.social_friends(p_user, o) or app.social_blocked(p_user, o) then raise exception 'not_friends'; end if;
    if not (o = any (ids)) then ids := ids || o; end if;
  end loop;
  if 1 + coalesce(array_length(ids, 1), 0) > cap or (p_kind = 'couple' and coalesce(array_length(ids, 1), 0) <> 1) then raise exception 'invalid_input'; end if;
  if (select count(*) from public.social_group_members where user_id = p_user) >= 10 then raise exception 'limit_reached'; end if;
  begin
    insert into public.social_groups (kind, title, metric, target, start_day, end_day, owner_id) values (p_kind, btrim(p_title), p_metric, p_target, p_start, p_end, p_user) returning id into gid;
  exception when check_violation then raise exception 'invalid_input'; end;
  insert into public.social_group_members (group_id, user_id, status) values (gid, p_user, 'joined');
  insert into public.social_group_members (group_id, user_id, status) select gid, x, 'invited' from unnest(ids) x;
  return gid;
end $$;
create or replace function app.social_respond_group(p_user uuid, p_group uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_group_members where group_id = p_group and user_id = p_user and status = 'invited') then raise exception 'not_found'; end if;
  if p_accept then update public.social_group_members set status = 'joined' where group_id = p_group and user_id = p_user;
  else delete from public.social_group_members where group_id = p_group and user_id = p_user; end if;
end $$;
create or replace function app.social_leave_group(p_user uuid, p_group uuid) returns void language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if not exists (select 1 from public.social_group_members where group_id = p_group and user_id = p_user) then raise exception 'not_found'; end if;
  delete from public.social_group_members where group_id = p_group and user_id = p_user;   -- the person's numbers go with it (cascade)
  select user_id into heir from public.social_group_members where group_id = p_group and status = 'joined' order by user_id limit 1;
  if heir is null then delete from public.social_groups where id = p_group;
  else update public.social_groups set owner_id = heir where id = p_group and owner_id = p_user; end if;
end $$;
-- One number per day. Joined members only; inside the group's dates; never in the future; clamped; zero removes the day.
create or replace function app.social_report(p_user uuid, p_group uuid, p_day date, p_value int) returns void language plpgsql security definer set search_path = '' as $$
declare g public.social_groups; v int;
begin
  select * into g from public.social_groups where id = p_group;
  if not found or not exists (select 1 from public.social_group_members where group_id = p_group and user_id = p_user and status = 'joined') then raise exception 'not_member'; end if;
  if p_day < g.start_day or p_day > g.end_day or p_day > (now() at time zone 'UTC')::date then raise exception 'closed'; end if;
  if p_value is null or p_value < 0 then raise exception 'invalid_input'; end if;
  v := case g.metric when 'active_days' then least(p_value, 1) else least(p_value, 600) end;
  delete from public.social_contributions where group_id = p_group and user_id = p_user and day = p_day;
  if v > 0 then insert into public.social_contributions (group_id, user_id, day, value) values (p_group, p_user, p_day, v); end if;
end $$;
create or replace function app.social_groups(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'title', g.title, 'metric', g.metric, 'target', g.target, 'startDay', g.start_day, 'endDay', g.end_day,
    'iAm', me.status, 'isOwner', g.owner_id = p_user,
    'members', case when me.status = 'joined' then (select coalesce(jsonb_agg(u.username order by u.username), '[]') from public.social_group_members x join public.community_members u on u.user_id = x.user_id where x.group_id = g.id and x.status = 'joined') else '[]'::jsonb end,
    'byMember', case when me.status = 'joined' then (select coalesce(jsonb_agg(jsonb_build_object('username', u.username, 'total', coalesce((select sum(value) from public.social_contributions c where c.group_id = g.id and c.user_id = x.user_id), 0), 'isMe', x.user_id = p_user)
        order by coalesce((select sum(value) from public.social_contributions c where c.group_id = g.id and c.user_id = x.user_id), 0) desc, u.username), '[]')
        from public.social_group_members x join public.community_members u on u.user_id = x.user_id where x.group_id = g.id and x.status = 'joined' and (x.user_id = p_user or not app.social_blocked(p_user, x.user_id))) else '[]'::jsonb end)
    order by g.end_day desc, g.title), '[]')
  from public.social_groups g join public.social_group_members me on me.group_id = g.id and me.user_id = p_user
$$;
create or replace function app.social_overview(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select app.social_lists(p_user) || jsonb_build_object('username', (select username from public.community_members where user_id = p_user), 'groups', app.social_groups(p_user))
$$;

-- ========== the one door the server uses ==========
create or replace function public.social_rpc(fn text, args jsonb default '{}'::jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare
  allowed text[] := array['social_request', 'social_respond', 'social_cancel', 'social_remove', 'social_block', 'social_unblock', 'social_set_share', 'social_shares_with',
    'social_view_friend', 'social_create_group', 'social_respond_group', 'social_leave_group', 'social_report', 'social_overview'];
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
             when t like '%[]' then format('array(select jsonb_array_elements_text(%L::jsonb -> %L))', args::text, k)
             else format('(%L::jsonb ->> %L)::%s', args::text, k, t) end);
    end if;
  end loop;
  if f.prorettype = 'void'::regtype then execute format('select app.%I(%s)', fn, call_args); result := null;
  else execute format('select to_jsonb(app.%I(%s))', fn, call_args) into result; end if;
  return result;
end $$;
revoke all on function public.social_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.social_rpc(text, jsonb) to service_role;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'social\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
