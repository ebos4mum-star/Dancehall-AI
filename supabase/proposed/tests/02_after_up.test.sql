-- After M3 v2: the schema accepts the new styles, keeps everything that existed, and the logging foreign keys behave as the release sequence assumes.
do $$
declare
  a uuid; b uuid; def text; lg uuid;
  blocks jsonb := '[
    {"kind":"warmup","title":"Warm","seconds":60,"cue":"Walk in place","lowImpactAlt":"Seated march"},
    {"kind":"main","title":"Move","seconds":180,"cue":"Bounce","lowImpactAlt":"Sway"},
    {"kind":"cooldown","title":"Cool","seconds":60,"cue":"Breathe","lowImpactAlt":"Seated breathing"}]';
begin
  -- 1. The constraint lists exactly the nine styles; the six originals are still there.
  select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = 'public.workouts'::regclass and conname = 'workouts_style_check';
  perform test.assert(def ~ 'dancehall' and def ~ 'reggae' and def ~ 'chair_dance', 'the three new styles are allowed');
  perform test.assert(def ~ 'afrobeats' and def ~ 'amapiano' and def ~ 'hip_hop' and def ~ 'latin' and def ~ 'bollywood' and def ~ 'low_impact', 'the six original styles are still allowed');
  perform test.assert(def !~ 'soca', 'soca was removed from the proposal and is still refused');
  perform test.assert((select count(*) = 14 and bool_and(is_synthetic) from public.workouts), 'every existing workout survived unchanged');

  -- 2. The new styles store as drafts (the seeding role), anything else is still refused.
  insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety)
  values ('m3-dancehall', 'x', 'dancehall', 'beginner', 'low', 'low', 10, 'x', blocks, '["Stop if unwell."]'),
         ('m3-reggae', 'x', 'reggae', 'beginner', 'low', 'low', 10, 'x', blocks, '["Stop if unwell."]'),
         ('m3-chair', 'x', 'chair_dance', 'beginner', 'low', 'low', 10, 'x', blocks, '["Stop if unwell."]');
  perform test.assert((select count(*) = 3 and bool_and(status = 'draft' and not is_synthetic) from public.workouts where id like 'm3-%'), 'new-style rows are stored as non-synthetic drafts');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('m3-junk', 'x', 'soca', 'beginner', 'low', 'low', 10, 'x', '[]', '[]')$q$, 'check constraint');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('m3-junk', 'x', 'zumba', 'beginner', 'low', 'low', 10, 'x', '[]', '[]')$q$, 'check constraint');

  -- 3. Unreviewed content still cannot be published or seen, with the new styles allowed.
  perform test.throws($q$update public.workouts set status = 'published' where id = 'm3-dancehall'$q$, 'publish_blocked');
  perform test.throws($q$update public.workouts set status = 'published' where id = 'm3-chair'$q$, 'publish_blocked');
  a := test.make_user('m3-a@example.test'); b := test.make_user('m3-b@example.test');
  perform test.as_user(a);
  perform test.assert((select count(*) = 0 from public.workouts where style in ('dancehall', 'reggae', 'chair_dance')), 'people cannot see unpublished new-style workouts');
  perform test.assert((select count(*) = 14 from public.workouts), 'people still see the published sample catalogue');

  -- 4. Workout logging: a session can reference a seeded workout, and not one that has not been seeded (so hosted seeds must come first).
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.workout_sessions (workout_id, title, style, minutes, planned_for, source) values ('m3-dancehall', 'Dancehall draft', 'dancehall', 10, current_date, 'manual');
  perform test.assert((select count(*) = 1 from public.workout_sessions where style = 'dancehall'), 'a session for a seeded new-style workout is logged');
  insert into public.workout_sessions (title, style, minutes, planned_for) values ('Free session with a new style label', 'reggae', 10, current_date);
  perform test.assert((select count(*) = 2 from public.workout_sessions), 'a session without a workout id can carry any style label (the column is plain text)');
  perform test.throws($q$insert into public.workout_sessions (workout_id, title, style, minutes, planned_for) values ('m3-not-seeded', 'x', 'dancehall', 10, current_date)$q$, 'foreign key');

  -- 5. Food logging: an item can reference a seeded food, and not one that has not been seeded.
  perform test.as_admin();
  insert into public.foods (id, name, category, region_tags, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, serving_g, serving_label, cost_tier, aliases, source, is_synthetic, attribution)
  values ('m3-seeded-food', 'Seeded test food', 'vegetable', array['jamaican'], 100, 2, 20, 1, 3, 100, '100 g', 1, array[]::text[], 'usda_fdc', false, 'Test attribution');
  perform test.as_user(a);
  insert into public.food_logs (meal_type, source) values ('breakfast', 'manual') returning id into lg;
  insert into public.food_log_items (log_id, food_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (lg, 'm3-seeded-food', 'Seeded test food', 100, 100, 90, 110, 'usda_fdc', 'high');
  perform test.assert((select count(*) = 1 from public.food_log_items where food_id = 'm3-seeded-food'), 'an item for a seeded food is logged');
  perform test.throws(format($q$insert into public.food_log_items (log_id, food_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'm3-unseeded-food', 'x', 100, 100, 90, 110, 'usda_fdc', 'high')$q$, lg), 'foreign key');
  insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (lg, 'Home-cooked dish', 100, 100, 80, 120, 'user_manual', 'low');
  perform test.assert((select count(*) = 2 from public.food_log_items), 'a manual item needs no seeded food');

  -- 6. Isolation is unchanged.
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.workout_sessions) and (select count(*) = 0 from public.food_log_items), 'another person sees none of it');
end $$;
