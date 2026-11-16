-- Community patch 2 (V1 final decisions). NOT APPLIED anywhere by this change; needs explicit migration approval.
-- Replaces exactly three functions, with unchanged signatures, return types and grants (create or replace keeps them):
--   app.community_screen       dangerous health claims, diet-drug promotion and harassment are rejected; ordinary weight, calorie and health-number talk, personal weight-loss stories and capitals are allowed; nothing is held
--   app.community_create_post  photos publish at once (no media hold)
--   app.community_feed         like counts are public (a number, never who)
-- No tables, columns, policies, settings, storage or data are touched. Depends on community.up.sql (any earlier version) only. Safe to run twice.
begin;
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
  -- V1 decision: ordinary weight, calorie and health-number talk is allowed and never held. Dangerous health instructions, diet-drug promotion and harassment are rejected, never held; personal weight-loss stories are allowed. Mirrors screenText in TypeScript.
  if t ~* '\y(kill yourself|kys|go die|hope you die|fat (pig|cow|slob)|ugly (cow|pig)|you(''| a)?re (so )?(fat|disgusting|ugly)|nobody likes you)\y' then f := f || array['harassment']; end if;
  if t ~* '\y(cure[sd]?|detox|miracle|guaranteed|burn(s|ed)? fat fast|fat[- ]burner|diet pills?|weight loss (drug|jab|injection)|ozempic|wegovy|semaglutide|mounjaro|tirzepatide|laxatives?|starv[a-z]*|fasting for [0-9]+)\y' then f := f || array['health_claim']; end if;
  if cardinality(f) > 0 then return jsonb_build_object('decision', 'block', 'flags', to_jsonb(f)); end if;
  return jsonb_build_object('decision', 'allow', 'flags', '[]'::jsonb);
end $$;

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
  if videos > 0 and not (select video_enabled from public.community_settings) then raise exception 'video_disabled'; end if;
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
  -- V1 decision: photos publish at once, without staff approval. Safety rests on text screening, rate limits, reporting, blocking and fast removal after publication (a report hides the post and puts it in the moderator queue).
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

create or replace function app.community_feed(p_viewer uuid, p_cursor_at timestamptz, p_cursor_id uuid, p_limit int)
returns table (id uuid, author text, type text, body text, milestone jsonb, media jsonb, created_at timestamptz, is_mine boolean, status text, comment_count int, encouraged_by_me boolean, encouraged_count int)
language sql stable security definer set search_path = '' as $$
  select p.id, m.username, p.type, p.body, p.milestone,
         coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'role', x.role, 'path', x.storage_path, 'durationS', x.duration_s) order by x.role) from public.community_media x where x.post_id = p.id), '[]'::jsonb),
         p.created_at, p.author_id = p_viewer, p.status,
         (select count(*)::int from public.community_comments c where c.post_id = p.id and ((c.status = 'published' and not app.community_blocked_between(p_viewer, c.author_id)) or (c.author_id = p_viewer and c.status <> 'removed'))),
         exists (select 1 from public.community_reactions r where r.post_id = p.id and r.user_id = p_viewer),
         (select count(*)::int from public.community_reactions r where r.post_id = p.id)
    from public.community_posts p join public.community_members m on m.user_id = p.author_id
   where app.community_visible_post(p, p_viewer)
     and (p_cursor_at is null or (p.created_at, p.id) < (p_cursor_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by p.created_at desc, p.id desc
   limit greatest(1, least(coalesce(p_limit, 20), 30))
$$;
commit;
