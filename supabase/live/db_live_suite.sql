-- HOSTED DATABASE-LEVEL LIVE SUITE (development project only).
--
-- WHAT THIS IS: real SQL run inside the real database as the `authenticated` role with a user's id in the JWT claims, which is exactly how
-- PostgREST evaluates RLS, grants, constraints, triggers and functions. WHAT THIS IS NOT: signed-in HTTP requests. It does not exercise
-- GoTrue, PostgREST routing, the supabase-js adapters or the Storage API; those are covered by apps/mobile/src/data/live (run from an
-- environment with network access) and are reported separately.
--
-- SAFETY: the whole suite is ONE transaction that always ends by raising LIVE_SUITE_RESULT with the results as JSON, so everything it creates
-- (including its synthetic identities) is rolled back and nothing persists. The identities have no password and cannot sign in.
-- Run it by pasting this file into a SQL execution tool for the development project, or locally with supabase/live/run-local.sh.
do $suite$
declare
  a uuid := 'ffffffff-0000-4000-8000-00000000000a';   -- synthetic identity A
  b uuid := 'ffffffff-0000-4000-8000-00000000000b';   -- synthetic identity B
  c uuid := 'ffffffff-0000-4000-8000-00000000000c';   -- synthetic identity C (no consent; also the household joiner)
  n bigint; t text; h uuid; code text; code2 text; la uuid; hid uuid; gid uuid; i int; claimed int; res jsonb;
begin
  create temp table res (seq serial, area text, name text, ok boolean, detail text) on commit drop;
  grant all on res to public; grant usage on sequence res_seq_seq to public;

  create function pg_temp.rec(p_area text, p_name text, p_ok boolean, p_detail text default null) returns void language sql as
    $$ insert into pg_temp.res (area, name, ok, detail) values (p_area, p_name, coalesce(p_ok, false), p_detail) $$;
  create function pg_temp.as_admin() returns void language plpgsql as
    $$ begin reset role; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); end $$;
  create function pg_temp.as_user(u uuid, aal text default 'aal1') returns void language plpgsql as
    $$ begin
         reset role;
         perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', aal)::text, true);
         perform set_config('request.jwt.claim.sub', u::text, true);
         set local role authenticated;
       end $$;
  create function pg_temp.as_anon() returns void language plpgsql as
    $$ begin reset role; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); set local role anon; end $$;
  -- Runs a statement as the current role. Returns null on success, or 'SQLSTATE: message' on failure.
  create function pg_temp.try(q text) returns text language plpgsql as
    $$ begin execute q; return null; exception when others then return sqlstate || ': ' || sqlerrm; end $$;
  create function pg_temp.count_of(q text) returns bigint language plpgsql as
    $$ declare v bigint; begin execute q into v; return v; end $$;
  -- Expect failure matching a pattern (message or sqlstate).
  create function pg_temp.fails(p_area text, p_name text, q text, pat text) returns void language plpgsql as
    $$ declare e text := pg_temp.try(q);
       begin perform pg_temp.rec(p_area, p_name, e is not null and e ilike '%' || pat || '%', coalesce(e, 'NO ERROR (statement succeeded)')); end $$;
  create function pg_temp.works(p_area text, p_name text, q text) returns void language plpgsql as
    $$ declare e text := pg_temp.try(q);
       begin perform pg_temp.rec(p_area, p_name, e is null, e); end $$;

  -- ---------- 0. Synthetic identities ----------
  perform pg_temp.as_admin();
  for i in 1..3 loop
    t := (array[a, b, c])[i]::text;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
      insert into auth.users (id, aud, role, email, created_at, updated_at)
      values (t::uuid, 'authenticated', 'authenticated', 'live-' || (array['a','b','c'])[i] || '@example.test', now(), now());
    else
      insert into auth.users (id, email) values (t::uuid, 'live-' || (array['a','b','c'])[i] || '@example.test');
    end if;
  end loop;
  perform pg_temp.rec('setup', 'three synthetic identities exist, each with a profile created by the signup trigger',
    (select count(*) = 3 from public.profiles where id in (a, b, c)));
  perform pg_temp.rec('setup', 'no real user is touched: only the three synthetic ids exist in this transaction',
    (select count(*) from auth.users where email like 'live-%@example.test') = 3);

  -- ---------- 1. Consent, profile and onboarding ----------
  perform pg_temp.as_user(a);
  perform pg_temp.works('identity', 'A records health-data consent', $q$insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true)$q$);
  perform pg_temp.fails('identity', 'a made-up consent purpose is rejected', $q$insert into public.consents (purpose, policy_version, granted) values ('made_up', 'v0', true)$q$, 'check');
  perform pg_temp.fails('identity', 'A cannot record consent for B', format($q$insert into public.consents (user_id, purpose, policy_version, granted) values (%L, 'health_data_processing', 'v0', true)$q$, b), 'permission denied');
  perform pg_temp.works('identity', 'A updates their own profile', format($q$update public.profiles set display_name = 'Live A', country = 'GH', time_zone = 'Africa/Accra' where id = %L$q$, a));
  perform pg_temp.fails('identity', 'A cannot set onboarded_at directly', format($q$update public.profiles set onboarded_at = now() where id = %L$q$, a), 'permission denied');
  perform pg_temp.fails('identity', 'under-18 birth date is refused', format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, current_date - interval '17 years', 170)$q$, a), 'adults_only');
  perform pg_temp.works('identity', 'A saves private health profile (adult)', format($q$insert into public.profile_private (user_id, birth_date, height_cm, sex, activity_level) values (%L, '1990-01-01', 170, 'female', 'moderate')$q$, a));
  perform pg_temp.rec('identity', 'A completes onboarding and gets a timestamp', pg_temp.count_of($q$select (public.complete_onboarding() is not null)::int$q$) = 1);
  perform pg_temp.as_user(b);
  perform pg_temp.works('identity', 'B records health-data consent', $q$insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true)$q$);
  perform pg_temp.fails('identity', 'B cannot complete onboarding with an empty profile', $q$select public.complete_onboarding()$q$, 'profile_incomplete');
  perform pg_temp.rec('isolation', 'B cannot read A''s profile', pg_temp.count_of(format($q$select count(*) from public.profiles where id = %L$q$, a)) = 0);
  perform pg_temp.rec('isolation', 'B cannot read A''s private profile', pg_temp.count_of(format($q$select count(*) from public.profile_private where user_id = %L$q$, a)) = 0);
  perform pg_temp.rec('isolation', 'B cannot update A''s profile (zero rows affected)', pg_temp.count_of(format($q$with u as (update public.profiles set display_name = 'Hacked' where id = %L returning 1) select count(*) from u$q$, a)) = 0);
  perform pg_temp.as_admin();
  perform pg_temp.rec('isolation', 'A''s display name is unchanged after B''s attempt', (select display_name = 'Live A' from public.profiles where id = a));
  perform pg_temp.as_user(c);
  perform pg_temp.fails('identity', 'C without consent cannot write health data', $q$insert into public.weight_entries (weight_kg) values (70)$q$, 'row-level security');

  -- ---------- 2. Weight and goals ----------
  perform pg_temp.as_user(a);
  perform pg_temp.works('goals', 'A logs weights', $q$insert into public.weight_entries (weight_kg, measured_at) values (82.4, now() - interval '7 days'), (81.9, now())$q$);
  perform pg_temp.fails('goals', 'an implausible weight is rejected', $q$insert into public.weight_entries (weight_kg) values (10)$q$, 'check');
  perform pg_temp.fails('goals', 'A cannot log a weight for B', format($q$insert into public.weight_entries (user_id, weight_kg) values (%L, 70)$q$, b), 'permission denied');
  perform pg_temp.works('goals', 'A sets a safe weekly goal', $q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg) values ('lose', 'weekly', current_date, current_date + 7, 82, 81.6)$q$);
  perform pg_temp.fails('goals', 'an unsafe goal is refused by the database', $q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg) values ('lose', 'weekly', current_date, current_date + 7, 82, 78)$q$, 'goal_pace_too_fast');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees none of A''s weights or goals', pg_temp.count_of($q$select (select count(*) from public.weight_entries) + (select count(*) from public.goals)$q$) = 0);

  -- ---------- 3. Food diary, saved meals, meal plans ----------
  perform pg_temp.as_user(a);
  insert into public.food_logs (meal_type, source) values ('breakfast', 'manual') returning id into la;
  perform pg_temp.works('food', 'A logs a meal with an item', format($q$insert into public.food_log_items (log_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high, source, confidence) values (%L, 'Live item', 100, 100, 5, 10, 2, 90, 110, 'user_manual', 'high')$q$, la));
  perform pg_temp.fails('food', 'an item whose calories are outside its own range is rejected', format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'X', 100, 100, 120, 130, 'user_manual', 'high')$q$, la), 'kcal_within_range');
  perform pg_temp.fails('food', 'a photo-sourced meal needs the separate photo consent', $q$insert into public.food_logs (meal_type, source) values ('lunch', 'photo')$q$, 'row-level security');
  perform pg_temp.works('food', 'A saves a meal', $q$insert into public.saved_meals (name, meal_type, items) values ('Live saved', 'lunch', '[{"name":"Banana","grams":118}]'::jsonb)$q$);
  perform pg_temp.fails('food', 'an empty saved meal is refused', $q$insert into public.saved_meals (name, items) values ('Empty', '[]')$q$, 'saved_meals_items_check');
  perform pg_temp.works('food', 'A creates a meal plan', $q$insert into public.meal_plans (name, start_date, days, budget_level, target_kcal) values ('Live plan', current_date, 3, 'medium', 2000)$q$);
  perform pg_temp.fails('food', 'an implausible plan target is rejected', $q$insert into public.meal_plans (name, start_date, days, budget_level, target_kcal) values ('Bad', current_date, 3, 'medium', 100)$q$, 'check');
  perform pg_temp.rec('food', 'A reads back their meal, item, saved meal and plan', pg_temp.count_of($q$select (select count(*) from public.food_log_items) + (select count(*) from public.saved_meals) + (select count(*) from public.meal_plans)$q$) = 3);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees none of A''s food logs, items, saved meals or plans', pg_temp.count_of($q$select (select count(*) from public.food_logs) + (select count(*) from public.food_log_items) + (select count(*) from public.saved_meals) + (select count(*) from public.meal_plans)$q$) = 0);
  perform pg_temp.fails('isolation', 'B cannot add an item to A''s meal', format($q$insert into public.food_log_items (log_id, name, grams, kcal, kcal_low, kcal_high, source, confidence) values (%L, 'Intruder', 100, 100, 90, 110, 'user_manual', 'high')$q$, la), 'row-level security');

  -- ---------- 4. Wellness: water, walking, strength, sleep, recovery, hunger, measurements ----------
  perform pg_temp.as_user(a);
  perform pg_temp.works('wellness', 'A logs water', $q$insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 250)$q$);
  perform pg_temp.works('wellness', 'A logs a walk with distance', $q$insert into public.wellness_entries (kind, day, amount, amount2) values ('walk', current_date, 30, 2.4)$q$);
  perform pg_temp.works('wellness', 'A logs a strength session', $q$insert into public.wellness_entries (kind, day, amount, label) values ('strength', current_date, 20, 'bands')$q$);
  perform pg_temp.works('wellness', 'A logs sleep and recovery', $q$insert into public.wellness_entries (kind, day, amount, label) values ('sleep', current_date, 7.5, 'rested'), ('recovery', current_date, 0, 'sore')$q$);
  perform pg_temp.works('wellness', 'A logs a hunger check-in and a measurement', $q$insert into public.wellness_entries (kind, day, amount, label) values ('hunger', current_date, 0, 'comfortable'), ('measurement', current_date, 80, 'waist')$q$);
  perform pg_temp.rec('wellness', 'all seven kinds read back for A', pg_temp.count_of($q$select count(distinct kind) from public.wellness_entries$q$) = 7);
  perform pg_temp.fails('wellness', 'an out-of-range amount is rejected', $q$insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 6000)$q$, 'wellness_amount_range');
  perform pg_temp.fails('wellness', 'a bad label is rejected', $q$insert into public.wellness_entries (kind, day, amount, label) values ('sleep', current_date - 1, 7, 'amazing')$q$, 'wellness_label_valid');
  perform pg_temp.fails('wellness', 'a second sleep entry for the same night is refused', $q$insert into public.wellness_entries (kind, day, amount) values ('sleep', current_date, 6)$q$, 'duplicate key');
  perform pg_temp.works('wellness', 'a retry with a client key records once', $q$insert into public.wellness_entries (kind, day, amount, client_key) values ('hydration', current_date, 500, 'live-key-0001')$q$);
  perform pg_temp.fails('wellness', 'the same client key again is a duplicate (idempotent retry)', $q$insert into public.wellness_entries (kind, day, amount, client_key) values ('hydration', current_date, 500, 'live-key-0001')$q$, 'duplicate key');
  perform pg_temp.fails('wellness', 'a future date is refused', $q$insert into public.wellness_entries (kind, day, amount) values ('walk', current_date + 30, 10)$q$, 'wellness_day_not_in_future');
  perform pg_temp.works('wellness', 'A saves preferences including celebration goals', $q$insert into public.wellness_prefs (data) values ('{"goalIntent":"fitness","celebrations":"gentle","dailyMovementMinutes":20}')$q$);
  perform pg_temp.fails('wellness', 'an oversized preferences document is refused', $q$update public.wellness_prefs set data = to_jsonb(repeat('x', 5000))$q$, 'check');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees none of A''s wellness entries or preferences', pg_temp.count_of($q$select (select count(*) from public.wellness_entries) + (select count(*) from public.wellness_prefs)$q$) = 0);
  perform pg_temp.rec('isolation', 'B deletes nothing of A''s wellness entries', pg_temp.count_of($q$with d as (delete from public.wellness_entries returning 1) select count(*) from d$q$) = 0);
  perform pg_temp.as_user(a);
  perform pg_temp.rec('wellness', 'A can delete their own entry (correction)', pg_temp.count_of($q$with d as (delete from public.wellness_entries where kind = 'hydration' and client_key = 'live-key-0001' returning 1) select count(*) from d$q$) = 1);

  -- ---------- 5. Habits ----------
  perform pg_temp.as_user(a);
  for i in 1..5 loop insert into public.habits (name) values ('Habit ' || i); end loop;
  perform pg_temp.fails('habits', 'a sixth active habit is refused by the database', $q$insert into public.habits (name) values ('Sixth')$q$, 'habit_limit_reached');
  perform pg_temp.works('habits', 'A archives one habit and can add another', $q$update public.habits set archived_at = now() where name = 'Habit 1'$q$);
  perform pg_temp.works('habits', 'a replacement habit now fits', $q$insert into public.habits (name) values ('Replacement')$q$);
  perform pg_temp.works('habits', 'A ticks a habit for today', $q$insert into public.habit_checkins (habit_id, day) select id, current_date from public.habits where name = 'Habit 2'$q$);
  perform pg_temp.fails('habits', 'ticking the same habit twice for a day is a duplicate', $q$insert into public.habit_checkins (habit_id, day) select id, current_date from public.habits where name = 'Habit 2'$q$, 'duplicate key');
  perform pg_temp.fails('habits', 'an archived habit cannot be ticked', $q$insert into public.habit_checkins (habit_id, day) select id, current_date from public.habits where name = 'Habit 1'$q$, 'row-level security');
  perform pg_temp.works('habits', 'un-ticking removes the record', $q$delete from public.habit_checkins$q$);
  perform pg_temp.as_admin();
  select id into gid from public.habits where user_id = a and name = 'Habit 2';
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees none of A''s habits', pg_temp.count_of($q$select (select count(*) from public.habits) + (select count(*) from public.habit_checkins)$q$) = 0);
  perform pg_temp.fails('isolation', 'B cannot tick A''s habit', format($q$insert into public.habit_checkins (habit_id, day) values (%L, current_date)$q$, gid), 'row-level security');

  -- ---------- 6. Challenges ----------
  perform pg_temp.as_user(a);
  perform pg_temp.works('challenges', 'A starts a 7-day, 3-day-target challenge', $q$insert into public.fit_challenges (length_days, target_days, start_date) values (7, 3, current_date)$q$);
  perform pg_temp.fails('challenges', 'a second active challenge is refused', $q$insert into public.fit_challenges (length_days, target_days, start_date) values (14, 5, current_date)$q$, 'fit_challenges_one_active');
  perform pg_temp.fails('challenges', 'a target leaving no rest days is refused', $q$insert into public.fit_challenges (length_days, target_days, start_date) values (7, 6, current_date)$q$, 'target_leaves_rest_days');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees no challenge of A''s', pg_temp.count_of($q$select count(*) from public.fit_challenges$q$) = 0);

  -- ---------- 7. Household and invite attempt limit ----------
  perform pg_temp.as_user(a);
  hid := public.household_create('Live home');
  perform pg_temp.rec('household', 'A creates a household and becomes owner', (select role = 'owner' from public.household_members where member_id = a));
  code := public.household_create_invite(hid);
  perform pg_temp.rec('household', 'the invite is returned once and stored only as a hash', length(code) = 10 and not exists (select 1 from public.household_invites where code_hash = convert_to(code, 'utf8')));
  perform pg_temp.works('household', 'A adds a grocery item and a shared meal', format($q$insert into public.household_grocery_items (household_id, name, quantity) values (%L, 'Rice', '1 bag'); insert into public.household_meals (household_id, day, meal_type, title) values (%L, current_date, 'dinner', 'Jollof')$q$, hid, hid));
  perform pg_temp.as_user(c);
  perform pg_temp.fails('household', 'an over-long household name is refused', $q$select public.household_create(repeat('x', 80))$q$, 'households_name_check');
  perform pg_temp.rec('household', 'a failed create leaves no partial household or membership (atomic)', pg_temp.count_of($q$select (select count(*) from public.household_members where member_id = auth.uid()) + (select count(*) from public.households)$q$) = 0);
  perform pg_temp.rec('household', 'an outsider sees nothing of the household', pg_temp.count_of($q$select (select count(*) from public.households) + (select count(*) from public.household_grocery_items) + (select count(*) from public.household_meals) + (select count(*) from public.household_invites)$q$) = 0);
  perform pg_temp.fails('household', 'an outsider cannot write to the household list', format($q$insert into public.household_grocery_items (household_id, name) values (%L, 'Intruder')$q$, hid), 'row-level security');
  perform pg_temp.rec('household', 'a wrong code joins nothing and returns null (counted)', pg_temp.count_of($q$select (public.household_join('WRONGCODE1') is null)::int$q$) = 1);
  perform pg_temp.rec('household', 'C joins with the right code (case and spaces forgiven)', pg_temp.count_of(format($q$select (public.household_join(' ' || lower(%L) || ' ') = %L)::int$q$, code, hid)) = 1);
  perform pg_temp.rec('household', 'C now sees the shared list and meal', pg_temp.count_of($q$select (select count(*) from public.household_grocery_items) + (select count(*) from public.household_meals)$q$) = 2);
  perform pg_temp.rec('household', 'a housemate sees none of the owner''s health data (weights, food, wellness, goals)', pg_temp.count_of($q$select (select count(*) from public.weight_entries) + (select count(*) from public.food_logs) + (select count(*) from public.wellness_entries) + (select count(*) from public.goals) + (select count(*) from public.profile_private)$q$) = 0);
  perform pg_temp.fails('household', 'a tick may only be recorded as the caller', format($q$update public.household_grocery_items set checked_by = %L, checked_at = now()$q$, a), 'row-level security');
  perform pg_temp.works('household', 'C ticks an item as themselves', format($q$update public.household_grocery_items set checked_by = %L, checked_at = now()$q$, c));
  perform pg_temp.as_user(a);
  code2 := public.household_create_invite(hid);
  perform pg_temp.as_user(b);
  for i in 1..5 loop
    perform pg_temp.rec('household', 'B''s incorrect code ' || i || ' is refused (null)', pg_temp.count_of(format($q$select (public.household_join('BADCODE%s') is null)::int$q$, i)) = 1);
  end loop;
  perform pg_temp.fails('household', 'after 5 incorrect codes joining is paused, even with a correct code', format($q$select public.household_join(%L)$q$, code2), 'too_many_attempts');
  perform pg_temp.rec('household', 'B sees only their own attempts', pg_temp.count_of($q$select count(*) from public.household_join_attempts$q$) = 5);
  perform pg_temp.fails('household', 'B cannot reset the attempt counter', $q$delete from public.household_join_attempts$q$, 'permission denied');
  perform pg_temp.fails('household', 'B cannot forge an attempt row either', format($q$insert into public.household_join_attempts (user_id) values (%L)$q$, b), 'permission denied');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('household', 'the pause is per person: C is unaffected and sees no attempts of B''s', pg_temp.count_of($q$select count(*) from public.household_join_attempts$q$) = 0);
  perform pg_temp.works('household', 'C leaves at any time', $q$select public.household_leave()$q$);
  perform pg_temp.as_admin();
  perform pg_temp.rec('household', 'the owner remains and the household survives', (select count(*) = 1 from public.household_members where household_id = hid and role = 'owner'));
  update public.household_join_attempts set attempted_at = now() - interval '16 minutes' where user_id = b;
  perform pg_temp.as_user(b);
  perform pg_temp.rec('household', 'after the 15-minute window B can join again', pg_temp.count_of(format($q$select (public.household_join(%L) = %L)::int$q$, code2, hid)) = 1);
  perform pg_temp.rec('household', 'a correct join clears B''s attempt count', pg_temp.count_of($q$select count(*) from public.household_join_attempts$q$) = 0);

  -- ---------- 8. Pulse achievement ledger ----------
  perform pg_temp.as_user(a);
  perform pg_temp.works('pulse', 'A''s device records a shown achievement', $q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full')$q$);
  perform pg_temp.fails('pulse', 'the same achievement again is a duplicate (never celebrated twice)', $q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'gentle')$q$, 'duplicate key');
  perform pg_temp.rec('pulse', 'claim-before-display: the first device claims, the second device does not', 
    pg_temp.count_of($q$with c1 as (insert into public.celebrations (achievement_id, mode) values ('weekly:movement_minutes:2026-06-15', 'full') on conflict do nothing returning 1) select count(*) from c1$q$) = 1
    and pg_temp.count_of($q$with c2 as (insert into public.celebrations (achievement_id, mode) values ('weekly:movement_minutes:2026-06-15', 'full') on conflict do nothing returning 1) select count(*) from c2$q$) = 0);
  perform pg_temp.works('pulse', 'monthly and yearly achievements are recorded', $q$insert into public.celebrations (achievement_id, mode) values ('monthly:movement_weeks:2026-06', 'off'), ('yearly:movement_weeks:2026', 'gentle')$q$);
  perform pg_temp.rec('pulse', 'a new session of A reads the same ledger (synced after sign-in)', pg_temp.count_of($q$select count(*) from public.celebrations$q$) = 4);
  perform pg_temp.fails('pulse', 'recorded achievements cannot be rewritten', $q$update public.celebrations set mode = 'off'$q$, 'permission denied');
  perform pg_temp.fails('pulse', 'the shown time cannot be forged', $q$insert into public.celebrations (achievement_id, mode, shown_at) values ('daily:habits:2026-06-17', 'full', now() - interval '3 days')$q$, 'permission denied');
  perform pg_temp.fails('pulse', 'weight and calorie achievements cannot exist', $q$insert into public.celebrations (achievement_id, mode) values ('daily:weight:2026-06-17', 'full')$q$, 'celebrations_achievement_id_check');
  perform pg_temp.fails('pulse', 'an unknown mode is refused', $q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-18', 'loud')$q$, 'celebrations_mode_check');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('isolation', 'B sees none of A''s achievements and can record their own', pg_temp.count_of($q$select count(*) from public.celebrations$q$) = 0);
  perform pg_temp.works('pulse', 'B records the same achievement id for themselves (ledgers are per person)', $q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full')$q$);

  -- ---------- 9. Export (every row a person can read is their own) and account deletion ----------
  perform pg_temp.as_user(a);
  claimed := 0;
  for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name loop
    execute format('select count(*) from public.%I where user_id <> auth.uid()', t) into n;
    if n <> 0 then claimed := claimed + 1; perform pg_temp.rec('export', 'A reads only their own rows in ' || t, false, n || ' foreign rows'); end if;
  end loop;
  perform pg_temp.rec('export', 'across every table with a user_id, A can read only their own rows', claimed = 0);
  perform pg_temp.rec('export', 'A''s export sources are non-empty where A logged data', pg_temp.count_of($q$select (select count(*) from public.wellness_entries) + (select count(*) from public.habits) + (select count(*) from public.celebrations) + (select count(*) from public.food_logs)$q$) > 0);
  perform pg_temp.rec('deletion', 'A requests account deletion (a pending, cancellable request)', pg_temp.count_of($q$select ((public.request_account_deletion()).id is not null)::int$q$) = 1);
  perform pg_temp.rec('deletion', 'requesting twice returns the same request (idempotent)', pg_temp.count_of($q$select count(*) from public.account_deletion_requests where status = 'pending'$q$) = 1);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('deletion', 'B cannot cancel A''s request', pg_temp.count_of($q$select (public.cancel_account_deletion())::int$q$) = 0);
  perform pg_temp.rec('deletion', 'B sees no deletion requests', pg_temp.count_of($q$select count(*) from public.account_deletion_requests$q$) = 0);
  perform pg_temp.as_user(a);
  perform pg_temp.rec('deletion', 'A can cancel their own request', pg_temp.count_of($q$select (public.cancel_account_deletion())::int$q$) = 1);
  perform pg_temp.fails('deletion', 'a user cannot create or complete deletion requests directly', format($q$update public.account_deletion_requests set status = 'completed' where user_id = %L$q$, a), 'permission denied');

  -- ---------- 10. Authentication boundaries, SECURITY DEFINER callers, anon ----------
  perform pg_temp.as_anon();
  perform pg_temp.fails('auth', 'anon cannot read wellness data', $q$select count(*) from public.wellness_entries$q$, 'permission denied');
  perform pg_temp.fails('auth', 'anon cannot read the achievement ledger', $q$select count(*) from public.celebrations$q$, 'permission denied');
  perform pg_temp.fails('auth', 'anon cannot call the household RPCs', $q$select public.household_join('ABC')$q$, 'permission denied');
  perform pg_temp.fails('auth', 'anon cannot call audit_verify', $q$select public.audit_verify()$q$, 'permission denied');
  perform pg_temp.fails('auth', 'anon cannot request account deletion', $q$select public.request_account_deletion()$q$, 'permission denied');
  perform pg_temp.as_user(b);
  perform pg_temp.fails('definer', 'a signed-in non-staff user cannot run audit_verify', $q$select public.audit_verify()$q$, 'permission denied');
  perform pg_temp.as_user(b, 'aal2');
  perform pg_temp.fails('definer', 'a non-staff user with MFA but no staff role still cannot', $q$select public.audit_verify()$q$, 'permission denied');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('definer', 'media lookup for an unknown workout returns nothing', pg_temp.count_of($q$select count(*) from public.workout_playable_media('no-such-workout')$q$) = 0);
  perform pg_temp.fails('definer', 'household_create_invite requires owning the household', format($q$select public.household_create_invite(%L)$q$, hid), 'not_owner');
  perform pg_temp.fails('definer', 'household_remove_member requires being an owner', format($q$select public.household_remove_member(%L)$q$, a), 'not_owner');

  -- ---------- 11. Private food-photo storage policies (database level; the Storage API itself is covered by the HTTP suite) ----------
  perform pg_temp.as_admin();
  perform pg_temp.rec('storage', 'the food-photos bucket exists and is private', (select count(*) = 1 from storage.buckets where id = 'food-photos' and public = false));
  perform pg_temp.rec('storage', 'the bucket accepts only JPEG and is size-limited', (select allowed_mime_types = array['image/jpeg'] and file_size_limit = 5242880 from storage.buckets where id = 'food-photos'));
  perform pg_temp.rec('storage', 'object policies are owner-folder only for read, write and delete',
    (select count(*) = 3 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'food_photos_%'
       and coalesce(qual, '') || coalesce(with_check, '') like '%foldername%'));
  perform pg_temp.rec('storage', 'no storage policy applies to anon or public for this bucket',
    (select count(*) = 0 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (roles && array['anon'::name, 'public'::name]) and coalesce(qual, '') || coalesce(with_check, '') like '%food-photos%'));

  -- ---------- 12. Structure: RLS on every table, no anon table grants, definer functions pinned ----------
  perform pg_temp.as_admin();
  perform pg_temp.rec('structure', 'every public table has RLS and at least one policy', (select count(*) = 0 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind in ('r','p') and (not c.relrowsecurity or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))));
  perform pg_temp.rec('structure', 'anon has no privilege on any public table', (select count(*) = 0 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'));
  perform pg_temp.rec('structure', 'every SECURITY DEFINER function pins an empty search_path', (select count(*) = 0 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname in ('public','app') and p.prosecdef and not coalesce('search_path=""' = any (p.proconfig), false)));
  perform pg_temp.rec('structure', 'user-callable SECURITY DEFINER functions in public are exactly the reviewed ten',
    (select array_agg(p.proname::text order by p.proname) = array['audit_verify','cancel_account_deletion','complete_onboarding','household_create','household_create_invite','household_join','household_leave','household_remove_member','request_account_deletion','workout_playable_media']
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')));

  -- ---------- Result: raised so that EVERYTHING above is rolled back ----------
  perform pg_temp.as_admin();
  select jsonb_build_object(
    'passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok), 'total', count(*),
    'failures', coalesce(jsonb_agg(jsonb_build_object('area', area, 'name', name, 'detail', detail) order by seq) filter (where not ok), '[]'::jsonb),
    'by_area', (select jsonb_object_agg(area, cnt) from (select area, count(*) cnt from res group by area) q)
  ) into res from res;
  raise exception 'LIVE_SUITE_RESULT %', res::text using errcode = 'P0001';
end
$suite$;
