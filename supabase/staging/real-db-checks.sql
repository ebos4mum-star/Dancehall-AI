-- Functional security checks for the STAGING project, run on real Supabase through the SQL runner.
-- Everything runs inside ONE transaction and ends by raising an exception, so NOTHING persists (no users, content, audit rows or files are left behind).
-- The result is carried in the exception message: "RESULT pass=N fail=M | ...".
do $t$
declare
  pass int := 0; fail int := 0; notes text := ''; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m uuid := gen_random_uuid(); p uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  r jsonb; pid uuid; up jsonb; n int; ok boolean; paths text[]; msg text;
begin
  create temp table _res (name text, ok boolean, detail text) on commit drop;
  execute 'grant all on _res to public';
  -- helper: record a result
  -- (inline functions are not available in DO, so a small local pattern is repeated)
  insert into auth.users (id, email) values (a, 'a@staging-check.invalid'), (b, 'b@staging-check.invalid'), (m, 'mod@staging-check.invalid'), (p, 'plain@staging-check.invalid'), (d, 'del@staging-check.invalid');
  insert into public.staff_roles (user_id, role) values (m, 'moderator');

  -- T1/T2 clients cannot reach the door or the tables
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.community_rpc('community_feed', '{"p_viewer":null,"p_cursor_at":null,"p_cursor_id":null,"p_limit":5}'::jsonb); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T1 signed-in member cannot call the community door', ok, '');
  begin perform count(*) from public.community_posts; ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T2 signed-in member cannot read community tables', ok, '');
  perform set_config('role', 'anon', true);
  begin perform public.community_rpc('community_feed', '{"p_viewer":null,"p_cursor_at":null,"p_cursor_id":null,"p_limit":5}'::jsonb); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T2b anonymous cannot call the community door', ok, '');
  begin perform app.community_status(); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T2c anonymous cannot call app functions directly', ok, '');
  begin perform public.purge_due_account_deletions(); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T2d anonymous cannot run the account-deletion executor', ok, '');

  -- T3.. the server (service_role) path
  perform set_config('role', 'service_role', true);
  perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', a, 'p_name', 'Ama_Dances'));
  perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', b, 'p_name', 'kofi_moves'));
  begin perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', p, 'p_name', 'adm1n')); ok := false; exception when others then ok := sqlerrm = 'invalid_username'; end;
  insert into _res values ('T3a staff look-alike usernames are refused', ok, '');
  begin perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', p, 'p_name', 'k0fi_m0ves')); ok := false; exception when others then ok := sqlerrm = 'too_similar'; end;
  insert into _res values ('T3b look-alike of another member is refused', ok, '');
  perform public.community_rpc('community_change_username', jsonb_build_object('p_user', a, 'p_name', 'ama_moves'));
  begin perform public.community_rpc('community_change_username', jsonb_build_object('p_user', a, 'p_name', 'ama_again')); ok := false; exception when others then ok := sqlerrm = 'cooldown'; end;
  insert into _res values ('T3c first username change free, second blocked by the cooldown', ok, '');
  begin perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', p, 'p_name', 'ama_dances')); ok := false; exception when others then ok := sqlerrm = 'taken'; end;
  insert into _res values ('T3d a released username is held', ok, '');

  -- T4 posting and screening
  r := public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'First class done!', 'p_milestone', null, 'p_media', null, 'p_confirmed', true));
  insert into _res values ('T4a ordinary text publishes', r ->> 'status' = 'published', coalesce(r ->> 'status', ''));
  r := public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'I lost 12 kg in 3 weeks', 'p_milestone', null, 'p_media', null, 'p_confirmed', true));
  insert into _res values ('T4b a weight claim is held', r ->> 'status' = 'held', coalesce(r ->> 'status', ''));
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'call me 0201234567', 'p_milestone', null, 'p_media', null, 'p_confirmed', true)); ok := false; exception when others then ok := sqlerrm = 'blocked'; end;
  insert into _res values ('T4c a phone number is refused', ok, '');
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'hello', 'p_milestone', null, 'p_media', null, 'p_confirmed', false)); ok := false; exception when others then ok := sqlerrm = 'not_confirmed'; end;
  insert into _res values ('T4d posting needs explicit confirmation', ok, '');

  -- T5 comments and T6 video are disabled
  begin perform public.community_rpc('community_add_comment', jsonb_build_object('p_user', b, 'p_post', gen_random_uuid(), 'p_body', 'nice')); ok := false; exception when others then ok := sqlerrm = 'comments_disabled'; end;
  insert into _res values ('T5 comments are refused by the database', ok, '');
  insert into _res values ('T5b no comment can be read', (select count(*) = 0 from public.community_comments), '');
  begin perform public.community_rpc('community_issue_upload', jsonb_build_object('p_user', a, 'p_kind', 'video', 'p_mime', 'video/mp4')); ok := false; exception when others then ok := sqlerrm = 'video_disabled'; end;
  insert into _res values ('T6 video uploads are refused by the database', ok, '');

  -- T7 photos are held and private; only a verified upload can be attached
  up := public.community_rpc('community_issue_upload', jsonb_build_object('p_user', a, 'p_kind', 'photo', 'p_mime', 'image/jpeg'));
  insert into _res values ('T7a the storage path carries no account id', (up ->> 'path') ~ '^m/[0-9a-f-]{36}\.jpg$' and position(a::text in (up ->> 'path')) = 0, '');
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'photo', 'p_body', '', 'p_milestone', null, 'p_media', jsonb_build_array(jsonb_build_object('kind','photo','role','single','path', up ->> 'path')), 'p_confirmed', true)); ok := false; exception when others then ok := sqlerrm = 'invalid_media'; end;
  insert into _res values ('T7b an unverified upload cannot be attached', ok, '');
  perform public.community_rpc('community_verify_upload', jsonb_build_object('p_user', a, 'p_path', up ->> 'path', 'p_bytes', 1000, 'p_duration', null));
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', b, 'p_type', 'photo', 'p_body', '', 'p_milestone', null, 'p_media', jsonb_build_array(jsonb_build_object('kind','photo','role','single','path', up ->> 'path')), 'p_confirmed', true)); ok := false; exception when others then ok := sqlerrm = 'invalid_media'; end;
  insert into _res values ('T7c somebody else cannot attach my verified upload', ok, '');
  r := public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'photo', 'p_body', 'My journey', 'p_milestone', null, 'p_media', jsonb_build_array(jsonb_build_object('kind','photo','role','single','path', up ->> 'path')), 'p_confirmed', true));
  pid := (r ->> 'id')::uuid;
  insert into _res values ('T7d a photo post is HELD before publication', r ->> 'status' = 'held', coalesce(r ->> 'status', ''));
  insert into _res values ('T7e a guest does not see the held photo post', not exists (select 1 from jsonb_array_elements(public.community_rpc('community_feed', '{"p_viewer":null,"p_cursor_at":null,"p_cursor_id":null,"p_limit":30}'::jsonb)) e where (e ->> 'id')::uuid = pid), '');
  insert into _res values ('T7f another member does not see it', not exists (select 1 from jsonb_array_elements(public.community_rpc('community_feed', jsonb_build_object('p_viewer', b, 'p_cursor_at', null, 'p_cursor_id', null, 'p_limit', 30))) e where (e ->> 'id')::uuid = pid), '');
  insert into _res values ('T7g its author sees it, labelled held', exists (select 1 from jsonb_array_elements(public.community_rpc('community_feed', jsonb_build_object('p_viewer', a, 'p_cursor_at', null, 'p_cursor_id', null, 'p_limit', 30))) e where (e ->> 'id')::uuid = pid and e ->> 'status' = 'held'), '');
  insert into _res values ('T7h no feed row exposes an account id or email', not exists (select 1 from jsonb_array_elements(public.community_rpc('community_feed', jsonb_build_object('p_viewer', a, 'p_cursor_at', null, 'p_cursor_id', null, 'p_limit', 30))) e, jsonb_object_keys(e) k where k ~* '(user|author_id|email)'), '');

  -- T8 moderation permissions and the second factor
  begin perform public.community_rpc('community_moderation_queue', jsonb_build_object('p_actor', p, 'p_aal2', true)); ok := false; exception when others then ok := sqlerrm = 'forbidden'; end;
  insert into _res values ('T8a a non-staff member with a second factor is refused', ok, '');
  begin perform public.community_rpc('community_moderation_queue', jsonb_build_object('p_actor', m, 'p_aal2', false)); ok := false; exception when others then ok := sqlerrm = 'forbidden'; end;
  insert into _res values ('T8b a moderator WITHOUT a second factor is refused', ok, '');
  insert into _res values ('T8c a moderator with a second factor sees the held photo with no account id', exists (select 1 from jsonb_array_elements(public.community_rpc('community_moderation_queue', jsonb_build_object('p_actor', m, 'p_aal2', true))) e where (e ->> 'id')::uuid = pid and jsonb_array_length(e -> 'media') > 0) and not (public.community_rpc('community_moderation_queue', jsonb_build_object('p_actor', m, 'p_aal2', true))::text like '%' || a::text || '%'), '');
  perform public.community_rpc('community_moderate', jsonb_build_object('p_actor', m, 'p_aal2', true, 'p_type', 'post', 'p_target', pid, 'p_action', 'approve', 'p_note', 'ok'));
  insert into _res values ('T8d approval publishes the photo post', exists (select 1 from jsonb_array_elements(public.community_rpc('community_feed', '{"p_viewer":null,"p_cursor_at":null,"p_cursor_id":null,"p_limit":30}'::jsonb)) e where (e ->> 'id')::uuid = pid), '');
  insert into _res values ('T8e the action is in the audit log by the moderator, without the note', exists (select 1 from public.audit_log where actor = m and action = 'community.approve' and row_id = pid::text) and not exists (select 1 from public.audit_log where detail::text like '%ok%' and action = 'community.approve' and detail::text like '%note%'), '');
  perform set_config('role', 'none', true);
  insert into _res values ('T8f the audit chain still verifies', (select count(*) from public.audit_log) = (select count(*) from public.audit_log where hash = app.audit_stamp(prev_hash, actor, action, table_name, row_id, detail, at)), '');
  -- the JWT-level second-factor rule used by every other staff permission
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into _res values ('T8g has_permission is false for staff at password-only level', not app.has_permission('moderation.review'), '');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into _res values ('T8h has_permission is true for the same staff at second-factor level', app.has_permission('moderation.review'), '');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into _res values ('T8i has_permission is false for a non-staff member even at second-factor level', not app.has_permission('moderation.review'), '');
  perform set_config('role', 'service_role', true);

  -- T9 urgent report, restrictions, modes
  r := public.community_rpc('community_report', jsonb_build_object('p_user', b, 'p_type', 'post', 'p_target', (select (e ->> 'id')::uuid from jsonb_array_elements(public.community_rpc('community_feed', '{"p_viewer":null,"p_cursor_at":null,"p_cursor_id":null,"p_limit":30}'::jsonb)) e where e ->> 'body' = 'First class done!' limit 1), 'p_reason', 'child_safety', 'p_note', null));
  insert into _res values ('T9a a child-safety report is urgent and hides the post at once', (r ->> 'urgent')::boolean and (select status = 'hidden' from public.community_posts where body = 'First class done!' limit 1), '');
  insert into _res values ('T9b the alert summary holds counts only', public.community_rpc('community_alert_summary', '{}'::jsonb)::text !~* '(ama_|kofi_|user_id|@)', '');
  perform public.community_rpc('community_restrict', jsonb_build_object('p_actor', m, 'p_aal2', true, 'p_username', 'kofi_moves', 'p_restriction', 'muted', 'p_hours', 24, 'p_reason', 'spam', 'p_note', null));
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', b, 'p_type', 'text', 'p_body', 'hi again', 'p_milestone', null, 'p_media', null, 'p_confirmed', true)); ok := false; exception when others then ok := sqlerrm = 'muted'; end;
  insert into _res values ('T9c a muted member cannot post', ok, '');
  perform public.community_rpc('community_set_mode', jsonb_build_object('p_actor', m, 'p_aal2', true, 'p_mode', 'read_only', 'p_note', null));
  begin perform public.community_rpc('community_create_post', jsonb_build_object('p_user', a, 'p_type', 'text', 'p_body', 'x', 'p_milestone', null, 'p_media', null, 'p_confirmed', true)); ok := false; exception when others then ok := sqlerrm = 'paused'; end;
  insert into _res values ('T9d Read only stops new posts', ok, '');
  insert into _res values ('T9e the status reports Read only, video off, comments off', (public.community_rpc('community_status', '{}'::jsonb)) = '{"mode":"read_only","videoEnabled":false,"commentsEnabled":false}'::jsonb, public.community_rpc('community_status', '{}'::jsonb)::text);
  perform public.community_rpc('community_set_mode', jsonb_build_object('p_actor', m, 'p_aal2', true, 'p_mode', 'open', 'p_note', null));

  -- T10 account deletion: executor, cascade, orphan sweep
  perform public.community_rpc('community_claim_username', jsonb_build_object('p_user', d, 'p_name', 'del_tester'));
  up := public.community_rpc('community_issue_upload', jsonb_build_object('p_user', d, 'p_kind', 'photo', 'p_mime', 'image/png'));
  perform public.community_rpc('community_verify_upload', jsonb_build_object('p_user', d, 'p_path', up ->> 'path', 'p_bytes', 500, 'p_duration', null));
  perform public.community_rpc('community_create_post', jsonb_build_object('p_user', d, 'p_type', 'photo', 'p_body', 'bye', 'p_milestone', null, 'p_media', jsonb_build_array(jsonb_build_object('kind','photo','role','single','path', up ->> 'path')), 'p_confirmed', true));
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.request_account_deletion();
  perform set_config('role', 'none', true);
  insert into _res values ('T10a before the waiting period ends nothing is deleted', exists (select 1 from auth.users where id = d), '');
  update public.account_deletion_requests set scheduled_for = now() - interval '1 minute' where user_id = d;
  perform set_config('role', 'service_role', true);
  n := public.purge_due_account_deletions();
  perform set_config('role', 'none', true);
  insert into _res values ('T10b the executor deletes exactly the due account', n = 1 and not exists (select 1 from auth.users where id = d) and exists (select 1 from auth.users where id = a), 'deleted ' || n);
  insert into _res values ('T10c their profile, posts, membership and uploads are gone', not exists (select 1 from public.profiles where id = d) and not exists (select 1 from public.community_posts where author_id = d) and not exists (select 1 from public.community_members where user_id = d) and not exists (select 1 from public.community_uploads where user_id = d), '');
  perform set_config('role', 'service_role', true);
  perform set_config('role', 'none', true);

  insert into _res values ('T10d the deleted member''s photo file is queued for removal from storage', exists (select 1 from public.community_orphaned_files where storage_path = up ->> 'path'), '');

  -- T11 owner isolation on a base table (row-level security)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'none', true);
  insert into public.consents (user_id, purpose, policy_version, granted) values (b, 'health_data_processing', 'v0', true), (a, 'health_data_processing', 'v0', true);
  insert into public.weight_entries (user_id, weight_kg, measured_at) values (b, 70, now());
  perform set_config('role', 'authenticated', true);
  insert into _res values ('T11 a member cannot read another member''s weight entries', (select count(*) from public.weight_entries where user_id = b) = 0, '');
  begin delete from public.weight_entries where user_id = b; get diagnostics n = row_count; ok := n = 0; exception when insufficient_privilege then ok := true; end;
  insert into _res values ('T11b nor delete them', ok, '');
  perform set_config('role', 'none', true);

  select count(*) filter (where x.ok), count(*) filter (where not x.ok), coalesce(string_agg(x.name || coalesce(' [' || nullif(x.detail, '') || ']', ''), '; ') filter (where not x.ok), '') into pass, fail, notes from _res x;
  raise exception 'RESULT pass=% fail=% | failed: %', pass, fail, notes;
end $t$;
