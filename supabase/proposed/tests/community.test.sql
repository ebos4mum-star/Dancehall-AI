-- Community (proposed). Runs after community.up.sql on a throwaway database. Security first: nobody but the server can touch anything.
\set cases `cat supabase/tests/community-cases.json`
select set_config('test.cases', :'cases', false) is not null as loaded \gset

create or replace function test.upload(p_user uuid, p_kind text, p_mime text, p_bytes bigint, p_dur numeric default null) returns text language plpgsql as $$
declare r jsonb;
begin
  r := app.community_issue_upload(p_user, p_kind, p_mime);
  perform app.community_verify_upload(p_user, r ->> 'path', p_bytes, p_dur);
  return r ->> 'path';
end $$;
grant usage on schema test to service_role;
grant execute on function test.upload(uuid, text, text, bigint, numeric) to service_role;

-- 0. The one door.
do $$ begin
  perform test.as_admin();
  perform test.assert(not has_function_privilege('anon', 'public.community_rpc(text, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.community_rpc(text, jsonb)', 'execute'), 'clients cannot use the community door');
  perform test.assert(has_function_privilege('service_role', 'public.community_rpc(text, jsonb)', 'execute'), 'the server can');
  perform test.assert(not (select prosecdef from pg_proc where oid = 'public.community_rpc(text, jsonb)'::regprocedure), 'the door runs as its caller, not as its owner');
end $$;

-- 1. Structure and privileges.
do $$
declare t text; f record;
begin
  perform test.as_admin();
  foreach t in array array['community_members', 'community_posts', 'community_media', 'community_comments', 'community_reactions', 'community_reports', 'community_blocks', 'community_retired_names', 'community_uploads', 'community_burst', 'community_report_resolutions', 'community_settings', 'community_orphaned_files'] loop
    perform test.assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS enabled');
    perform test.assert(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t), t || ' carries a policy');
    perform test.assert(not has_table_privilege('anon', 'public.' || t, 'select'), 'anon cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'select'), 'signed-in users cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'insert'), 'signed-in users cannot write ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'update'), 'signed-in users cannot update ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'delete'), 'signed-in users cannot delete ' || t);
  end loop;
  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'community\_%' loop
    perform test.assert(not has_function_privilege('anon', f.oid, 'execute'), 'anon cannot execute app.' || f.proname);
    perform test.assert(not has_function_privilege('authenticated', f.oid, 'execute'), 'signed-in users cannot execute app.' || f.proname);
    perform test.assert(has_function_privilege('service_role', f.oid, 'execute'), 'the server can execute app.' || f.proname);
    perform test.assert(not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where p.oid = f.oid and x.grantee = 0 and x.privilege_type = 'EXECUTE'),
                        'PUBLIC cannot execute app.' || f.proname);
    if f.prosecdef then perform test.assert(f.proconfig is not null and 'search_path=""' = any (f.proconfig), 'app.' || f.proname || ' pins an empty search_path'); end if;
  end loop;
  -- Nothing exposed in public: no community function lives there.
  perform test.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'community%' and p.proname <> 'community_rpc'), 'the only community function in the exposed schema is the service-role door');
end $$;

-- 2. Signed-in and anonymous clients really are refused.
do $$
declare a uuid;
begin
  perform test.as_admin();
  a := test.make_user('c-priv-a@example.test');
  perform test.as_user(a);
  perform test.throws($q$select * from public.community_posts$q$, 'permission denied');
  perform test.throws($q$insert into public.community_members (user_id, username) values (auth.uid(), 'sneaky_name')$q$, 'permission denied');
  perform test.throws($q$select app.community_feed(null, null, null, 10)$q$, 'permission denied');
  perform test.throws($q$select app.community_claim_username(auth.uid(), 'sneaky_name')$q$, 'permission denied');
  perform test.as_anon();
  perform test.throws($q$select * from public.community_comments$q$, 'permission denied');
  perform test.throws($q$select app.community_feed(null, null, null, 10)$q$, 'permission denied');
end $$;

-- 3. Rules agree with the TypeScript rules (shared cases).
do $$
declare doc jsonb := current_setting('test.cases')::jsonb; c jsonb; got jsonb; n int := 0;
begin
  perform test.as_admin();
  for c in select * from jsonb_array_elements(doc -> 'text') loop
    got := app.community_screen(c ->> 'text', (c ->> 'max')::int);
    if got ->> 'decision' <> c ->> 'decision' then raise exception 'screen "%": database said %, expected %', left(c ->> 'text', 40), got ->> 'decision', c ->> 'decision'; end if;
    if (select coalesce(jsonb_agg(f order by f), '[]') from jsonb_array_elements_text(got -> 'flags') f) <> (select coalesce(jsonb_agg(f order by f), '[]') from jsonb_array_elements_text(c -> 'flags') f) then
      raise exception 'screen "%": flags % vs %', left(c ->> 'text', 40), got -> 'flags', c -> 'flags';
    end if;
    n := n + 1;
  end loop;
  for c in select * from jsonb_array_elements(doc -> 'usernames') loop
    if (app.community_username_problem(c ->> 'name') is null) <> (c ->> 'ok')::boolean then raise exception 'username "%": database disagrees', c ->> 'name'; end if;
    n := n + 1;
  end loop;
  perform test.assert(n > 60, 'ran the shared cases');
end $$;

-- 3b. Video uploads are OFF by default and there is no way to switch them on through the API.
do $$
declare a uuid;
begin
  perform test.as_admin(); a := test.make_user('c-video@example.test'); perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'video_tester');
  perform test.assert((app.community_status() ->> 'videoEnabled')::boolean = false, 'video uploads are disabled by default and the status says so');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'video', 'video/mp4')$q$, a), 'video_disabled');
  perform test.throws(format($q$select app.community_create_post(%L, 'video', 'x', null, '[{"kind":"video","role":"single","path":"m/x.mp4"}]'::jsonb, true)$q$, a), 'video_disabled');
  perform test.assert(app.community_issue_upload(a, 'photo', 'image/jpeg') is not null, 'photos still work');
  perform test.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app', 'public') and p.proname like 'community%' and pg_get_functiondef(p.oid) ilike '%set video_enabled%'), 'no function can change the video setting');
end $$;

-- 4. Behaviour.
do $$
declare a uuid; b uuid; c uuid; d uuid; m uuid; r jsonb; pa uuid; pb uuid; pm uuid; n int; cols text[]; p1 text; p2 text; p3 text; paths text[];
begin
  perform test.as_admin();
  update public.community_settings set video_enabled = true; -- as an approved migration would, for the behaviour tests below
  a := test.make_user('c-a@example.test'); b := test.make_user('c-b@example.test'); c := test.make_user('c-c@example.test'); d := test.make_user('c-d@example.test'); m := test.make_user('c-mod@example.test');
  insert into public.staff_roles (user_id, role) values (m, 'moderator');
  perform set_config('role', 'service_role', false);

  -- usernames
  perform test.assert(app.community_claim_username(a, 'Ama_Dances') = 'ama_dances', 'a username is stored lowercase');
  perform test.throws(format($q$select app.community_claim_username(%L, 'AMA_DANCES')$q$, b), 'taken');
  perform test.throws(format($q$select app.community_claim_username(%L, 'again_name')$q$, a), 'already_set');
  perform test.throws(format($q$select app.community_claim_username(%L, 'admin')$q$, b), 'invalid_username');
  perform app.community_claim_username(b, 'kofi_moves'); perform app.community_claim_username(c, 'efua_fit');

  -- posting needs confirmation, a username, and respects the rules
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, false)$q$, a), 'not_confirmed');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, null)$q$, a), 'not_confirmed');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, true)$q$, d), 'needs_username');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'call me 0201234567', null, null, true)$q$, a), 'blocked');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', '', null, null, true)$q$, a), 'blocked');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'hi', '{"kind":"workout","title":"x"}'::jsonb, null, true)$q$, a), 'invalid_milestone');
  perform test.throws(format($q$select app.community_create_post(%L, 'milestone', 'hi', null, null, true)$q$, a), 'invalid_milestone');
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'hi', null, null, true)$q$, a), 'invalid_media');
  r := app.community_create_post(a, 'text', 'First class done!', null, null, true); pa := (r ->> 'id')::uuid;
  perform test.assert(r ->> 'status' = 'published', 'ordinary text publishes');
  r := app.community_create_post(b, 'text', 'Kitchen dancing counts.', null, null, true); pb := (r ->> 'id')::uuid;

  -- a milestone keeps only whitelisted keys; health data in the payload never reaches the table
  r := app.community_create_post(a, 'milestone', 'Finished a workout: Groove', '{"kind":"workout","title":"Groove","style":"reggae","minutes":20,"weightKg":71.2,"kcal":400,"email":"x@y.z"}'::jsonb, null, true);
  perform test.assert((select (milestone ?& array['kind','title','style','minutes']) and not (milestone ? 'weightKg') and not (milestone ? 'kcal') and not (milestone ? 'email') from public.community_posts where id = (r ->> 'id')::uuid), 'milestone whitelist is enforced');
  perform test.assert(r ->> 'status' = 'published', 'a milestone publishes');

  -- risky text is held, media is always held
  r := app.community_create_post(b, 'text', 'I lost 12 kg in 3 weeks', null, null, true);
  perform test.assert(r ->> 'status' = 'held', 'a weight-loss claim is held for review');
  -- uploads: only a file the server received and verified can be attached, once, and only by its owner
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, '[{"kind":"photo","role":"single","path":"u/forged.jpg"}]'::jsonb, true)$q$, b), 'invalid_media');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'photo', 'application/x-msdownload')$q$, b), 'invalid_media');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'video', 'image/jpeg')$q$, b), 'invalid_media');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'photo', 'image/jpeg')$q$, d), 'needs_username');
  p1 := test.upload(b, 'photo', 'image/jpeg', 1000); p2 := test.upload(b, 'photo', 'image/png', 2000);
  perform test.assert(p1 ~ '^m/[0-9a-f-]{36}\.jpg$' and p1 not like '%' || b::text || '%', 'the path is server-chosen and carries no account identifier');
  perform test.assert(app.community_upload_ticket(b, (app.community_issue_upload(b, 'photo', 'image/jpeg') ->> 'path')) = 'image/jpeg', 'the owner can look up their pending upload');
  perform test.throws(format($q$select app.community_upload_ticket(%L, %L)$q$, a, (select storage_path from public.community_uploads where user_id = b and state = 'issued' limit 1)), 'not_found'); -- somebody else's pending file
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, jsonb_build_array(jsonb_build_object('kind','photo','role','single','path',%L)), true)$q$, a, p1), 'invalid_media'); -- somebody else's file
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, jsonb_build_array(jsonb_build_object('kind','photo','role','before','path',%L)), true)$q$, b, p1), 'invalid_media'); -- one photo cannot be a before
  perform test.throws(format($q$select app.community_create_post(%L, 'video', 'x', null, jsonb_build_array(jsonb_build_object('kind','video','role','single','path',%L)), true)$q$, b, p1), 'invalid_media'); -- wrong kind
  r := app.community_create_post(b, 'photo', 'My journey', null, jsonb_build_array(jsonb_build_object('kind','photo','role','before','path',p1), jsonb_build_object('kind','photo','role','after','path',p2)), true);
  perform test.assert(r ->> 'status' = 'held', 'a photo post is held');
  perform test.assert((select count(*) = 2 and bool_and(bytes in (1000, 2000)) from public.community_media where storage_path in (p1, p2)), 'size and type come from the server record');
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, jsonb_build_array(jsonb_build_object('kind','photo','role','single','path',%L)), true)$q$, b, p1), 'invalid_media'); -- already used
  -- the server rejects oversize photos and long videos
  perform test.throws(format($q$select test.upload(%L, 'photo', 'image/jpeg', 9000000)$q$, b), 'too_large');
  perform test.throws(format($q$select test.upload(%L, 'video', 'video/mp4', 1000, 99)$q$, b), 'too_long');
  perform test.throws(format($q$select test.upload(%L, 'video', 'video/mp4', 1000, null)$q$, b), 'too_long');
  p3 := test.upload(b, 'video', 'video/mp4', 2000, 12);
  r := app.community_create_post(b, 'video', '', null, jsonb_build_array(jsonb_build_object('kind','video','role','single','path',p3)), true);
  perform test.assert(r ->> 'status' = 'held', 'a video post is held');

  -- the feed: guests see published only; the author sees held; nothing identifies a person except the username
  select count(*) into n from app.community_feed(null, null, null, 30);
  perform test.assert(n = 3, format('a guest sees the 3 published posts (got %s)', n));
  select count(*) into n from app.community_feed(b, null, null, 30);
  perform test.assert(n = 6, format('the author also sees their own held posts (got %s)', n));
  perform test.assert(not exists (select 1 from jsonb_each(to_jsonb((select f from app.community_feed(null, null, null, 1) f))) e where e.key ~* '(user|author_id|email)'), 'the feed row has no user id or email column');
  perform test.assert((select bool_and(author ~ '^[a-z][a-z0-9_]{2,19}$') from app.community_feed(null, null, null, 30)), 'authors are public usernames');
  perform test.assert(not exists (select 1 from app.community_feed(null, null, null, 30) f where f.encouraged_count is not null), 'readers never get a count');
  perform test.assert((select bool_and(created_at <= prev) from (select created_at, lag(created_at) over (order by rn) as prev0, coalesce(lag(created_at) over (order by rn), 'infinity'::timestamptz) as prev from (select f.*, row_number() over () rn from app.community_feed(null, null, null, 30) f) x) y), 'the feed is newest first');
  perform test.assert((select count(*) = 2 from app.community_feed(null, null, null, 2)) and (select count(*) = 1 from app.community_feed(null, (select created_at from app.community_feed(null, null, null, 2) offset 1), (select id from app.community_feed(null, null, null, 2) offset 1), 30)), 'the cursor pages without gaps');

  -- comments
  r := app.community_add_comment(b, pa, 'Well done!');
  perform test.assert(r ->> 'status' = 'published', 'a kind comment publishes');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'mail me a@b.com')$q$, b, pa), 'blocked');
  r := app.community_add_comment(c, pa, 'I lost 9 kg with this');
  perform test.assert(r ->> 'status' = 'hidden', 'a risky comment is hidden for review');
  perform test.assert((select count(*) = 1 from app.community_comments(null, pa)), 'a guest sees only the published comment');
  perform test.assert((select count(*) = 2 from app.community_comments(c, pa)), 'the commenter also sees their own hidden one');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hi')$q$, d, pa), 'needs_username');
  perform test.throws(format($q$select app.community_delete_comment(%L, (select id from public.community_comments where author_id = %L limit 1))$q$, c, b), 'not_found');
  perform app.community_delete_comment(a, (select id from public.community_comments where author_id = b limit 1)); -- the post's author may delete it
  perform test.assert((select count(*) = 0 from public.community_comments where author_id = b), 'the post author deleted the comment');

  -- one Encourage: idempotent, not on your own post, a count only for the author
  perform test.assert(app.community_set_encourage(b, pa, true), 'encourage on');
  perform test.assert(app.community_set_encourage(b, pa, true), 'encourage is idempotent');
  perform test.assert((select count(*) = 1 from public.community_reactions where post_id = pa), 'one reaction row');
  perform test.throws(format($q$select app.community_set_encourage(%L, %L, true)$q$, a, pa), 'own_post');
  perform test.assert(app.community_set_encourage(d, pa, true), 'a member without a username may encourage');
  perform test.assert((select encouraged_count = 2 from app.community_feed(a, null, null, 30) where id = pa), 'the author sees how many');
  perform test.assert((select encouraged_count is null from app.community_feed(b, null, null, 30) where id = pa), 'others do not');
  perform test.assert((select encouraged_by_me from app.community_feed(b, null, null, 30) where id = pa), 'a reader knows they encouraged');

  -- blocking: mutual and silent
  perform app.community_block(a, 'kofi_moves');
  perform test.assert(not exists (select 1 from app.community_feed(a, null, null, 30) f where f.author = 'kofi_moves'), 'the blocker no longer sees the blocked member');
  perform test.assert(not exists (select 1 from app.community_feed(b, null, null, 30) f where f.author = 'ama_dances'), 'the blocked member no longer sees the blocker');
  perform test.assert(exists (select 1 from app.community_feed(c, null, null, 30) f where f.author = 'ama_dances') and exists (select 1 from app.community_feed(c, null, null, 30) f where f.author = 'kofi_moves'), 'everyone else is unaffected');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hello')$q$, b, pa), 'not_found');
  perform test.throws(format($q$select app.community_block(%L, 'ama_dances')$q$, a), 'self');
  perform test.throws(format($q$select app.community_block(%L, 'nobody_here')$q$, a), 'not_found');
  perform test.assert((select array_agg(x) = array['kofi_moves'] from app.community_blocked(a) x), 'the blocker can list who they blocked');
  perform test.assert((select count(*) = 0 from app.community_blocked(b)), 'the blocked member cannot see that they were blocked');
  perform app.community_unblock(a, 'kofi_moves');
  perform test.assert(exists (select 1 from app.community_feed(b, null, null, 30) f where f.author = 'ama_dances'), 'unblocking restores visibility');

  -- reporting: three different people, or one serious report, hide content; the reporter is never exposed
  perform test.throws(format($q$select app.community_report(%L, 'post', %L, 'spam', null)$q$, a, pa), 'own_content');
  perform app.community_report(b, 'post', pa, 'spam', null); perform app.community_report(b, 'post', pa, 'spam', null);
  perform test.assert((select status = 'published' from public.community_posts where id = pa), 'one person reporting twice does not hide a post');
  perform app.community_report(c, 'post', pa, 'harassment', null);
  perform app.community_report(d, 'post', pa, 'other', null);
  perform test.assert((select status = 'hidden' from public.community_posts where id = pa), 'three different reporters hide it');
  perform test.assert(not exists (select 1 from app.community_feed(null, null, null, 30) f where f.id = pa), 'a hidden post leaves the public feed');
  perform test.assert(exists (select 1 from app.community_feed(a, null, null, 30) f where f.id = pa and f.status = 'hidden'), 'its author still sees it, labelled');
  perform app.community_report(c, 'post', pb, 'self_harm', null);
  perform test.assert((select status = 'hidden' and flags @> array['self_harm'] from public.community_posts where id = pb), 'a self-harm report hides at once and flags it');

  -- moderation: only a moderator with a second factor
  perform test.throws(format($q$select * from app.community_moderation_queue(%L, true)$q$, a), 'forbidden');
  perform test.throws(format($q$select * from app.community_moderation_queue(%L, false)$q$, m), 'forbidden');
  perform test.throws(format($q$select app.community_moderate(%L, true, 'post', %L, 'approve')$q$, a, pa), 'forbidden');
  perform test.throws(format($q$select app.community_restrict(%L, false, 'ama_dances', 'muted', 24, 'spam')$q$, m), 'forbidden');
  perform test.throws(format($q$select app.community_backlog(%L, true)$q$, a), 'forbidden');
  select count(*) into n from app.community_moderation_queue(m, true);
  perform test.assert(n >= 4, format('the queue lists held and hidden items (got %s)', n));
  perform test.assert((select (q.flags && array['self_harm']) from app.community_moderation_queue(m, true) q limit 1), 'urgent items come first');
  perform test.assert(not exists (select 1 from jsonb_each(to_jsonb((select q from app.community_moderation_queue(m, true) q limit 1))) e where e.key ~* '(user|author_id|email|account)'), 'the queue shows no user id or email');
  -- backlog and urgency
  perform test.assert((select (app.community_backlog(m, true) ->> 'urgent')::int >= 1 and (app.community_backlog(m, true) ->> 'open')::int >= 4), 'the backlog counts open and urgent items');
  perform test.assert(not (app.community_backlog(m, true)::text ~* '(body|email|user_id)'), 'the backlog carries counts only');
  perform test.assert((select urgent and report_count >= 1 and 'self_harm' = any (reasons) from app.community_moderation_queue(m, true) q where q.id = pb), 'a self-harm report is urgent and shows its reason');
  perform test.assert((select jsonb_array_length(media) > 0 from app.community_moderation_queue(m, true) q where q.id = (select id from public.community_posts where type = 'photo' limit 1)), 'the moderator sees the media paths to review');
  perform app.community_moderate(m, true, 'post', pa, 'approve', 'Looks fine');
  perform test.assert((select status = 'published' from public.community_posts where id = pa) and not exists (select 1 from public.community_reports where target_id = pa and resolved_at is null), 'approve republishes and resolves the reports');
  perform test.assert(exists (select 1 from public.community_reports where target_id = pa), 'resolved reports are kept for the record');
  perform test.assert(exists (select 1 from public.audit_log where actor = m and action = 'community.approve' and row_id = pa::text), 'the action is in the audit log');
  perform test.assert(not exists (select 1 from public.audit_log where action like 'community.%' and (detail::text ~* 'Looks fine|First class')), 'the audit log holds no content or notes');
  perform test.assert((select count(*) from public.audit_log) = (select count(*) from public.audit_log where hash = app.audit_stamp(prev_hash, actor, action, table_name, row_id, detail, at)), 'the audit chain stays valid');
  paths := app.community_moderate(m, true, 'post', (select id from public.community_posts where type = 'photo' limit 1), 'remove');
  perform test.assert(paths @> array[p1, p2], 'removal returns the files to delete');
  perform test.assert(not exists (select 1 from public.community_media where storage_path = p1) and not exists (select 1 from public.community_uploads where storage_path = p1), 'removal drops the media records');
  perform app.community_moderate(m, true, 'post', pb, 'remove');
  perform test.assert(not exists (select 1 from app.community_feed(b, null, null, 30) f where f.id = pb), 'removed is gone even for its author');
  perform test.throws(format($q$select app.community_moderate(%L, true, 'post', %L, 'banish')$q$, m, pa), 'invalid_action');
  -- restrictions: muted stops posting but not reacting; suspended stops everything; both can end on a timer or be lifted
  perform app.community_restrict(m, true, 'efua_fit', 'muted', 24, 'spam', 'noted');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'again', null, null, true)$q$, c), 'muted');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'photo', 'image/jpeg')$q$, c), 'muted');
  perform test.assert(app.community_profile(c) ->> 'restriction' = 'muted', 'the member can see they are muted');
  perform app.community_restrict(m, true, 'efua_fit', 'none', null, null);
  perform test.assert(app.community_create_post(c, 'text', 'back again', null, null, true) ->> 'status' = 'published', 'lifting a restriction restores posting');
  perform app.community_restrict(m, true, 'efua_fit', 'suspended', 1, 'harassment');
  update public.community_members set restricted_until = now() - interval '1 minute' where username = 'efua_fit';
  perform test.assert(app.community_profile(c) ->> 'restriction' is null, 'a restriction ends by itself');
  perform app.community_restrict(m, true, 'efua_fit', 'suspended', null, 'harassment');
  perform test.throws(format($q$select app.community_restrict(%L, true, 'efua_fit', 'banished', null, 'spam')$q$, m), 'invalid_action');
  perform test.throws(format($q$select app.community_restrict(%L, true, 'efua_fit', 'muted', 0, 'spam')$q$, m), 'invalid_action');
  perform test.assert(exists (select 1 from public.audit_log where action = 'community.restrict' and row_id = 'efua_fit'), 'restrictions are audited');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'again', null, null, true)$q$, c), 'suspended');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hi')$q$, c, pa), 'suspended');
  perform test.throws(format($q$select app.community_set_encourage(%L, %L, true)$q$, c, pb), 'suspended|not_found');

  -- deleting your own post removes its comments, reactions and media
  paths := app.community_delete_post(b, (select id from public.community_posts where author_id = b and type = 'video' limit 1));
  perform test.assert(paths = array[p3], 'deleting returns the video file to delete');
  perform test.assert(not exists (select 1 from public.community_media where storage_path = p3), 'media rows go with the post');
  perform test.throws(format($q$select app.community_delete_post(%L, %L)$q$, b, pa), 'not_found');
end $$;

-- 5. Rate limits.
do $$
declare a uuid; i int; r jsonb;
begin
  perform test.as_admin();
  a := test.make_user('c-rate@example.test');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'rate_tester');
  for i in 1..5 loop perform app.community_create_post(a, 'text', 'post ' || i, null, null, true); end loop;
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'one more', null, null, true)$q$, a), 'rate_limited');
end $$;

-- 6. Deleting an account removes everything the person made or did.
do $$
declare a uuid; b uuid; p uuid; q uuid; n int;
begin
  perform test.as_admin();
  a := test.make_user('c-del-a@example.test'); b := test.make_user('c-del-b@example.test');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'leaving_soon'); perform app.community_claim_username(b, 'staying_on');
  p := (app.community_create_post(a, 'text', 'bye', null, null, true) ->> 'id')::uuid;
  q := (app.community_create_post(b, 'text', 'hi', null, null, true) ->> 'id')::uuid;
  perform app.community_add_comment(a, q, 'nice'); perform app.community_add_comment(b, p, 'ok'); perform app.community_set_encourage(a, q, true); perform app.community_block(a, 'staying_on');
  perform set_config('role', 'none', false);
  delete from auth.users where id = a;
  perform test.assert(not exists (select 1 from public.community_members where user_id = a), 'the member is gone');
  perform test.assert(not exists (select 1 from public.community_posts where author_id = a) and not exists (select 1 from public.community_comments where author_id = a), 'their posts and comments are gone');
  perform test.assert(not exists (select 1 from public.community_comments where post_id = p), 'comments on their posts are gone');
  perform test.assert(not exists (select 1 from public.community_reactions where user_id = a) and not exists (select 1 from public.community_blocks where blocker_id = a), 'their reactions and blocks are gone');
  perform test.assert(exists (select 1 from public.community_posts where id = q), 'other people’s content is untouched');
end $$;

-- 7. Username changes.
do $$
declare a uuid; b uuid; c uuid; r text;
begin
  perform test.as_admin();
  a := test.make_user('c-un-a@example.test'); b := test.make_user('c-un-b@example.test'); c := test.make_user('c-un-c@example.test');
  perform set_config('role', 'service_role', false);
  perform test.throws(format($q$select app.community_change_username(%L, 'new_name')$q$, a), 'needs_username');
  perform app.community_claim_username(a, 'nia_dances'); perform app.community_claim_username(b, 'yaw_moves');
  perform test.throws(format($q$select app.community_claim_username(%L, 'yaw_m0ves')$q$, c), 'too_similar');
  perform test.throws(format($q$select app.community_claim_username(%L, 'adm1n')$q$, c), 'invalid_username');
  perform test.throws(format($q$select app.community_claim_username(%L, 'dancehal1_fit')$q$, c), 'invalid_username');
  perform test.throws(format($q$select app.community_change_username(%L, 'yaw_moves')$q$, a), 'taken');
  perform test.throws(format($q$select app.community_change_username(%L, 'yawmoves')$q$, a), 'too_similar');
  perform test.throws(format($q$select app.community_change_username(%L, 'nia_dances')$q$, a), 'unchanged');
  perform test.throws(format($q$select app.community_change_username(%L, 'support')$q$, a), 'invalid_username');
  perform app.community_create_post(a, 'text', 'before the change', null, null, true);
  r := app.community_change_username(a, 'Nia_Moves');
  perform test.assert(r = 'nia_moves', 'the first change is free, stored lowercase');
  perform test.assert((select count(*) = 1 and bool_and(author = 'nia_moves') from app.community_feed(null, null, null, 30) f where f.body = 'before the change'), 'earlier posts show the new name');
  perform test.assert(app.community_profile(a) ->> 'canChangeAt' is not null, 'the profile says when the next change is allowed');
  perform test.throws(format($q$select app.community_change_username(%L, 'nia_again')$q$, a), 'cooldown');
  perform test.throws(format($q$select app.community_claim_username(%L, 'nia_dances')$q$, c), 'taken'); -- released names are held
  perform test.throws(format($q$select app.community_change_username(%L, 'nia_dances')$q$, b), 'taken');
  update public.community_members set changed_at = now() - interval '31 days' where user_id = a;
  perform test.assert(app.community_change_username(a, 'nia_again') = 'nia_again', 'allowed again after the cooldown');
  update public.community_members set changed_at = now() - interval '31 days' where user_id = a;
  perform test.assert(app.community_change_username(a, 'nia_dances') is not null, 'the owner may take their own held name back');
  update public.community_retired_names set until = now() - interval '1 day';
  perform app.community_prune();
  perform test.assert(not exists (select 1 from public.community_retired_names where until < now()), 'expired holds are pruned');
end $$;

-- 8. Burst limits and housekeeping.
do $$
declare i int; ok boolean;
begin
  perform test.as_admin(); perform set_config('role', 'service_role', false);
  for i in 1..3 loop ok := app.community_burst('ip-hash-1', 'feed', 3, 60); perform test.assert(ok, 'within the burst limit'); end loop;
  perform test.assert(not app.community_burst('ip-hash-1', 'feed', 3, 60), 'the next request in the window is refused');
  perform test.assert(app.community_burst('ip-hash-2', 'feed', 3, 60), 'another caller is unaffected');
  perform test.assert(app.community_burst('ip-hash-1', 'post', 3, 60), 'another bucket is unaffected');
  perform test.assert(cardinality(app.community_prune()) >= 0, 'prune runs');
end $$;

-- 9. Stale and rejected uploads are pruned; account deletion lists a member's files first.
do $$
declare a uuid; pth text; stale text; mine text[];
begin
  perform test.as_admin(); a := test.make_user('c-up@example.test'); perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'upload_tester');
  pth := (app.community_issue_upload(a, 'photo', 'image/jpeg') ->> 'path');
  perform test.assert(not exists (select 1 from app.community_user_media(a) m where m is null), 'a member files can be listed');
  update public.community_uploads set created_at = now() - interval '2 days' where storage_path = pth;
  perform test.assert(pth = any (app.community_prune()), 'stale unverified uploads are returned for deletion');
  perform test.assert(not exists (select 1 from public.community_uploads where storage_path = pth), 'and removed');
  pth := (app.community_issue_upload(a, 'photo', 'image/jpeg') ->> 'path'); perform app.community_reject_upload(a, pth);
  perform test.throws(format($q$select app.community_verify_upload(%L, %L, 10, null)$q$, a, pth), 'not_found');
end $$;

-- 10. Leaving Community keeps the account and removes everything public.
do $$
declare a uuid; b uuid; p text; q uuid; paths text[];
begin
  perform test.as_admin(); a := test.make_user('c-leave-a@example.test'); b := test.make_user('c-leave-b@example.test'); perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'leaver_one'); perform app.community_claim_username(b, 'remainer_one');
  p := test.upload(a, 'photo', 'image/jpeg', 500);
  perform app.community_create_post(a, 'photo', 'mine', null, jsonb_build_array(jsonb_build_object('kind','photo','role','single','path',p)), true);
  q := (app.community_create_post(b, 'text', 'theirs', null, null, true) ->> 'id')::uuid;
  perform app.community_add_comment(a, q, 'hello'); perform app.community_set_encourage(a, q, true); perform app.community_block(a, 'remainer_one');
  paths := app.community_leave(a);
  perform test.assert(paths = array[p], 'the files are returned for deletion');
  perform test.assert(not exists (select 1 from public.community_members where user_id = a) and not exists (select 1 from public.community_posts where author_id = a)
    and not exists (select 1 from public.community_comments where author_id = a) and not exists (select 1 from public.community_reactions where user_id = a)
    and not exists (select 1 from public.community_blocks where blocker_id = a) and not exists (select 1 from public.community_media where storage_path = p), 'everything public is gone');
  perform set_config('role', 'none', false);
  perform test.assert(exists (select 1 from auth.users where id = a), 'the account itself stays');
  perform set_config('role', 'service_role', false);
  perform test.assert(exists (select 1 from public.community_posts where id = q), 'other members are untouched');
  perform test.assert(app.community_claim_username(a, 'leaver_two') = 'leaver_two', 'they can come back with a new name');
end $$;

-- 11. The door: allow-list, typed arguments, shapes.
do $$
declare a uuid; r jsonb; b uuid;
begin
  perform test.as_admin(); a := test.make_user('c-door-a@example.test'); b := test.make_user('c-door-b@example.test'); perform set_config('role', 'service_role', false);
  perform test.throws($q$select public.community_rpc('community_audit', '{}'::jsonb)$q$, 'not_found');
  perform test.throws($q$select public.community_rpc('community_screen', '{"p_text":"x","p_max":5}'::jsonb)$q$, 'not_found');
  perform test.throws($q$select public.community_rpc('pg_sleep', '{}'::jsonb)$q$, 'not_found');
  perform test.throws($q$select public.community_rpc('community_feed; drop table x', '{}'::jsonb)$q$, 'not_found');
  perform test.throws($q$select public.community_rpc('community_feed', '[]'::jsonb)$q$, 'invalid_input');
  perform test.assert(public.community_rpc('community_claim_username', jsonb_build_object('p_user', a, 'p_name', 'door_tester')) = '"door_tester"'::jsonb, 'a scalar comes back as JSON');
  r := public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'via the door', 'p_milestone', null, 'p_media', null, 'p_confirmed', true));
  perform test.assert(r ->> 'status' = 'published', 'jsonb results pass through');
  r := public.community_rpc('community_feed', jsonb_build_object('p_viewer', null, 'p_cursor_at', null, 'p_cursor_id', null, 'p_limit', 5));
  perform test.assert(jsonb_typeof(r) = 'array' and r -> 0 ->> 'author' is not null, 'table results come back as an array of rows');
  perform test.assert(public.community_rpc('community_burst', '{"p_key":"k","p_bucket":"b","p_max":1,"p_seconds":60}'::jsonb) = 'true'::jsonb, 'booleans work');
  perform test.assert(public.community_rpc('community_burst', '{"p_key":"k","p_bucket":"b","p_max":1,"p_seconds":60}'::jsonb) = 'false'::jsonb, 'and refuse over the limit');
  perform test.throws(format($q$select public.community_rpc('community_block', jsonb_build_object('p_user', %L::uuid, 'p_username', 'nobody_here_x'))$q$, a), 'not_found');
end $$;

-- 12. Modes and the automatic photo/video pause.
do $$
declare a uuid; m uuid; i int; rid uuid;
begin
  perform test.as_admin(); a := test.make_user('c-mode-a@example.test'); m := test.make_user('c-mode-m@example.test');
  insert into public.staff_roles (user_id, role) values (m, 'moderator');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'mode_tester');
  perform test.assert(app.community_status() ->> 'mode' = 'open', 'Community starts open');
  perform test.throws(format($q$select app.community_set_mode(%L, true, 'text_only')$q$, a), 'forbidden');
  perform test.throws(format($q$select app.community_set_mode(%L, false, 'text_only')$q$, m), 'forbidden');
  perform test.throws(format($q$select app.community_set_mode(%L, true, 'frozen')$q$, m), 'invalid_action');
  -- text only: media paused, text and comments continue
  perform app.community_set_mode(m, true, 'text_only', 'busy week');
  perform test.assert(app.community_status() ->> 'mode' = 'text_only', 'the mode is visible to everyone');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'photo', 'image/jpeg')$q$, a), 'media_paused');
  perform test.assert(app.community_create_post(a, 'text', 'text still works', null, null, true) ->> 'status' = 'published', 'text posting continues');
  -- read only: nothing new, but deleting and reporting still work
  perform app.community_set_mode(m, true, 'read_only');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'nope', null, null, true)$q$, a), 'paused');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'nope')$q$, a, (select id from public.community_posts limit 1)), 'paused');
  perform app.community_delete_post(a, (select id from public.community_posts where author_id = a limit 1));
  perform test.assert(exists (select 1 from public.audit_log where action = 'community.mode' and row_id = 'read_only' and actor = m), 'mode changes are audited');
  perform app.community_set_mode(m, true, 'open');
  perform test.assert(app.community_status() ->> 'mode' = 'open', 'and can be reopened');
  -- automatic pause: 20 held photo posts waiting
  delete from public.community_posts where status = 'held';
  perform test.assert(app.community_status() ->> 'mode' = 'open', 'with an empty queue Community is open');
  for i in 1..20 loop
    insert into public.community_posts (author_id, type, body, status) values (a, 'photo', 'x', 'held') returning id into rid;
  end loop;
  insert into public.community_media (post_id, kind, role, storage_path, mime, bytes) select id, 'photo', 'single', 'm/auto-' || id::text || '.jpg', 'image/jpeg', 10 from public.community_posts where status = 'held';
  perform test.assert(app.community_status() ->> 'mode' = 'text_only', 'photo and video posting pauses by itself when review cannot keep up');
  perform test.assert(app.community_backlog(m, true) ->> 'mode' = 'open' and app.community_backlog(m, true) ->> 'effectiveMode' = 'text_only', 'the moderator sees both the setting and the effect');
  perform test.throws(format($q$select app.community_issue_upload(%L, 'photo', 'image/jpeg')$q$, a), 'media_paused');
  delete from public.community_posts where status = 'held';
  perform test.assert(app.community_status() ->> 'mode' = 'open', 'it reopens when the queue clears');
  -- one very old held media post also pauses
  insert into public.community_posts (author_id, type, body, status, created_at) values (a, 'photo', 'old', 'held', now() - interval '73 hours') returning id into rid;
  insert into public.community_media (post_id, kind, role, storage_path, mime, bytes) select id, 'photo', 'single', 'm/old.jpg', 'image/jpeg', 10 from public.community_posts where body = 'old';
  perform test.assert(app.community_status() ->> 'mode' = 'text_only', 'a photo post waiting more than 72 hours pauses media');
end $$;

-- 13. A child-safety report hides at once and is urgent.
do $$
declare a uuid; b uuid; m uuid; pid uuid;
begin
  perform test.as_admin(); a := test.make_user('c-cs-a@example.test'); b := test.make_user('c-cs-b@example.test'); m := test.make_user('c-cs-m@example.test');
  insert into public.staff_roles (user_id, role) values (m, 'moderator');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'cs_author'); perform app.community_claim_username(b, 'cs_reporter');
  pid := (app.community_create_post(a, 'text', 'dance class today', null, null, true) ->> 'id')::uuid;
  perform app.community_report(b, 'post', pid, 'child_safety', null);
  perform test.assert((select status = 'hidden' and flags @> array['child_safety'] from public.community_posts where id = pid), 'one child-safety report hides the post and flags it');
  perform test.assert((select urgent from app.community_moderation_queue(m, true) q where q.id = pid), 'and it is urgent in the queue');
end $$;

-- 14. Urgent reports are signalled to the server; the alert summary holds counts only; two moderators work independently.
do $$
declare a uuid; b uuid; m1 uuid; m2 uuid; pid uuid; r jsonb; sm jsonb;
begin
  perform test.as_admin(); a := test.make_user('c-al-a@example.test'); b := test.make_user('c-al-b@example.test'); m1 := test.make_user('c-al-m1@example.test'); m2 := test.make_user('c-al-m2@example.test');
  insert into public.staff_roles (user_id, role) values (m1, 'moderator'), (m2, 'moderator');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'alert_author'); perform app.community_claim_username(b, 'alert_reporter');
  pid := (app.community_create_post(a, 'text', 'a normal post', null, null, true) ->> 'id')::uuid;
  r := app.community_report(b, 'post', pid, 'spam', null);
  perform test.assert((r ->> 'urgent')::boolean = false, 'an ordinary report is not urgent');
  perform test.assert((app.community_report(b, 'post', pid, 'spam', null) ->> 'urgent')::boolean = false, 'a repeat report is quiet');
  pid := (app.community_create_post(a, 'text', 'another normal post', null, null, true) ->> 'id')::uuid;
  perform test.assert((app.community_report(b, 'post', pid, 'self_harm', null) ->> 'urgent')::boolean, 'a self-harm report is signalled as urgent');
  sm := app.community_alert_summary();
  perform test.assert((sm ->> 'urgent')::int >= 1 and sm ? 'urgentOverTarget' and sm ? 'effectiveMode', 'the summary counts urgent items');
  perform test.assert(sm::text !~* '(alert_author|another normal|user_id|email|@)', 'the summary carries no names or content');
  update public.community_posts set created_at = now() - interval '5 hours' where id = pid;
  perform test.assert((app.community_alert_summary() ->> 'urgentOverTarget')::int >= 1, 'urgent items past four hours are counted as overdue');
  -- primary and backup moderators both act, and the audit log tells them apart
  perform app.community_moderate(m1, true, 'post', pid, 'remove', 'primary');
  perform app.community_moderate(m2, true, 'post', (select id from public.community_posts where status = 'published' and author_id = a limit 1), 'approve', 'backup');
  perform test.assert(exists (select 1 from public.audit_log where actor = m1 and action = 'community.remove') and exists (select 1 from public.audit_log where actor = m2 and action = 'community.approve'), 'each moderator is recorded by name');
  perform test.throws(format($q$select app.community_moderate(%L, false, 'post', %L, 'approve')$q$, m2, pid), 'forbidden');
end $$;

-- 15. Files left behind by any kind of deletion (including a deleted account) are swept.
do $$
declare a uuid; p text; paths text[];
begin
  perform test.as_admin(); delete from public.community_posts where status = 'held'; update public.community_settings set video_enabled = true; a := test.make_user('c-orph@example.test'); perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'orphan_tester');
  p := test.upload(a, 'photo', 'image/jpeg', 100);
  perform app.community_create_post(a, 'photo', 'x', null, jsonb_build_array(jsonb_build_object('kind','photo','role','single','path',p)), true);
  perform set_config('role', 'none', false);
  delete from auth.users where id = a; -- as the account-deletion job would
  perform set_config('role', 'service_role', false);
  perform test.assert(not exists (select 1 from public.community_uploads where storage_path = p), 'the record is gone with the account');
  paths := app.community_prune();
  perform test.assert(p = any (paths), 'maintenance returns the file so the server can delete it from storage');
  perform test.assert(not (p = any (app.community_prune())), 'and it is not returned twice');
  perform set_config('role', 'none', false);
  update public.community_settings set video_enabled = false;
end $$;
