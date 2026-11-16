-- PROPOSED, NOT APPLIED. Community: public usernames, one chronological feed, posts (text, story, milestone, photos, short video), flat comments, one Encourage reaction,
-- reports, blocks and staff moderation. Rehearsed on a throwaway local database by supabase/proposed/community-dry-run.sh; never applied to a hosted project without approval.
--
-- Design (mirrors packages/shared/src/community*.ts, which stays the reference):
--  * Clients get NO direct access to any community table, and no community function is executable by `anon` or `authenticated`. Everything goes through a server
--    (an Edge Function using the service role), which verifies the caller's JWT and passes the verified user id. Guests browse through the same server, so a
--    guest never holds a database privilege. This follows the account Edge Function pattern.
--  * People are shown only by public username. Feeds return usernames and opaque content ids, never user ids, emails or health records.
--  * Photos and videos are always held for a moderator; risky text is held; unsafe text is refused. Reports hide content. Blocking is mutual. Every action is rate limited.
--  * Deleting an account (auth.users) removes everything the person made or did, by cascade.

-- ========== Tables (RLS on, no client access) ==========
-- Look-alike spellings collapse to one skeleton (adm1n, rn/m, 0/o, 1/l/i, underscores). Mirrors usernameSkeleton in TypeScript.
create or replace function app.community_skeleton(p text) returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(coalesce(p, '')),
    '_', ''), 'rn', 'm'), 'vv', 'w'), '1', 'l'), 'i', 'l'), '|', 'l'), '0', 'o'), '3', 'e'), '4', 'a'), '@', 'a'), '5', 's'), '$', 's'), '7', 't'), '8', 'b')
$$;

create table public.community_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  -- Staff restriction: 'muted' cannot post, comment or upload; 'suspended' cannot take any member action. Optional end time.
  restriction text check (restriction in ('muted', 'suspended')),
  restricted_until timestamptz,
  restriction_reason text check (restriction_reason in ('harassment', 'unsafe_content', 'spam', 'impersonation', 'other')),
  changed_at timestamptz,
  skeleton text generated always as (app.community_skeleton(username)) stored,
  created_at timestamptz not null default now(),
  constraint community_username_format check (username ~ '^[a-z][a-z0-9_]{2,19}$' and username !~ '__' and username !~ '_$')
);
create unique index community_members_username_key on public.community_members (username);
create unique index community_members_skeleton_key on public.community_members (skeleton);

-- Released names are held so nobody can take over a name people may still recognise.
create table public.community_retired_names (
  username text not null,
  skeleton text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  until timestamptz not null,
  primary key (username, owner_id)
);
create index community_retired_names_idx on public.community_retired_names (skeleton, until);

-- One row: the current mode, set by a moderator. 'text_only' pauses photos and videos; 'read_only' pauses all new posts and comments. Reading, reporting and deleting always work.
create table public.community_settings (
  id boolean primary key default true check (id),
  mode text not null default 'open' check (mode in ('open', 'text_only', 'read_only')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
insert into public.community_settings (id) values (true);

-- A verified server-side record for every uploaded file. A post can attach only a file the server itself checked.
create table public.community_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[A-Za-z0-9/_.-]{1,200}$' and storage_path !~ '\.\.'),
  kind text not null check (kind in ('photo', 'video')),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm')),
  state text not null default 'issued' check (state in ('issued', 'verified', 'attached', 'rejected')),
  bytes bigint check (bytes is null or bytes between 1 and 26214400),
  duration_s numeric check (duration_s is null or duration_s between 0.1 and 30),
  created_at timestamptz not null default now(),
  constraint community_uploads_kind_mime check ((kind = 'photo') = (mime like 'image/%'))
);
create index community_uploads_user_idx on public.community_uploads (user_id, created_at desc);

-- Short-window request counters (burst limits). Rows are pruned by community_prune.
create table public.community_burst (
  key text not null,
  bucket text not null,
  window_start timestamptz not null,
  n int not null default 0,
  primary key (key, bucket, window_start)
);

-- One row per staff action. The tamper-evident record is the shared audit log; this keeps the moderator's note next to the target.
create table public.community_report_resolutions (
  id bigint generated always as identity primary key,
  target_id uuid not null,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  at timestamptz not null default now()
);

create or replace function app.community_milestone_ok(m jsonb) returns boolean language sql immutable set search_path = '' as $$
  select m is null or (
    jsonb_typeof(m) = 'object'
    and not exists (select 1 from jsonb_object_keys(m) k where k not in ('kind', 'title', 'style', 'minutes', 'achievementId'))
    and m ->> 'kind' in ('workout', 'achievement')
    and char_length(coalesce(m ->> 'title', '')) between 1 and 80
  )
$$;

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_members (user_id) on delete cascade,
  type text not null check (type in ('text', 'story', 'milestone', 'photo', 'video')),
  body text not null default '' check (char_length(body) <= 1500),
  milestone jsonb check (app.community_milestone_ok(milestone)),
  status text not null default 'held' check (status in ('published', 'held', 'hidden', 'removed')),
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint community_post_milestone_shape check ((type = 'milestone') = (milestone is not null))
);
create index community_posts_feed_idx on public.community_posts (created_at desc, id desc) where status = 'published';
create index community_posts_author_idx on public.community_posts (author_id, created_at desc);

create table public.community_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  role text not null check (role in ('single', 'before', 'after')),
  storage_path text not null check (storage_path ~ '^[A-Za-z0-9/_.-]{1,200}$' and storage_path !~ '\.\.'),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm')),
  bytes bigint not null check (bytes between 1 and 26214400),
  duration_s numeric check (duration_s is null or duration_s between 0.1 and 30),
  constraint community_media_kind_mime check ((kind = 'photo') = (mime like 'image/%')),
  constraint community_media_video_duration check (kind = 'photo' or duration_s is not null),
  constraint community_media_photo_size check (kind = 'video' or bytes <= 8388608),
  constraint community_media_video_role check (kind = 'photo' or role = 'single')
);
create index community_media_post_idx on public.community_media (post_id);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.community_members (user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);
create index community_comments_post_idx on public.community_comments (post_id, created_at);

create table public.community_reactions (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('harassment', 'unsafe_advice', 'body_shaming_or_eating_concern', 'spam', 'private_information', 'child_safety', 'self_harm', 'other')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, target_id)
);
create index community_reports_target_idx on public.community_reports (target_id);

create table public.community_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index community_blocks_blocked_idx on public.community_blocks (blocked_id);

do $$ declare t text; begin
  foreach t in array array['community_members', 'community_posts', 'community_media', 'community_comments', 'community_reactions', 'community_reports', 'community_blocks', 'community_retired_names', 'community_uploads', 'community_burst', 'community_report_resolutions', 'community_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    -- A deny-all policy (the structural RLS tests require every table to carry one). Only the server (service role, which bypasses RLS) reads or writes.
    execute format('create policy %I on public.%I for all to authenticated using (false) with check (false)', t || '_deny', t);
  end loop;
end $$;

-- ========== Rules ==========
-- Same decisions as screenText / validateUsername in TypeScript; supabase/tests/community-cases.json is run against both.
create or replace function app.community_username_problem(p text) returns text language plpgsql immutable set search_path = '' as $$
declare u text := lower(btrim(coalesce(p, ''))); flat text;
begin
  if char_length(u) < 3 or char_length(u) > 20 then return 'invalid_username'; end if;
  if u !~ '^[a-z][a-z0-9_]*$' or u ~ '_$' or u ~ '__' then return 'invalid_username'; end if;
  if u ~ '[0-9]{6,}' or u ~ '[0-9a-f]{16,}' then return 'invalid_username'; end if;
  flat := replace(u, '_', '');
  if u = any (array['admin','administrator','moderator','mod','staff','support','official','system','root','null','undefined','anonymous','everyone','deleted','pulse','coach','team','help'])
     or app.community_skeleton(u) = any (select app.community_skeleton(x) from unnest(array['admin','administrator','moderator','mod','staff','support','official','system','root','null','undefined','anonymous','everyone','deleted','pulse','coach','team','help']) x)
     or exists (select 1 from unnest(array['dancehallfit', 'dancehall_fit', 'dhfit', 'dancehallai']) b where app.community_skeleton(flat) like '%' || app.community_skeleton(b) || '%')
     or flat ~ '(dancehallfit|dhfit|dancehallai)'
     or flat ~ '(idiot|stupid|ugly|fatty|loser|hate)'
     or flat ~ '(thinspo|proana|promia|bonespo|meanspo|edtwt|anorexiatips|purgetips)' then
    return 'invalid_username';
  end if;
  return null;
end $$;

create or replace function app.community_screen(p_text text, p_max int) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(coalesce(p_text, ''));
  l text := lower(btrim(coalesce(p_text, '')));
  squashed text := regexp_replace(lower(btrim(coalesce(p_text, ''))), '[[:space:]_-]', '', 'g');
  f text[] := '{}';
  w text;
begin
  if char_length(t) = 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('empty')); end if;
  if char_length(t) > p_max then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('too_long')); end if;
  foreach w in array array['kill myself', 'suicide', 'end my life', 'self harm', 'self-harm', 'cut myself', 'want to die'] loop
    if position(w in l) > 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('self_harm')); end if;
  end loop;
  foreach w in array array['thinspo', 'proana', 'pro_ana', 'promia', 'pro_mia', 'bonespo', 'meanspo', 'edtwt', 'anorexia tips', 'purge tips'] loop
    if position(regexp_replace(w, '[[:space:]_-]', '', 'g') in squashed) > 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('ed_content')); end if;
  end loop;
  if t ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' then f := f || array['email']; end if;
  if t ~* '(https?://|www\.)[^[:space:]]+|\y[a-z0-9-]+\.(com|net|org|io|co|me|app|link|ly|gg|xyz|info|biz|shop)\y' then f := f || array['link']; end if;
  if t ~* '([+]?[0-9][[:space:]().-]?){7,}' then f := f || array['phone']; end if;
  if t ~* '(^|[[:space:]])@[a-z0-9_]+' then f := f || array['mention']; end if;
  if t ~* '\y(dm me|message me|text me|whats ?app|telegram|snap ?chat|insta(gram)?|cash ?app|venmo|paypal|onlyfans|link in bio|follow me)\y' then f := f || array['contact_solicit']; end if;
  if cardinality(f) > 0 then return jsonb_build_object('decision', 'block', 'flags', to_jsonb(f)); end if;
  if t ~* '\y(lost|lose|dropped|shed|down)[[:space:]]+[0-9]+([.][0-9]+)?[[:space:]]*(kg|kilos?|lbs?|pounds?|stone|dress sizes?|sizes?)\y' then f := f || array['weight_claim']; end if;
  if t ~* '\y(i[[:space:]]*(now[[:space:]]*)?weigh|weighing|my weight is|bmi (is|of))[[:space:]]*[0-9]' or t ~* '\y[0-9]{3,4}[[:space:]]*(calories|kcal|cals)\y' then f := f || array['health_numbers']; end if;
  if t ~* '\y(cure[sd]?|detox|miracle|guaranteed|burn(s|ed)? fat fast|fat[- ]burner|diet pills?|weight loss (drug|jab|injection)|ozempic|wegovy|semaglutide|mounjaro|tirzepatide|laxatives?|starv[a-z]*|fasting for [0-9]+)\y' then f := f || array['health_claim']; end if;
  if t ~ '[A-Z]{12,}' then f := f || array['shouting']; end if;
  if cardinality(f) > 0 then return jsonb_build_object('decision', 'hold', 'flags', to_jsonb(f)); end if;
  return jsonb_build_object('decision', 'allow', 'flags', '[]'::jsonb);
end $$;

-- Daily limits. Counted from the tables themselves, per person, over the last 24 hours.
create or replace function app.community_used(p_user uuid, p_kind text) returns int language sql stable set search_path = '' as $$
  select case p_kind
    when 'post' then (select count(*)::int from public.community_posts where author_id = p_user and created_at > now() - interval '1 day')
    when 'comment' then (select count(*)::int from public.community_comments where author_id = p_user and created_at > now() - interval '1 day')
    when 'reaction' then (select count(*)::int from public.community_reactions where user_id = p_user and created_at > now() - interval '1 day')
    when 'report' then (select count(*)::int from public.community_reports where reporter_id = p_user and created_at > now() - interval '1 day')
    else 0 end
$$;
create or replace function app.community_limit(p_kind text) returns int language sql immutable set search_path = '' as $$
  select case p_kind when 'post' then 5 when 'comment' then 30 when 'reaction' then 100 when 'report' then 10 else 0 end
$$;

-- Mutual, silent blocking.
create or replace function app.community_blocked_between(a uuid, b uuid) returns boolean language sql stable set search_path = '' as $$
  select a is not null and b is not null and exists (
    select 1 from public.community_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function app.community_is_moderator(p_actor uuid, p_aal2 boolean) returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_aal2, false) and exists (
    select 1 from public.staff_roles r where r.user_id = p_actor and 'moderation.review' = any (app.role_permissions(r.role)))
$$;

-- ========== Server-only operations (verified user id passed in by the server) ==========
create or replace function app.community_restriction(m public.community_members) returns text language sql stable set search_path = '' as $$
  select case when m.restriction is not null and (m.restricted_until is null or m.restricted_until > now()) then m.restriction end
$$;

-- Photos and videos pause by themselves when review cannot keep up (20 or more waiting, or the oldest waiting more than 72 hours), whatever the manual mode says.
-- Mirrors MODERATION_TARGETS.mediaPauseCount / mediaPauseHours in TypeScript.
create or replace function app.community_effective_mode() returns text language sql stable set search_path = '' as $$
  select case
    when (select mode from public.community_settings) = 'read_only' then 'read_only'
    when (select mode from public.community_settings) = 'text_only' then 'text_only'
    when (select count(*) from public.community_posts p where p.status = 'held' and exists (select 1 from public.community_media x where x.post_id = p.id)) >= 20
      or exists (select 1 from public.community_posts p where p.status = 'held' and p.created_at < now() - interval '72 hours' and exists (select 1 from public.community_media x where x.post_id = p.id)) then 'text_only'
    else 'open' end
$$;
create or replace function app.community_status() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mode', app.community_effective_mode())
$$;

-- Why a name cannot be used by this member: null when it can. Checks other members, look-alikes and recently released names.
create or replace function app.community_name_problem(p_user uuid, p_name text) returns text language plpgsql stable set search_path = '' as $$
begin
  if app.community_username_problem(p_name) is not null then return 'invalid_username'; end if;
  if exists (select 1 from public.community_members where username = p_name and user_id <> p_user) then return 'taken'; end if;
  if exists (select 1 from public.community_members where skeleton = app.community_skeleton(p_name) and user_id <> p_user) then return 'too_similar'; end if;
  if exists (select 1 from public.community_retired_names where owner_id <> p_user and until > now() and (username = p_name or skeleton = app.community_skeleton(p_name))) then return 'taken'; end if;
  return null;
end $$;

create or replace function app.community_claim_username(p_user uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare u text := lower(btrim(coalesce(p_name, ''))); problem text;
begin
  if exists (select 1 from public.community_members where user_id = p_user) then raise exception 'already_set'; end if;
  problem := app.community_name_problem(p_user, u);
  if problem is not null then raise exception '%', problem; end if;
  begin
    insert into public.community_members (user_id, username) values (p_user, u);
  exception when unique_violation then raise exception 'taken';
  end;
  return u;
end $$;

-- Changing a name: the first change is free, then one every 30 days. The old name is held for 90 days. Posts follow the new name (they join on the member).
create or replace function app.community_change_username(p_user uuid, p_name text) returns text language plpgsql security definer set search_path = '' as $$
declare u text := lower(btrim(coalesce(p_name, ''))); m public.community_members; problem text;
begin
  select * into m from public.community_members where user_id = p_user for update;
  if not found then raise exception 'needs_username'; end if;
  if app.community_restriction(m) = 'suspended' then raise exception 'suspended'; end if;
  if m.changed_at is not null and m.changed_at + interval '30 days' > now() then raise exception 'cooldown'; end if;
  if u = m.username then raise exception 'unchanged'; end if;
  problem := app.community_name_problem(p_user, u);
  if problem is not null then raise exception '%', problem; end if;
  insert into public.community_retired_names (username, skeleton, owner_id, until)
  values (m.username, app.community_skeleton(m.username), p_user, now() + interval '90 days')
  on conflict (username, owner_id) do update set until = excluded.until;
  begin
    update public.community_members set username = u, changed_at = now() where user_id = p_user;
  exception when unique_violation then raise exception 'taken';
  end;
  return u;
end $$;

create or replace function app.community_profile(p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('username', m.username,
           'canChangeAt', case when m.changed_at is not null and m.changed_at + interval '30 days' > now() then m.changed_at + interval '30 days' end,
           'restriction', app.community_restriction(m))
         from public.community_members m where m.user_id = p_user), jsonb_build_object('username', null))
$$;

create or replace function app.community_create_post(p_user uuid, p_type text, p_body text, p_milestone jsonb, p_media jsonb, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.community_members; media jsonb := coalesce(p_media, '[]'::jsonb); photos int; videos int; r jsonb; flags text[] := '{}'; v_status text := 'published';
  v_body text := btrim(coalesce(p_body, '')); v_ms jsonb := null; v_id uuid; it jsonb; roles text[]; up public.community_uploads;
begin
  if p_confirmed is not true then raise exception 'not_confirmed'; end if;
  select * into m from public.community_members where user_id = p_user;
  if not found then raise exception 'needs_username'; end if;
  if app.community_restriction(m) is not null then raise exception '%', app.community_restriction(m); end if;
  if app.community_effective_mode() = 'read_only' then raise exception 'paused'; end if;
  if app.community_used(p_user, 'post') >= app.community_limit('post') then raise exception 'rate_limited'; end if;
  if p_type not in ('text', 'story', 'milestone', 'photo', 'video') then raise exception 'invalid_type'; end if;
  if jsonb_typeof(media) <> 'array' then raise exception 'invalid_media'; end if;
  select count(*) filter (where e ->> 'kind' = 'photo'), count(*) filter (where e ->> 'kind' = 'video') into photos, videos from jsonb_array_elements(media) e;
  if (photos > 0 and videos > 0) or videos > 1 or photos > 2 then raise exception 'invalid_media'; end if;
  if photos + videos > 0 and app.community_effective_mode() <> 'open' then raise exception 'media_paused'; end if;
  if (p_type = 'photo') <> (photos > 0) or (p_type = 'video') <> (videos > 0) then raise exception 'invalid_media'; end if;
  if photos = 2 then
    select array_agg(e ->> 'role' order by e ->> 'role') into roles from jsonb_array_elements(media) e;
    if roles <> array['after', 'before'] then raise exception 'invalid_media'; end if;
  elsif photos = 1 and (media -> 0 ->> 'role') <> 'single' then raise exception 'invalid_media';
  end if;
  if p_type = 'milestone' then
    if p_milestone is null or jsonb_typeof(p_milestone) <> 'object' then raise exception 'invalid_milestone'; end if;
    -- Only the whitelisted keys are ever copied, whatever else the caller sent.
    v_ms := jsonb_strip_nulls(jsonb_build_object(
      'kind', p_milestone ->> 'kind',
      'title', left(btrim(coalesce(p_milestone ->> 'title', '')), 80),
      'style', left(p_milestone ->> 'style', 40),
      'minutes', case when (p_milestone ->> 'minutes') ~ '^[0-9]+$' and (p_milestone ->> 'minutes')::int > 0 then least((p_milestone ->> 'minutes')::int, 600) end,
      'achievementId', left(p_milestone ->> 'achievementId', 40)));
    if not app.community_milestone_ok(v_ms) then raise exception 'invalid_milestone'; end if;
  elsif p_milestone is not null then raise exception 'invalid_milestone';
  end if;
  if p_type in ('text', 'story') or char_length(v_body) > 0 then
    r := app.community_screen(v_body, case when p_type = 'story' then 1500 else 500 end);
    if r ->> 'decision' = 'block' then raise exception 'blocked'; end if;
    if r ->> 'decision' = 'hold' then v_status := 'held'; flags := array(select jsonb_array_elements_text(r -> 'flags')); end if;
  end if;
  -- Photos and videos cannot be scanned: a person reviews every one before anyone else sees it.
  if photos + videos > 0 then v_status := 'held'; flags := flags || array['media_review']; end if;
  insert into public.community_posts (author_id, type, body, milestone, status, flags) values (p_user, p_type, v_body, v_ms, v_status, flags) returning id into v_id;
  -- Only files the server itself received and checked can be attached, and only the member's own, once. Size and type come from that record, not the caller.
  for it in select * from jsonb_array_elements(media) loop
    select * into up from public.community_uploads where user_id = p_user and storage_path = it ->> 'path' and state = 'verified' for update;
    if not found or up.kind <> it ->> 'kind' then raise exception 'invalid_media'; end if;
    insert into public.community_media (post_id, kind, role, storage_path, mime, bytes, duration_s)
    values (v_id, up.kind, it ->> 'role', up.storage_path, up.mime, up.bytes, up.duration_s);
    update public.community_uploads set state = 'attached' where id = up.id;
  end loop;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

create or replace function app.community_visible_post(p public.community_posts, p_viewer uuid) returns boolean language sql stable set search_path = '' as $$
  select case when p.author_id = p_viewer then p.status <> 'removed'
              else p.status = 'published' and not app.community_blocked_between(p_viewer, p.author_id) end
$$;

-- The public feed (guests pass NULL). Returns usernames and opaque ids only. Newest first; no ranking of any kind.
create or replace function app.community_feed(p_viewer uuid, p_cursor_at timestamptz, p_cursor_id uuid, p_limit int)
returns table (id uuid, author text, type text, body text, milestone jsonb, media jsonb, created_at timestamptz, is_mine boolean, status text, comment_count int, encouraged_by_me boolean, encouraged_count int)
language sql stable security definer set search_path = '' as $$
  select p.id, m.username, p.type, p.body, p.milestone,
         coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'role', x.role, 'path', x.storage_path, 'durationS', x.duration_s) order by x.role) from public.community_media x where x.post_id = p.id), '[]'::jsonb),
         p.created_at, p.author_id = p_viewer, p.status,
         (select count(*)::int from public.community_comments c where c.post_id = p.id and ((c.status = 'published' and not app.community_blocked_between(p_viewer, c.author_id)) or (c.author_id = p_viewer and c.status <> 'removed'))),
         exists (select 1 from public.community_reactions r where r.post_id = p.id and r.user_id = p_viewer),
         case when p.author_id = p_viewer then (select count(*)::int from public.community_reactions r where r.post_id = p.id) end
    from public.community_posts p join public.community_members m on m.user_id = p.author_id
   where app.community_visible_post(p, p_viewer)
     and (p_cursor_at is null or (p.created_at, p.id) < (p_cursor_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by p.created_at desc, p.id desc
   limit greatest(1, least(coalesce(p_limit, 20), 30))
$$;

create or replace function app.community_comments(p_viewer uuid, p_post uuid)
returns table (id uuid, post_id uuid, author text, body text, created_at timestamptz, is_mine boolean, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.post_id, m.username, c.body, c.created_at, c.author_id = p_viewer, c.status
    from public.community_comments c
    join public.community_members m on m.user_id = c.author_id
    join public.community_posts p on p.id = c.post_id
   where c.post_id = p_post and app.community_visible_post(p, p_viewer)
     and ((c.status = 'published' and not app.community_blocked_between(p_viewer, c.author_id)) or (c.author_id = p_viewer and c.status <> 'removed'))
   order by c.created_at, c.id
$$;

create or replace function app.community_add_comment(p_user uuid, p_post uuid, p_body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.community_members; p public.community_posts; r jsonb; v_status text := 'published'; v_id uuid;
begin
  select * into p from public.community_posts where id = p_post;
  if not found or not app.community_visible_post(p, p_user) then raise exception 'not_found'; end if;
  select * into m from public.community_members where user_id = p_user;
  if not found then raise exception 'needs_username'; end if;
  if app.community_restriction(m) is not null then raise exception '%', app.community_restriction(m); end if;
  if app.community_effective_mode() = 'read_only' then raise exception 'paused'; end if;
  if app.community_used(p_user, 'comment') >= app.community_limit('comment') then raise exception 'rate_limited'; end if;
  r := app.community_screen(p_body, 300);
  if r ->> 'decision' = 'block' then raise exception 'blocked'; end if;
  if r ->> 'decision' = 'hold' then v_status := 'hidden'; end if;
  insert into public.community_comments (post_id, author_id, body, status) values (p_post, p_user, btrim(p_body), v_status) returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

create or replace function app.community_delete_post(p_user uuid, p_post uuid) returns text[] language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  select coalesce(array_agg(x.storage_path), '{}') into paths from public.community_media x join public.community_posts p on p.id = x.post_id where p.id = p_post and p.author_id = p_user;
  delete from public.community_posts where id = p_post and author_id = p_user;
  if not found then raise exception 'not_found'; end if;
  delete from public.community_uploads where storage_path = any (paths);
  return paths; -- the server deletes these files
end $$;

create or replace function app.community_delete_comment(p_user uuid, p_comment uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.community_comments c using public.community_posts p
   where c.id = p_comment and p.id = c.post_id and (c.author_id = p_user or p.author_id = p_user);
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function app.community_set_encourage(p_user uuid, p_post uuid, p_on boolean) returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.community_posts; had boolean;
begin
  select * into p from public.community_posts where id = p_post;
  if not found or not app.community_visible_post(p, p_user) then raise exception 'not_found'; end if;
  if p.author_id = p_user then raise exception 'own_post'; end if;
  if exists (select 1 from public.community_members mm where mm.user_id = p_user and app.community_restriction(mm) = 'suspended') then raise exception 'suspended'; end if;
  select exists (select 1 from public.community_reactions where post_id = p_post and user_id = p_user) into had;
  if p_on = had then return had; end if;
  if p_on then
    if app.community_used(p_user, 'reaction') >= app.community_limit('reaction') then raise exception 'rate_limited'; end if;
    insert into public.community_reactions (post_id, user_id) values (p_post, p_user);
  else
    delete from public.community_reactions where post_id = p_post and user_id = p_user;
  end if;
  return p_on;
end $$;

create or replace function app.community_report(p_user uuid, p_type text, p_target uuid, p_reason text, p_note text) returns void language plpgsql security definer set search_path = '' as $$
declare post_row public.community_posts; cmt public.community_comments; author uuid; n int; reasons text[];
begin
  if p_type = 'post' then
    select * into post_row from public.community_posts where id = p_target;
    if not found or not app.community_visible_post(post_row, p_user) then raise exception 'not_found'; end if;
    author := post_row.author_id;
  else
    select * into cmt from public.community_comments where id = p_target;
    if not found then raise exception 'not_found'; end if;
    select * into post_row from public.community_posts where id = cmt.post_id;
    if not app.community_visible_post(post_row, p_user) or cmt.status <> 'published' or app.community_blocked_between(p_user, cmt.author_id) then raise exception 'not_found'; end if;
    author := cmt.author_id;
  end if;
  if author = p_user then raise exception 'own_content'; end if;
  if exists (select 1 from public.community_reports where reporter_id = p_user and target_id = p_target) then return; end if; -- quiet
  if app.community_used(p_user, 'report') >= app.community_limit('report') then raise exception 'rate_limited'; end if;
  insert into public.community_reports (target_type, target_id, reporter_id, reason, note) values (p_type, p_target, p_user, p_reason, left(btrim(p_note), 200));
  select count(distinct reporter_id)::int, array_agg(reason) into n, reasons from public.community_reports where target_id = p_target and resolved_at is null;
  if n >= 3 or reasons && array['private_information', 'child_safety', 'self_harm'] then
    if p_type = 'post' then
      update public.community_posts set status = 'hidden', flags = case when p_reason in ('private_information', 'child_safety', 'self_harm') and not (flags @> array[p_reason]) then flags || p_reason else flags end
       where id = p_target and status = 'published';
    else
      update public.community_comments set status = 'hidden' where id = p_target and status = 'published';
    end if;
  end if;
end $$;

create or replace function app.community_block(p_user uuid, p_username text) returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select user_id into target from public.community_members where username = lower(btrim(p_username));
  if target is null then raise exception 'not_found'; end if;
  if target = p_user then raise exception 'self'; end if;
  insert into public.community_blocks (blocker_id, blocked_id) values (p_user, target) on conflict do nothing;
end $$;
create or replace function app.community_unblock(p_user uuid, p_username text) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.community_blocks b using public.community_members m where b.blocker_id = p_user and b.blocked_id = m.user_id and m.username = lower(btrim(p_username));
end $$;
create or replace function app.community_blocked(p_user uuid) returns setof text language sql stable security definer set search_path = '' as $$
  select m.username from public.community_blocks b join public.community_members m on m.user_id = b.blocked_id where b.blocker_id = p_user order by 1
$$;

-- ========== Moderation (a verified moderator with a second factor; sees usernames, content and flags only) ==========
create or replace function app.community_moderation_queue(p_actor uuid, p_aal2 boolean)
returns table (id uuid, target_type text, author text, body text, status text, flags text[], reasons text[], report_count int, urgent boolean, media jsonb, age_hours numeric, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.community_is_moderator(p_actor, p_aal2) then raise exception 'forbidden'; end if;
  return query
    select q.id, q.target_type, q.author, q.body, q.status, q.flags, q.reasons, q.report_count,
           (q.flags && array['self_harm', 'child_safety', 'private_information'] or q.reasons && array['self_harm', 'child_safety', 'private_information']),
           q.media, round(extract(epoch from (now() - q.created_at)) / 3600, 1), q.created_at from (
      select p.id, 'post'::text as target_type, m.username as author, p.body, p.status, p.flags,
             coalesce((select array_agg(distinct r.reason) from public.community_reports r where r.target_id = p.id and r.resolved_at is null), '{}'::text[]) as reasons,
             (select count(*)::int from public.community_reports r where r.target_id = p.id and r.resolved_at is null) as report_count,
             coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'role', x.role, 'path', x.storage_path, 'durationS', x.duration_s) order by x.role) from public.community_media x where x.post_id = p.id), '[]'::jsonb) as media,
             p.created_at
        from public.community_posts p join public.community_members m on m.user_id = p.author_id
       where p.status in ('held', 'hidden') or (p.status = 'published' and exists (select 1 from public.community_reports r where r.target_id = p.id and r.resolved_at is null))
      union all
      select c.id, 'comment', m.username, c.body, c.status, '{}'::text[],
             coalesce((select array_agg(distinct r.reason) from public.community_reports r where r.target_id = c.id and r.resolved_at is null), '{}'::text[]),
             (select count(*)::int from public.community_reports r where r.target_id = c.id and r.resolved_at is null), '[]'::jsonb, c.created_at
        from public.community_comments c join public.community_members m on m.user_id = c.author_id
       where c.status = 'hidden' or (c.status = 'published' and exists (select 1 from public.community_reports r where r.target_id = c.id and r.resolved_at is null))) q
    order by case when q.flags && array['self_harm', 'child_safety', 'private_information'] or q.reasons && array['self_harm', 'child_safety', 'private_information'] then 0 when q.report_count > 0 then 1 else 2 end, q.created_at, q.id;
end $$;

-- Tamper-evident record in the shared audit log. The acting moderator is passed in (the server verified them). Never records content or health data.
create or replace function app.community_audit(p_actor uuid, p_action text, p_row text, p_detail jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_prev text; v_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(727001);
  select hash into v_prev from public.audit_log order by id desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  insert into public.audit_log (at, actor, action, table_name, row_id, detail, prev_hash, hash)
  values (v_at, p_actor, p_action, 'community', p_row, p_detail, v_prev, app.audit_stamp(v_prev, p_actor, p_action, 'community', p_row, p_detail, v_at));
end $$;

-- approve / restore: publish; remove: take down for everyone including its author. Open reports are resolved, never deleted. Returns the media files to delete.
create or replace function app.community_moderate(p_actor uuid, p_aal2 boolean, p_type text, p_target uuid, p_action text, p_note text default null) returns text[] language plpgsql security definer set search_path = '' as $$
declare v_status text := case p_action when 'remove' then 'removed' when 'approve' then 'published' when 'restore' then 'published' end; paths text[] := '{}';
begin
  if not app.community_is_moderator(p_actor, p_aal2) then raise exception 'forbidden'; end if;
  if v_status is null or p_type not in ('post', 'comment') then raise exception 'invalid_action'; end if;
  if p_type = 'post' then update public.community_posts set status = v_status where id = p_target;
  else update public.community_comments set status = v_status where id = p_target; end if;
  if not found then raise exception 'not_found'; end if;
  if p_action = 'remove' and p_type = 'post' then
    select coalesce(array_agg(storage_path), '{}') into paths from public.community_media where post_id = p_target;
    delete from public.community_media where post_id = p_target;
    delete from public.community_uploads where storage_path = any (paths);
  end if;
  update public.community_reports set resolved_at = now() where target_id = p_target and resolved_at is null;
  insert into public.community_report_resolutions (target_id, action, actor_id, note) values (p_target, p_action, p_actor, left(btrim(p_note), 300));
  perform app.community_audit(p_actor, 'community.' || p_action, p_target::text, jsonb_build_object('type', p_type));
  return paths;
end $$;

-- Restrict or release a member. 'muted' stops posting, commenting and uploading; 'suspended' stops every member action. Optional end after p_hours.
create or replace function app.community_restrict(p_actor uuid, p_aal2 boolean, p_username text, p_restriction text, p_hours int, p_reason text, p_note text default null) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app.community_is_moderator(p_actor, p_aal2) then raise exception 'forbidden'; end if;
  if p_restriction not in ('none', 'muted', 'suspended') then raise exception 'invalid_action'; end if;
  if p_restriction <> 'none' and p_reason not in ('harassment', 'unsafe_content', 'spam', 'impersonation', 'other') then raise exception 'invalid_action'; end if;
  if p_hours is not null and (p_hours < 1 or p_hours > 8760) then raise exception 'invalid_action'; end if;
  update public.community_members set
    restriction = nullif(p_restriction, 'none'),
    restricted_until = case when p_restriction = 'none' or p_hours is null then null else now() + make_interval(hours => p_hours) end,
    restriction_reason = case when p_restriction = 'none' then null else p_reason end
   where username = lower(btrim(p_username)) returning user_id into v_id;
  if v_id is null then raise exception 'not_found'; end if;
  insert into public.community_report_resolutions (target_id, action, actor_id, note) values (v_id, 'restrict:' || p_restriction, p_actor, left(btrim(p_note), 300));
  perform app.community_audit(p_actor, 'community.restrict', lower(btrim(p_username)), jsonb_build_object('restriction', p_restriction, 'hours', p_hours, 'reason', p_reason));
end $$;

create or replace function app.community_set_mode(p_actor uuid, p_aal2 boolean, p_mode text, p_note text default null) returns text language plpgsql security definer set search_path = '' as $$
begin
  if not app.community_is_moderator(p_actor, p_aal2) then raise exception 'forbidden'; end if;
  if p_mode not in ('open', 'text_only', 'read_only') then raise exception 'invalid_action'; end if;
  update public.community_settings set mode = p_mode, changed_by = p_actor, changed_at = now();
  insert into public.community_report_resolutions (target_id, action, actor_id, note) values (gen_random_uuid(), 'mode:' || p_mode, p_actor, left(btrim(p_note), 300));
  perform app.community_audit(p_actor, 'community.mode', p_mode, jsonb_build_object('mode', p_mode));
  return p_mode;
end $$;

-- How far behind is moderation? Counts and ages only, no content. Targets are PROPOSED defaults awaiting the owner's decision.
create or replace function app.community_backlog(p_actor uuid, p_aal2 boolean) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare urgent_target numeric := 4; normal_target numeric := 48; j jsonb;
begin
  if not app.community_is_moderator(p_actor, p_aal2) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'open', count(*),
    'urgent', count(*) filter (where urgent),
    'media', count(*) filter (where jsonb_array_length(media) > 0),
    'oldestHours', coalesce(max(age_hours), 0),
    'oldestUrgentHours', coalesce(max(age_hours) filter (where urgent), 0),
    'urgentOverTarget', count(*) filter (where urgent and age_hours > urgent_target),
    'overTarget', count(*) filter (where not urgent and age_hours > normal_target),
    'urgentTargetHours', urgent_target, 'targetHours', normal_target,
    'mode', (select mode from public.community_settings), 'effectiveMode', app.community_effective_mode()) into j
  from app.community_moderation_queue(p_actor, p_aal2);
  return j;
end $$;

-- ========== Uploads: private storage, verified by the server before a post can use them ==========
create or replace function app.community_issue_upload(p_user uuid, p_kind text, p_mime text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.community_members; v_id uuid := gen_random_uuid(); ext text; v_path text;
begin
  select * into m from public.community_members where user_id = p_user;
  if not found then raise exception 'needs_username'; end if;
  if app.community_restriction(m) is not null then raise exception '%', app.community_restriction(m); end if;
  if app.community_effective_mode() <> 'open' then raise exception 'media_paused'; end if;
  if p_kind not in ('photo', 'video') or (p_kind = 'photo') <> (p_mime like 'image/%') then raise exception 'invalid_media'; end if;
  ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' end;
  if ext is null then raise exception 'invalid_media'; end if;
  if (select count(*) from public.community_uploads where user_id = p_user and created_at > now() - interval '1 day') >= 10 then raise exception 'rate_limited'; end if;
  v_path := 'm/' || v_id::text || '.' || ext; -- no account identifier in the path: signed links to published media must not reveal one
  insert into public.community_uploads (id, user_id, storage_path, kind, mime) values (v_id, p_user, v_path, p_kind, p_mime);
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

-- The server measured the stored file (after checking its real type and removing hidden metadata) and reports what it found.
create or replace function app.community_verify_upload(p_user uuid, p_path text, p_bytes bigint, p_duration numeric) returns void language plpgsql security definer set search_path = '' as $$
declare u public.community_uploads;
begin
  select * into u from public.community_uploads where user_id = p_user and storage_path = p_path and state = 'issued' for update;
  if not found then raise exception 'not_found'; end if;
  if p_bytes is null or p_bytes < 1 or (u.kind = 'photo' and p_bytes > 8388608) or (u.kind = 'video' and p_bytes > 26214400) then
    update public.community_uploads set state = 'rejected' where id = u.id; raise exception 'too_large';
  end if;
  if u.kind = 'video' and (p_duration is null or p_duration < 0.1 or p_duration > 30) then
    update public.community_uploads set state = 'rejected' where id = u.id; raise exception 'too_long';
  end if;
  update public.community_uploads set state = 'verified', bytes = p_bytes, duration_s = case when u.kind = 'video' then p_duration end where id = u.id;
end $$;

-- The server calls this before touching a file: it must be the caller's own, still waiting to be checked. Returns the type promised when the ticket was issued.
create or replace function app.community_upload_ticket(p_user uuid, p_path text) returns text language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  select mime into m from public.community_uploads where user_id = p_user and storage_path = p_path and state = 'issued';
  if m is null then raise exception 'not_found'; end if;
  return m;
end $$;

create or replace function app.community_reject_upload(p_user uuid, p_path text) returns void language sql security definer set search_path = '' as $$
  update public.community_uploads set state = 'rejected' where user_id = p_user and storage_path = p_path and state in ('issued', 'verified');
$$;

-- Files to delete when someone deletes their account (call BEFORE deleting the auth user: the rows cascade away with it).
create or replace function app.community_user_media(p_user uuid) returns setof text language sql stable security definer set search_path = '' as $$
  select storage_path from public.community_uploads where user_id = p_user
$$;

-- Leave Community without deleting the account: removes the username, posts, comments, reactions, blocks and files. Returns files for the server to delete.
create or replace function app.community_leave(p_user uuid) returns text[] language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  select coalesce(array_agg(storage_path), '{}') into paths from public.community_uploads where user_id = p_user;
  delete from public.community_posts where author_id = p_user;
  delete from public.community_comments where author_id = p_user;
  delete from public.community_reactions where user_id = p_user;
  delete from public.community_blocks where blocker_id = p_user or blocked_id = p_user;
  delete from public.community_uploads where user_id = p_user;
  delete from public.community_retired_names where owner_id = p_user;
  delete from public.community_members where user_id = p_user;
  return paths;
end $$;

-- ========== Burst limits and housekeeping ==========
-- True while the caller is within `p_max` requests per `p_seconds` for this key (a user id or a hashed network address) and bucket.
create or replace function app.community_burst(p_key text, p_bucket text, p_max int, p_seconds int) returns boolean language plpgsql security definer set search_path = '' as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_seconds, 1)) * greatest(p_seconds, 1)); c int;
begin
  insert into public.community_burst (key, bucket, window_start, n) values (left(p_key, 80), left(p_bucket, 40), w, 1)
  on conflict (key, bucket, window_start) do update set n = public.community_burst.n + 1 returning n into c;
  return c <= p_max;
end $$;

-- Scheduled by the server. Returns stale upload files to delete.
create or replace function app.community_prune() returns text[] language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  delete from public.community_burst where window_start < now() - interval '1 day';
  delete from public.community_retired_names where until < now();
  select coalesce(array_agg(storage_path), '{}') into paths from public.community_uploads where state <> 'attached' and created_at < now() - interval '1 day';
  delete from public.community_uploads where state <> 'attached' and created_at < now() - interval '1 day';
  return paths;
end $$;

-- ========== The one door the server uses ==========
-- The `app` schema is deliberately not exposed over the API. The Edge Function calls this single function instead; it only runs the named functions below,
-- with named arguments cast to their declared types. Not security definer: it runs as the caller (service_role), which alone may execute it.
create or replace function public.community_rpc(fn text, args jsonb default '{}'::jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare
  allowed text[] := array['community_feed', 'community_comments', 'community_profile', 'community_claim_username', 'community_change_username', 'community_issue_upload', 'community_upload_ticket',
    'community_verify_upload', 'community_reject_upload', 'community_create_post', 'community_delete_post', 'community_add_comment', 'community_delete_comment', 'community_set_encourage',
    'community_report', 'community_block', 'community_unblock', 'community_blocked', 'community_leave', 'community_moderation_queue', 'community_moderate', 'community_restrict',
    'community_backlog', 'community_burst', 'community_prune', 'community_user_media', 'community_status', 'community_set_mode'];
  f record; call_args text := ''; i int; k text; t text; result jsonb;
begin
  if fn is null or not (fn = any (allowed)) then raise exception 'not_found'; end if;
  if args is null or jsonb_typeof(args) <> 'object' then raise exception 'invalid_input'; end if;
  select p.oid, p.proname, p.proargnames, string_to_array(p.proargtypes::text, ' ')::oid[] as types, p.proretset, p.prorettype into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = fn;
  if not found then raise exception 'not_found'; end if;
  for i in 1 .. coalesce(array_length(f.types, 1), 0) loop
    k := f.proargnames[i];
    if args ? k then
      t := format_type(f.types[i], null);
      call_args := call_args || case when call_args = '' then '' else ', ' end || format('%I := %s', k,
        case when t = 'jsonb' then format('nullif(%L::jsonb -> %L, ''null''::jsonb)', args::text, k) else format('(%L::jsonb ->> %L)::%s', args::text, k, t) end);
    end if;
  end loop;
  if f.proretset then
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from app.%I(%s) x', fn, call_args) into result;
  elsif f.prorettype = 'void'::regtype then
    execute format('select app.%I(%s)', fn, call_args);
    result := null;
  else
    execute format('select to_jsonb(app.%I(%s))', fn, call_args) into result;
  end if;
  return result;
end $$;
revoke all on function public.community_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.community_rpc(text, jsonb) to service_role;

-- ========== Privileges: the server (service role) only ==========
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'community\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
