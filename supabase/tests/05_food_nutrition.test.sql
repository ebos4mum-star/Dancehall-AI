do $$
declare
  a uuid; b uuid; c uuid;
  la uuid; lb uuid; lp uuid; it uuid; an uuid; an2 uuid; an3 uuid; pl uuid; n bigint; r record; ts timestamptz;
begin
  a := test.make_user('fa@example.test'); b := test.make_user('fb@example.test'); c := test.make_user('fc@example.test');

  -- ---------- reference foods ----------
  perform test.as_user(a);
  perform test.assert((select count(*) from public.foods) >= 40, 'signed-in users can read the reference foods');
  perform test.throws($q$insert into public.foods (id, name, category, kcal_100g, protein_100g, carbs_100g, fat_100g, serving_g, serving_label, cost_tier) values ('x-food','X','grain',1,1,1,1,1,'1',1)$q$, 'permission denied');
  perform test.throws($q$update public.foods set kcal_100g = 1$q$, 'permission denied');
  perform test.assert((select is_synthetic from public.foods where id = 'jollof-rice'), 'seed data is flagged synthetic');
  perform test.as_anon();
  perform test.throws($q$select * from public.foods$q$, 'permission denied');
  perform test.as_admin();

  -- ---------- consent separation ----------
  perform test.as_user(a);
  perform test.throws($q$insert into public.food_logs (meal_type) values ('lunch')$q$, 'row-level security');   -- no health consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.food_logs (meal_type, source) values ('breakfast', 'manual') returning id into la;      -- manual logging needs only health consent
  perform test.throws($q$insert into public.food_logs (meal_type, source) values ('lunch', 'photo')$q$, 'row-level security');
  perform test.throws($q$insert into public.food_photo_analyses (storage_path) values (null)$q$, 'row-level security');
  insert into public.consents (purpose, policy_version, granted) values ('ai_processing_of_food_photos', 'v0', true);
  insert into public.food_photo_analyses (storage_path) values (null) returning id into an;
  insert into public.food_logs (meal_type, source, photo_analysis_id) values ('lunch', 'photo', an) returning id into lp;
  -- AI consent withdrawn: manual logging still works, new photo analyses do not.
  insert into public.consents (purpose, policy_version, granted) values ('ai_processing_of_food_photos', 'v0', false);
  insert into public.food_logs (meal_type) values ('dinner');
  perform test.throws($q$insert into public.food_photo_analyses (storage_path) values (null)$q$, 'row-level security');
  perform test.throws($q$insert into public.food_logs (meal_type, source) values ('lunch', 'photo')$q$, 'row-level security');
  insert into public.consents (purpose, policy_version, granted) values ('ai_processing_of_food_photos', 'v0', true);

  -- ---------- items: integrity, ranges, editing ----------
  insert into public.food_log_items (log_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high, source, confidence)
    values (la, 'banana', 'Banana', 118, 105, 1.3, 27, 0.4, 90, 120, 'ai_estimate', 'medium') returning id into it;
  perform test.assert(not (select user_edited from public.food_log_items where id = it), 'an unreviewed AI estimate is not marked edited');
  perform test.throws(format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 100, 100, 120, 130, 'user_manual', 'high')$q$, la), 'kcal_within_range');
  perform test.throws(format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 0, 100, 90, 110, 'user_manual', 'high')$q$, la), 'check constraint');
  perform test.throws(format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 100, 20000, 90, 110, 'user_manual', 'high')$q$, la), 'check constraint');
  perform test.throws(format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 100, 100, 90, 110, 'made_up', 'high')$q$, la), 'check constraint');
  perform test.throws(format($q$insert into public.food_log_items (log_id, food_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'no-such-food', 'X', 100, 100, 90, 110, 'curated', 'high')$q$, la), 'foreign key');
  perform test.throws(format($q$insert into public.food_log_items (log_id, user_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, %L, 'X', 100, 100, 90, 110, 'user_manual', 'high')$q$, la, b), 'permission denied');
  -- Editing any value flips user_edited to true automatically.
  update public.food_log_items set grams = 150, kcal = 134, kcal_low = 115, kcal_high = 155 where id = it;
  perform test.assert((select user_edited from public.food_log_items where id = it), 'editing marks the item as user-edited');
  perform test.throws(format($q$update public.food_log_items set source = 'curated' where id = %L$q$, it), 'permission denied');
  perform test.throws(format($q$update public.food_log_items set user_edited = false where id = %L$q$, it), 'permission denied');
  insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence)
    values (lp, 'Jollof rice (sample)', 200, 320, 240, 400, 'ai_estimate', 'low');

  -- ---------- isolation ----------
  perform test.as_user(b);
  perform test.assert((select count(*) from public.food_logs) = 0 and (select count(*) from public.food_log_items) = 0, 'B sees none of A''s diary');
  perform test.assert((select count(*) from public.food_photo_analyses) = 0, 'B sees none of A''s photo analyses');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.food_logs (meal_type) values ('lunch') returning id into lb;
  perform test.throws(format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 100, 100, 90, 110, 'user_manual', 'high')$q$, la), 'row-level security'); -- A's log
  perform test.throws(format($q$insert into public.food_logs (meal_type, source, photo_analysis_id) values ('lunch', 'manual', %L)$q$, an), 'row-level security'); -- A's analysis
  perform test.assert(test.rows_affected(format('delete from public.food_log_items where id = %L', it)) = 0, 'B cannot delete A items');
  perform test.assert(test.rows_affected(format('update public.food_logs set meal_type = %L where id = %L', 'snack', la)) = 0, 'B cannot update A logs');

  -- Withdrawn health consent stops new diary writes but keeps reading.
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.throws($q$insert into public.food_logs (meal_type) values ('snack')$q$, 'row-level security');
  perform test.assert((select count(*) from public.food_logs) = 3, 'A can still read the diary after withdrawing consent');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  -- ---------- saved meals ----------
  insert into public.saved_meals (name, meal_type, items) values ('Usual breakfast', 'breakfast', '[{"name":"Banana","grams":118}]');
  perform test.throws($q$insert into public.saved_meals (name, items) values ('Bad', '{}')$q$, 'check constraint');
  perform test.throws($q$insert into public.saved_meals (name, items) values ('Empty', '[]')$q$, 'check constraint');
  perform test.throws($q$insert into public.saved_meals (name, items) values ('', '[{"a":1}]')$q$, 'check constraint');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.saved_meals) = 0, 'B cannot see A saved meals');

  -- ---------- photo retention (24 hours) ----------
  perform test.as_user(a);
  insert into public.food_photo_analyses (storage_path) values (a::text || '/one.jpg') returning id into an2;
  insert into public.food_photo_analyses (storage_path) values (a::text || '/two.jpg') returning id into an3;
  perform test.assert((select delete_after from public.food_photo_analyses where id = an2) <= now() + interval '24 hours 1 minute', 'every upload gets a deadline within 24 hours');
  perform test.throws($q$insert into public.food_photo_analyses (storage_path) values ('someone-elses-folder/x.jpg')$q$, 'photo_path_in_own_folder');
  perform test.throws(format($q$update public.food_photo_analyses set status = 'succeeded' where id = %L$q$, an2), 'permission denied');
  perform test.throws(format($q$update public.food_photo_analyses set delete_after = now() + interval '100 days' where id = %L$q$, an2), 'permission denied');
  perform test.throws(format($q$update public.food_photo_analyses set result = '{}' where id = %L$q$, an2), 'permission denied');
  perform test.throws(format($q$select public.food_photo_complete(%L, '{}')$q$, an2), 'permission denied');
  perform test.throws($q$select * from public.food_photo_expired()$q$, 'permission denied');

  -- Server completes one analysis, fails the other.
  perform test.as_admin();
  perform set_config('role', 'service_role', false);
  perform public.food_photo_complete(an2, '{"items":[]}');
  perform public.food_photo_fail(an3);
  perform test.as_admin();
  select * into r from public.food_photo_analyses where id = an2;
  perform test.assert(r.status = 'succeeded' and r.analyzed_at is not null, 'analysis marked succeeded');
  perform test.assert(r.delete_after between r.analyzed_at + interval '23 hours 59 minutes' and r.analyzed_at + interval '24 hours 1 minute', 'successful analysis: original deleted 24 hours after analysis');
  perform test.assert((select delete_after from public.food_photo_analyses where id = an3) <= now() + interval '24 hours 1 minute', 'failed analysis is also deleted within 24 hours');

  -- Not yet expired now; expired after 25 hours (simulated clock).
  perform set_config('role', 'service_role', false);
  perform test.assert((select count(*) from public.food_photo_expired(now())) = 0, 'nothing is expired yet');
  perform test.assert((select count(*) from public.food_photo_expired(now() + interval '25 hours')) >= 2, 'both temporary photos expire after 24 hours');

  -- Saving keeps a photo: it is no longer listed for deletion; un-saving restarts the 24-hour clock.
  perform test.as_user(a);
  update public.food_photo_analyses set saved = true where id = an2;
  perform test.assert((select delete_after is null from public.food_photo_analyses where id = an2), 'saved photo has no deletion deadline');
  perform test.as_admin();
  perform set_config('role', 'service_role', false);
  perform test.assert(not exists (select 1 from public.food_photo_expired(now() + interval '400 days') where id = an2), 'saved photo is never listed as expired');
  -- Defense in depth: even if a saved photo somehow carried a deadline, it is still never listed.
  perform set_config('role', 'none', false);
  update public.food_photo_analyses set delete_after = now() - interval '1 day' where id = an2;
  perform set_config('role', 'service_role', false);
  perform test.assert(not exists (select 1 from public.food_photo_expired(now()) where id = an2), 'saved photo is not listed even with a stale deadline');
  perform test.as_user(a);
  update public.food_photo_analyses set saved = false where id = an2;
  perform test.assert((select delete_after from public.food_photo_analyses where id = an2) > now() + interval '23 hours', 'un-saving restarts the 24-hour clock');

  -- After the server removes the object, it records the deletion; a deleted photo cannot be saved.
  perform test.as_admin();
  perform set_config('role', 'service_role', false);
  perform public.food_photo_mark_deleted(an3);
  perform test.as_admin();
  perform test.assert((select status = 'deleted' and storage_path is null and deleted_at is not null and delete_after is null from public.food_photo_analyses where id = an3), 'deletion is recorded and the path cleared');
  perform test.as_user(a);
  perform test.throws(format($q$update public.food_photo_analyses set saved = true where id = %L$q$, an3), 'photo_already_deleted');
  perform test.as_user(b);
  perform test.assert(test.rows_affected(format('update public.food_photo_analyses set saved = true where id = %L', an2)) = 0, 'B cannot save A photos');

  -- ---------- storage bucket policies ----------
  perform test.as_admin();
  perform test.assert((select not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg'] from storage.buckets where id = 'food-photos'), 'food photo bucket is private, 5 MB, JPEG only');
  perform test.as_user(a);
  insert into storage.objects (bucket_id, name) values ('food-photos', a::text || '/one.jpg');
  perform test.throws(format($q$insert into storage.objects (bucket_id, name) values ('food-photos', %L)$q$, b::text || '/evil.jpg'), 'row-level security');
  perform test.assert((select count(*) from storage.objects where bucket_id = 'food-photos') = 1, 'A reads own photo object');
  perform test.as_user(b);
  perform test.assert((select count(*) from storage.objects where bucket_id = 'food-photos') = 0, 'B cannot read A photo objects');
  perform test.assert(test.rows_affected(format('delete from storage.objects where bucket_id = %L', 'food-photos')) = 0, 'B cannot delete A photo objects');
  perform test.as_user(a);
  perform test.assert(test.rows_affected(format('delete from storage.objects where bucket_id = %L', 'food-photos')) = 1, 'A can delete their own photo early');
  perform test.as_anon();
  perform test.throws($q$select * from storage.objects$q$, 'permission denied');
  perform test.as_admin();

  -- ---------- meal plans ----------
  perform test.as_user(a);
  insert into public.meal_plans (name, start_date, days, budget_level, budget_cents, currency, target_kcal) values ('Week 1', current_date, 3, 'low', 4000, 'USD', 2000) returning id into pl;
  insert into public.meal_plan_items (plan_id, day_index, meal_type, food_id, name, grams, kcal, cost_tier) values (pl, 0, 'breakfast', 'oatmeal', 'Oatmeal, cooked', 240, 170, 1);
  perform test.throws($q$insert into public.meal_plans (name, start_date, days, budget_level, budget_cents, target_kcal) values ('x', current_date, 3, 'low', 100, 2000)$q$, 'budget_with_currency');
  perform test.throws($q$insert into public.meal_plans (name, start_date, days, budget_level, target_kcal) values ('x', current_date, 30, 'low', 2000)$q$, 'check constraint');
  perform test.throws($q$insert into public.meal_plans (name, start_date, days, budget_level, target_kcal) values ('x', current_date, 3, 'low', 100)$q$, 'check constraint');
  perform test.throws($q$insert into public.meal_plans (name, start_date, days, budget_level, budget_cents, currency, target_kcal) values ('x', current_date, 3, 'low', 100, 'usd', 2000)$q$, 'check constraint');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.meal_plans) = 0 and (select count(*) from public.meal_plan_items) = 0, 'B cannot see A plans');
  perform test.throws(format($q$insert into public.meal_plan_items (plan_id, day_index, meal_type, name, grams, kcal) values (%L, 1, 'lunch', 'X', 100, 100)$q$, pl), 'row-level security');
  perform test.as_admin();
end $$;
