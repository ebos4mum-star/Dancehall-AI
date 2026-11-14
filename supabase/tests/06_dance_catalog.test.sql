-- Block 1: staff permissions (MFA), catalog visibility, drafts, independent review and publishing.
do $$
declare
  ad uuid; ed uuid; lm uuid; fr uuid; rg uuid;
  good jsonb := '[
    {"kind":"warmup","title":"Warm","seconds":60,"cue":"Walk in place","lowImpactAlt":"Seated march"},
    {"kind":"main","title":"Move","seconds":180,"cue":"Bounce","lowImpactAlt":"Sway"},
    {"kind":"cooldown","title":"Cool","seconds":60,"cue":"Breathe","lowImpactAlt":"Seated breathing"}]';
begin
  ad := test.make_user('admin@example.test'); ed := test.make_user('editor@example.test'); lm := test.make_user('licensing@example.test');
  fr := test.make_user('reviewer@example.test'); rg := test.make_user('plain@example.test');
  insert into public.staff_roles (user_id, role) values (ad, 'admin'), (ed, 'content_editor'), (lm, 'licensing_manager'), (fr, 'fitness_reviewer');

  -- permissions require a role AND a verified second factor
  perform test.as_user(ed, 'aal1');
  perform test.assert(not app.has_permission('content.edit'), 'staff without MFA has no permission');
  perform test.as_user(ed, 'aal2');
  perform test.assert(app.has_permission('content.edit') and not app.has_permission('content.publish') and not app.has_permission('licensing.manage'), 'content editor is least-privilege');
  perform test.as_user(rg, 'aal2');
  perform test.assert(not app.has_permission('content.edit'), 'no staff role means no permission, even with MFA');
  perform test.assert((select count(*) from public.staff_roles) = 0, 'a non-staff user sees no staff roles');
  perform test.as_user(ed, 'aal2');
  perform test.assert((select count(*) from public.staff_roles) = 1, 'staff see only their own role row');
  perform test.throws($q$insert into public.staff_roles (user_id, role) values (gen_random_uuid(), 'admin')$q$, 'permission denied');
  perform test.throws(format($q$update public.staff_roles set role = 'admin' where user_id = %L$q$, ed), 'permission denied');
  perform test.as_user(ad, 'aal2');
  perform test.assert(app.has_permission('audit.view') and app.has_permission('licensing.manage') and app.has_permission('fitness.review'), 'admin has every permission with MFA');
  perform test.as_user(ad, 'aal1');
  perform test.assert(not app.has_permission('audit.view'), 'admin without MFA has nothing');

  -- catalog visibility for normal users
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.workouts) = 14 and (select count(*) from public.workouts where is_synthetic) = 14, 'users see the 14 published sample workouts, all flagged as samples');
  perform test.assert((select count(*) from public.programs) = 1 and (select count(*) from public.program_workouts) = 12 and (select count(*) from public.instructors) = 1, 'published program, its sessions and the placeholder instructor are readable');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks) values ('x-draft','X','latin','beginner','low','low',10,'x','[]')$q$, 'row-level security');
  perform test.assert(test.rows_affected($q$update public.workouts set status = 'unpublished'$q$) = 0, 'a normal user cannot change the catalog');
  perform test.assert(test.rows_affected($q$update public.workouts set title = 'hacked'$q$) = 0, 'a normal user cannot edit workouts');
  perform test.assert((select count(*) from public.licences) = 0 and (select count(*) from public.media_assets) = 0 and (select count(*) from public.content_reviews) = 0, 'licences, raw media and reviews are staff-only');
  perform test.as_anon();
  perform test.throws($q$select * from public.workouts$q$, 'permission denied');
  perform test.as_admin();

  -- staff create drafts only
  perform test.as_user(ed, 'aal1');
  perform test.throws(format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-draft-one','T','latin','beginner','low','low',10,'s',%L::jsonb,'["s"]')$q$, good), 'row-level security');
  perform test.as_user(ed, 'aal2');
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-draft-one','Draft one','latin','beginner','low','low',5,'A real draft',%L::jsonb,'["Stop if unwell"]')$q$, good);
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-draft-two','Draft two','latin','beginner','low','low',5,'Another',%L::jsonb,'["Stop if unwell"]')$q$, good);
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-bad-structure','Bad','latin','beginner','low','low',5,'No warm-up',%L::jsonb,'["s"]')$q$,
    '[{"kind":"main","title":"Move","seconds":300,"cue":"Bounce","lowImpactAlt":"Sway"},{"kind":"cooldown","title":"Cool","seconds":10,"cue":"x","lowImpactAlt":"y"}]');
  perform test.assert((select status = 'draft' and not is_synthetic from public.workouts where id = 'test-draft-one'), 'staff-created content starts as a draft and is not a sample');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-draft-one'$q$, 'publish_permission_required');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, status) values ('x-pub','X','latin','beginner','low','low',10,'x','[]','published')$q$, 'permission denied');
  perform test.throws($q$update public.workouts set is_synthetic = true where id = 'test-draft-one'$q$, 'permission denied');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks) values ('x-bad-min','X','latin','beginner','low','low',500,'x','[]')$q$, 'check constraint');
  -- a block without a low-impact version, and a workout with no safety notes, can never be published
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-no-lowimpact','No low impact','latin','beginner','low','low',5,'x',%L::jsonb,'["s"]')$q$,
    '[{"kind":"warmup","title":"W","seconds":60,"cue":"a","lowImpactAlt":"b"},{"kind":"main","title":"M","seconds":180,"cue":"a","lowImpactAlt":"  "},{"kind":"cooldown","title":"C","seconds":60,"cue":"a","lowImpactAlt":"b"}]');
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-no-safety','No safety','latin','beginner','low','low',5,'x',%L::jsonb,'[]')$q$, good);
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.workouts where id like 'test-%') = 0, 'drafts are invisible to normal users');
  perform test.as_user(ed, 'aal2');
  perform test.assert((select count(*) from public.workouts where id like 'test-%') = 5, 'staff can read drafts');
  perform test.as_admin();
  perform test.throws($q$update public.workouts set is_synthetic = true where id = 'test-draft-one'$q$, 'is_synthetic_immutable');

  -- publishing needs an independent fitness review
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-draft-one'$q$, 'publish_blocked_review');
  perform test.as_user(ad, 'aal2');
  execute format($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('test-admin-authored','Admin authored','latin','beginner','low','low',5,'x',%L::jsonb,'["s"]')$q$, good);
  perform test.throws($q$insert into public.content_reviews (workout_id, review_type, outcome) values ('test-admin-authored','fitness','approved')$q$, 'self_review_not_allowed');
  perform test.as_user(ed, 'aal2');
  -- an editor has no review permission (and here is also the author): refused either way
  perform test.throws($q$insert into public.content_reviews (workout_id, review_type, outcome) values ('test-draft-one','fitness','approved')$q$, 'row-level security|self_review_not_allowed');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$insert into public.content_reviews (workout_id, review_type, outcome) values ('test-draft-one','fitness','approved')$q$, 'row-level security');
  perform test.as_user(fr, 'aal2');
  perform test.throws(format($q$insert into public.content_reviews (workout_id, review_type, outcome, reviewer_id) values ('test-draft-one','fitness','approved',%L)$q$, ed), 'permission denied');
  insert into public.content_reviews (workout_id, review_type, outcome, notes) values ('test-draft-one', 'fitness', 'approved', 'Looks safe'), ('test-bad-structure', 'fitness', 'approved', 'ok'), ('test-draft-two', 'fitness', 'approved', 'ok'), ('test-no-lowimpact', 'fitness', 'approved', 'ok'), ('test-no-safety', 'fitness', 'approved', 'ok');
  perform test.throws($q$update public.content_reviews set outcome = 'changes_requested'$q$, 'permission denied');
  perform test.throws($q$delete from public.content_reviews$q$, 'permission denied');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-bad-structure'$q$, 'publish_blocked_structure.*warm-up');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-no-lowimpact'$q$, 'publish_blocked_structure.*low-impact');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-no-safety'$q$, 'publish_blocked_structure.*safety');
  update public.workouts set status = 'published' where id = 'test-draft-one';
  perform test.assert((select status = 'published' and published_at is not null from public.workouts where id = 'test-draft-one'), 'published after an independent approval');
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.workouts where id = 'test-draft-one') = 1, 'a published workout becomes visible to users');
  -- a later "changes requested" review blocks re-publishing
  perform test.as_user(lm, 'aal2');
  update public.workouts set status = 'unpublished' where id = 'test-draft-one';
  perform test.as_user(fr, 'aal2');
  insert into public.content_reviews (workout_id, review_type, outcome, notes) values ('test-draft-one', 'fitness', 'changes_requested', 'Cooldown too short');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-draft-one'$q$, 'publish_blocked_review');
  -- editors can fix content but not publish; edit permission is separate from publish permission
  perform test.as_user(ed, 'aal2');
  update public.workouts set summary = 'Fixed the cooldown' where id = 'test-draft-one';
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set summary = 'sneaky edit' where id = 'test-draft-one'$q$, 'edit_permission_required');
  perform test.as_admin();
end $$;

-- Block 2: licences, territorial clearance, media access, expiry and instructors.
do $$
declare
  ed uuid := (select id from auth.users where email = 'editor@example.test');
  lm uuid := (select id from auth.users where email = 'licensing@example.test');
  rg uuid := (select id from auth.users where email = 'plain@example.test');
  us uuid := test.make_user('us@example.test'); gh uuid := test.make_user('gh@example.test');
  lic uuid; lic2 uuid; lic3 uuid; n integer;
begin
  update public.profiles set country = 'US' where id = us;
  update public.profiles set country = 'GH' where id = gh;

  perform test.as_user(lm, 'aal2');
  insert into public.licences (asset_kind, title, licensor, territories, starts_on, ends_on)
    values ('music', 'Test track', 'Test licensor', array['US'], current_date - 10, current_date + 100) returning id into lic;
  perform test.throws(format($q$update public.licences set status = 'cleared' where id = %L$q$, lic), 'cleared_needs_evidence');
  perform test.throws($q$insert into public.licences (asset_kind, title, licensor, territories, starts_on) values ('music','x','y',array['usa'],current_date)$q$, 'check constraint');
  perform test.throws($q$insert into public.licences (asset_kind, title, licensor, territories, starts_on) values ('music','x','y','{}',current_date)$q$, 'check constraint');
  perform test.throws($q$insert into public.licences (asset_kind, title, licensor, territories, starts_on, ends_on) values ('music','x','y',array['US'],current_date, current_date - 1)$q$, 'licence_dates_ordered');
  perform test.as_user(ed, 'aal2');
  perform test.assert((select count(*) from public.licences) = 0, 'editors cannot read licences');
  perform test.throws($q$insert into public.licences (asset_kind, title, licensor, territories, starts_on) values ('music','x','y',array['US'],current_date)$q$, 'row-level security');
  -- editor attaches media (still a draft licence)
  insert into public.media_assets (workout_id, kind, storage_path, duration_s, licence_id) values ('test-draft-two', 'audio', 'tracks/test.mp3', 300, lic);
  perform test.throws($q$insert into public.media_assets (workout_id, kind, storage_path, licence_id) values ('test-draft-two','video','/abs/path.mp4',gen_random_uuid())$q$, 'check constraint|foreign key');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-draft-two'$q$, 'publish_blocked_licence');
  update public.licences set evidence_ref = 'AGREEMENT-123', status = 'cleared' where id = lic;
  perform test.assert((select cleared_by = lm and cleared_at is not null from public.licences where id = lic), 'clearing records who cleared it and when');
  update public.workouts set status = 'published' where id = 'test-draft-two';
  perform test.assert((select status from public.workouts where id = 'test-draft-two') = 'published', 'published once the licence is cleared');

  -- territorial access: US-only licence
  perform test.as_user(us);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 1, 'US user may play media cleared for the US');
  perform test.as_user(gh);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'GH user gets no media under a US-only licence');
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'a user with no country gets no media');
  perform test.assert((select count(*) from public.media_assets) = 0, 'raw media rows are not readable by users');
  perform test.as_anon();
  perform test.throws($q$select * from public.workout_playable_media('test-draft-two')$q$, 'permission denied');

  -- all-or-nothing: a second asset (video) cleared only for GH blocks both countries
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$insert into public.licences (asset_kind, title, licensor, territories, starts_on, status) values ('video','x','y',array['GH'],current_date,'cleared')$q$, 'permission denied');   -- cannot be created already cleared
  insert into public.licences (asset_kind, title, licensor, territories, starts_on, evidence_ref) values ('video', 'Test video', 'Test licensor', array['GH'], current_date - 1, 'AGREEMENT-456') returning id into lic2;
  update public.licences set status = 'cleared' where id = lic2;
  perform test.as_user(ed, 'aal2');
  insert into public.media_assets (workout_id, kind, storage_path, licence_id) values ('test-draft-two', 'video', 'videos/test.mp4', lic2);
  perform test.as_user(us);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'no media for US when one asset is not cleared there (never video without cleared music)');
  perform test.as_user(gh);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'no media for GH when the music is not cleared there');
  perform test.as_user(lm, 'aal2');
  update public.licences set territories = array['US', 'GH'] where id in (lic, lic2);
  perform test.as_user(us);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 2, 'both assets play once both licences cover the country');
  perform test.as_user(gh);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 2, 'GH plays both after the territories are extended');

  -- an unpublished workout never serves media
  perform test.as_user(lm, 'aal2');
  update public.workouts set status = 'unpublished' where id = 'test-draft-two';
  perform test.as_user(gh);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'unpublished workouts serve no media');
  perform test.as_user(lm, 'aal2');
  update public.workouts set status = 'published' where id = 'test-draft-two';

  -- expiry: the server job pulls the workout, and media stops immediately
  perform test.as_admin();
  update public.licences set ends_on = current_date - 1 where id = lic;
  perform test.as_user(us);
  perform test.assert((select count(*) from public.workout_playable_media('test-draft-two')) = 0, 'expired licence stops media immediately');
  perform test.throws($q$select public.workouts_unpublish_expired()$q$, 'permission denied');
  perform test.as_admin();
  perform set_config('role', 'service_role', false);
  n := public.workouts_unpublish_expired();
  perform test.as_admin();
  perform test.assert(n = 1 and (select status from public.workouts where id = 'test-draft-two') = 'unpublished', 'expired-licence workout is unpublished by the server job');
  perform test.assert((select count(*) from public.workouts where is_synthetic and status = 'published') = 14, 'sample workouts are not affected');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'test-draft-two'$q$, 'publish_blocked_licence');
  update public.licences set status = 'revoked' where id = lic2;
  perform test.assert((select status from public.licences where id = lic2) = 'revoked', 'licences can be revoked');

  -- instructors need a cleared likeness licence
  perform test.as_user(ed, 'aal2');
  insert into public.instructors (id, display_name, bio) values ('test-instructor', 'Test Instructor', 'bio');
  perform test.as_user(lm, 'aal2');
  perform test.throws($q$update public.instructors set status = 'published' where id = 'test-instructor'$q$, 'publish_blocked_likeness_licence');
  insert into public.licences (asset_kind, title, licensor, territories, starts_on, evidence_ref) values ('instructor_likeness', 'Likeness', 'Instructor', array['*'], current_date - 1, 'AGREEMENT-789') returning id into lic3;
  update public.licences set status = 'cleared' where id = lic3;
  perform test.as_user(ed, 'aal2');
  update public.instructors set likeness_licence_id = lic3 where id = 'test-instructor';
  perform test.as_user(lm, 'aal2');
  update public.instructors set status = 'published' where id = 'test-instructor';
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.instructors where id = 'test-instructor') = 1, 'published instructor is visible');
  perform test.as_admin();
end $$;

-- Block 3: audit log is complete, chained, append-only and tamper-evident.
do $$
declare
  ad uuid := (select id from auth.users where email = 'admin@example.test');
  rg uuid := (select id from auth.users where email = 'plain@example.test');
  n bigint; bad bigint;
begin
  perform test.as_user(ad, 'aal2');
  select count(*) into n from public.audit_log;
  perform test.assert(n >= 12, 'audit log has entries for roles, reviews, licences and publish changes');
  perform test.assert(exists (select 1 from public.audit_log where action = 'UPDATE workouts' and row_id = 'test-draft-one' and detail ->> 'status' = 'published'), 'publishing is audited with who and when');
  perform test.assert(exists (select 1 from public.audit_log where action = 'UPDATE licences' and detail ->> 'status' = 'cleared' and actor is not null), 'clearing a licence is audited with the actor');
  perform test.assert(exists (select 1 from public.audit_log where action = 'INSERT staff_roles'), 'role grants are audited');
  perform test.assert(public.audit_verify() is null, 'the chain verifies for an authorized reader');
  perform test.as_user(ad, 'aal1');
  perform test.assert((select count(*) from public.audit_log) = 0, 'no audit access without MFA');
  perform test.throws($q$select public.audit_verify()$q$, 'permission denied');
  perform test.as_user(rg);
  perform test.assert((select count(*) from public.audit_log) = 0, 'normal users cannot read the audit log');
  perform test.throws($q$insert into public.audit_log (action, table_name, prev_hash, hash) values ('x','x','x','x')$q$, 'permission denied');
  perform test.as_admin();
  perform test.assert(public.audit_verify() is null, 'the chain verifies for the server');
  perform test.throws($q$update public.audit_log set action = 'tampered'$q$, 'audit_log_is_append_only');
  perform test.throws($q$delete from public.audit_log$q$, 'audit_log_is_append_only');
  perform test.throws($q$truncate public.audit_log$q$, 'audit_log_is_append_only');
  -- Even someone who bypasses the triggers is caught: tamper inside a sub-transaction, verify, then roll it back.
  begin
    alter table public.audit_log disable trigger audit_no_change;
    update public.audit_log set detail = '{"forged":true}' where id = (select min(id) + 3 from public.audit_log);
    bad := public.audit_verify();
    if bad is null then raise exception 'ASSERTION FAILED: tampering was not detected'; end if;
    raise exception 'tamper-check-done';
  exception when others then
    if sqlerrm <> 'tamper-check-done' then raise; end if;
  end;
  perform test.assert(public.audit_verify() is null, 'the tamper check was rolled back');
end $$;
