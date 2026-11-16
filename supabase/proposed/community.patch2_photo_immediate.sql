-- Community patch 2 (V1 decision): photos publish immediately, with no staff pre-approval. NOT APPLIED anywhere by this change; needs explicit migration approval.
-- Replaces only app.community_create_post (same signature and grants). Risky text is still held; unsafe text is still refused; video stays off (video_enabled=false).
-- Apply after community.up.sql (staging already has the earlier version). Safe to run twice.
begin;
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
commit;
