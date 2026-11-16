\set elig `cat supabase/tests/eligible-workout-cases.json`
select set_config('test.elig', :'elig', false) is not null as loaded \gset
-- Gamification + Apple Health import (proposed). Runs after community.up.sql, social.up.sql, health_sync.up.sql and gamification.up.sql on a throwaway database.
-- The server is the only writer; the ledger is idempotent; the league shows only opted-in, unblocked friends and one number.
do $$
declare f record; t text;
begin
  perform test.as_admin();
  foreach t in array array['gm_ledger', 'gm_league_optin'] loop
    perform test.assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS enabled');
    perform test.assert(not has_table_privilege('anon', 'public.' || t, 'select') and not has_table_privilege('authenticated', 'public.' || t, 'select'), 'clients cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'insert'), 'clients cannot write ' || t);
  end loop;
  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'gm\_%' loop
    perform test.assert(not has_function_privilege('anon', f.oid, 'execute') and not has_function_privilege('authenticated', f.oid, 'execute'), 'clients cannot execute app.' || f.proname);
    perform test.assert(has_function_privilege('service_role', f.oid, 'execute'), 'the server can execute app.' || f.proname);
    if f.prosecdef then perform test.assert(f.proconfig is not null and 'search_path=""' = any (f.proconfig), 'app.' || f.proname || ' pins an empty search_path'); end if;
  end loop;
  perform test.assert(has_function_privilege('service_role', 'public.gm_rpc(text, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.gm_rpc(text, jsonb)', 'execute'), 'only the server can use the door');
  perform test.assert(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name like 'gm\_%' and column_name ~* '(food|kcal|calorie|weight|health|photo|location)'), 'no gamification column can hold food, weight, health, photo or location data');
end $$;

-- Apple Health import columns.
do $$
declare a uuid; b uuid;
begin
  perform test.as_admin();
  a := test.make_user('gm-a@example.test'); b := test.make_user('gm-b@example.test');
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values (a, 'Apple Health: Running', 30, 'completed', now() - interval '1 hour', 1800, 'apple_health', 'hk-1');
  perform test.throws(format($q$insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values (%L, 'Apple Health: Running', 30, 'completed', now() - interval '2 hour', 1800, 'apple_health', 'hk-1')$q$, a), 'duplicate key');
  perform test.throws(format($q$insert into public.workout_sessions (user_id, title, minutes, status, completed_at, source) values (%L, 'x', 30, 'completed', now(), 'apple_health')$q$, a), 'import_has_id');
  perform test.throws(format($q$insert into public.workout_sessions (user_id, title, minutes, status, completed_at, source, external_id) values (%L, 'x', 30, 'completed', now(), 'manual', 'hk-9')$q$, a), 'import_has_id');
  -- the same source id for a different person is fine
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values (b, 'Apple Health: Walking', 20, 'completed', now() - interval '1 hour', 1200, 'apple_health', 'hk-1');
  perform test.assert((select count(*) from public.workout_sessions where external_id = 'hk-1') = 2, 'ids are unique per person, not globally');
end $$;

-- Ledger behaviour.
do $$
declare a uuid; b uuid; c uuid; r jsonb;
begin
  perform test.as_admin();
  a := (select id from auth.users where email = 'gm-a@example.test'); b := (select id from auth.users where email = 'gm-b@example.test'); c := test.make_user('gm-c@example.test');
  r := app.gm_inputs(a);
  perform test.assert(jsonb_array_length(r -> 'sessions') = 1 and (r -> 'sessions' -> 0 ->> 'source') = 'apple_health', 'inputs carry the person''s own sessions');
  perform test.assert(r::text !~* '(kcal|calor|weight)', 'inputs hold no food or weight values');
  perform test.assert((app.gm_inputs(b) -> 'sessions' -> 0 ->> 'id') <> (r -> 'sessions' -> 0 ->> 'id'), 'inputs never mix people');

  r := app.gm_record(a, jsonb_build_array(
    jsonb_build_object('id', 'workout:w1', 'kind', 'workout', 'day', current_date, 'xp', 30),
    jsonb_build_object('id', 'meal:' || current_date, 'kind', 'meal_day', 'day', current_date, 'xp', 5)));
  perform test.assert((r ->> 'totalXp')::int = 35 and (r ->> 'added')::int = 2, 'events are recorded');
  r := app.gm_record(a, jsonb_build_array(jsonb_build_object('id', 'workout:w1', 'kind', 'workout', 'day', current_date, 'xp', 30)));
  perform test.assert((r ->> 'totalXp')::int = 35 and (r ->> 'added')::int = 0, 'a replayed event pays nothing');
  r := app.gm_record(a, jsonb_build_array(jsonb_build_object('id', 'workout:big', 'kind', 'workout', 'day', current_date, 'xp', 100)));
  perform test.assert((r ->> 'totalXp')::int = 35 + 45, 'a workout is capped at its maximum whatever the client says');
  perform test.throws(format($q$select app.gm_record(%L, '[{"id":"workout:x","kind":"calories","day":"2026-01-01","xp":5}]')$q$, a), 'invalid_input');
  perform test.throws(format($q$select app.gm_record(%L, jsonb_build_array(jsonb_build_object('id','workout:future','kind','workout','day', current_date + 30,'xp',5)))$q$, a), 'invalid_input');
  perform test.throws(format($q$select app.gm_record(%L, jsonb_build_array(jsonb_build_object('id','workout:old','kind','workout','day', current_date - 200,'xp',5)))$q$, a), 'invalid_input');
  perform test.throws(format($q$select app.gm_record(%L, jsonb_build_array(jsonb_build_object('id','meal:bad','kind','workout','day', current_date,'xp',5)))$q$, a), 'check');
  perform test.throws(format($q$select app.gm_record(%L, '{"not":"an array"}')$q$, a), 'invalid_input');
  perform test.assert((app.gm_state(b) ->> 'totalXp')::int = 0, 'another person''s total is untouched');
  -- the door
  r := public.gm_rpc('gm_state', jsonb_build_object('p_user', a));
  perform test.assert((r ->> 'totalXp')::int = 80, 'the door returns the person''s state');
  perform test.throws($q$select public.gm_rpc('social_overview', '{}')$q$, 'not_found');
  perform test.throws($q$select public.gm_rpc('gm_nothing', '{}')$q$, 'not_found');
end $$;

-- League.
do $$
declare a uuid; b uuid; c uuid; r jsonb;
begin
  perform test.as_admin();
  a := (select id from auth.users where email = 'gm-a@example.test'); b := (select id from auth.users where email = 'gm-b@example.test'); c := (select id from auth.users where email = 'gm-c@example.test');
  perform app.community_claim_username(a, 'gm_ama'); perform app.community_claim_username(b, 'gm_kofi'); perform app.community_claim_username(c, 'gm_esi');
  perform app.gm_record(b, jsonb_build_array(jsonb_build_object('id', 'workout:b1', 'kind', 'workout', 'day', current_date, 'xp', 20)));
  perform app.gm_record(c, jsonb_build_array(jsonb_build_object('id', 'workout:c1', 'kind', 'workout', 'day', current_date, 'xp', 40)));
  perform test.assert(app.gm_league(a) = '[]'::jsonb, 'no league until the person opts in');
  perform app.gm_set_league(a, true);
  perform test.assert(jsonb_array_length(app.gm_league(a)) = 1, 'alone in the league: only me');
  perform app.social_request(a, 'gm_kofi'); perform app.social_respond(b, 'gm_ama', true);
  perform test.assert(jsonb_array_length(app.gm_league(a)) = 1, 'a friend who has not opted in is not shown');
  perform app.gm_set_league(b, true);
  r := app.gm_league(a);
  perform test.assert(jsonb_array_length(r) = 2 and (r -> 0 ->> 'username') in ('gm_kofi', 'gm_ama'), 'an opted-in friend appears');
  perform test.assert(r::text !~ '[0-9a-f]{8}-[0-9a-f]{4}', 'the league carries no ids');
  perform test.assert((select count(*) from jsonb_object_keys(r -> 0)) = 3, 'a row holds only username, weekXp and isMe');
  perform app.gm_set_league(c, true);
  perform test.assert(jsonb_array_length(app.gm_league(a)) = 2, 'a stranger who opted in does not appear for me');
  perform app.social_block(a, 'gm_kofi');
  perform test.assert(jsonb_array_length(app.gm_league(a)) = 1 and jsonb_array_length(app.gm_league(b)) = 1, 'blocking removes both sides from each other''s league');
  perform app.gm_set_league(a, false);
  perform test.assert(app.gm_league(a) = '[]'::jsonb, 'leaving the league empties it');
  perform test.throws(format($q$select app.gm_set_league(%L, true)$q$, test.make_user('gm-noname@example.test')), 'needs_username');
end $$;

-- Deleting an account removes the ledger and the opt-in.
do $$
declare a uuid;
begin
  perform test.as_admin();
  a := (select id from auth.users where email = 'gm-a@example.test');
  delete from auth.users where id = a;
  perform test.assert(not exists (select 1 from public.gm_ledger where user_id = a) and not exists (select 1 from public.gm_league_optin where user_id = a), 'deleting the account removes the ledger and the opt-in');
end $$;

-- One physical workout counts once: the same cases the TypeScript rule is tested with (packages/shared/src/eligible-workouts.test.ts), in both insertion orders.
do $$
declare c jsonb; s jsonb; u uuid; got text[]; want text[]; n int := 0; pass int;
begin
  perform test.as_admin();
  for c in select * from jsonb_array_elements(current_setting('test.elig')::jsonb -> 'cases') loop
    for pass in 1 .. 2 loop
      n := n + 1;
      u := test.make_user('elig-' || n || '@example.test');
      for s in select * from jsonb_array_elements(case when pass = 1 then c -> 'sessions' else (select jsonb_agg(x order by ord desc) from jsonb_array_elements(c -> 'sessions') with ordinality t(x, ord)) end) loop
        insert into public.workout_sessions (user_id, title, style, minutes, status, completed_at, duration_s, planned_for, source, external_id)
        values (u, s ->> 'title', s ->> 'id', (s ->> 'minutes')::int, s ->> 'status', (s ->> 'completedAt')::timestamptz,
                (s ->> 'durationS')::int, case when s ->> 'status' = 'planned' then current_date + 1 end, s ->> 'source',
                case when s ->> 'source' = 'apple_health' then 'hk-' || (s ->> 'id') end);
      end loop;
      select coalesce(array_agg(w.style order by w.style), '{}') into got from app.eligible_workouts(u) w;
      select coalesce(array_agg(x order by x), '{}') into want from jsonb_array_elements_text(c -> 'keep') x;
      perform test.assert(got = want, format('%s (insertion order %s): got %s, wanted %s', c ->> 'name', pass, got, want));
    end loop;
  end loop;
end $$;

-- Group Goals, the friend summary, XP inputs and the league see the same deduplicated activity, through delayed imports, edits and deletions.
do $$
declare a uuid; b uuid; g uuid; r jsonb; mins int; sid uuid; xp0 int; xp1 int;
begin
  perform test.as_admin();
  a := test.make_user('elig-grp-a@example.test'); b := test.make_user('elig-grp-b@example.test');
  perform app.community_claim_username(a, 'elig_ama'); perform app.community_claim_username(b, 'elig_kofi');
  perform app.social_request(a, 'elig_kofi'); perform app.social_respond(b, 'elig_ama', true);
  g := app.social_create_group(a, 'challenge', 'Same session', 'active_minutes', null, current_date - 3, current_date + 3, array['elig_kofi']);
  perform app.social_respond_group(b, g, true);
  perform app.social_set_share(a, 'elig_kofi', 'activity_summary', true);

  -- Order 1: the watch workout is imported FIRST (days of delay do not matter, only the times), the guided session is saved afterwards.
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id)
  values (a, 'Apple Health: Dance', 31, 'completed', now() - interval '1 day' + interval '1 minute', 1860, 'apple_health', 'hk-a-1');
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 31, 'the import alone counts');
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values (a, 'Guided class', 30, 'completed', now() - interval '1 day', 1800);
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 30, 'once the guided session is saved the same workout is not added twice (30, not 61)');
  perform test.assert((app.social_view_friend(b, 'elig_ama') -> 'activity' ->> 'sessions')::int = 1, 'the friend summary sees one workout');

  -- A legitimate separate workout the same day is kept.
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id)
  values (a, 'Apple Health: Run', 20, 'completed', now() - interval '1 day' + interval '6 hours', 1200, 'apple_health', 'hk-a-2');
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 50, 'a separate workout the same day still counts (30 + 20)');
  perform test.assert((app.social_view_friend(b, 'elig_ama') -> 'activity' ->> 'sessions')::int = 2, 'the friend summary counts both');

  -- Edit: the guided session is moved to another time, so the import is a separate workout and counts again.
  update public.workout_sessions set completed_at = now() - interval '2 days', duration_s = 1800 where user_id = a and title = 'Guided class';
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 81, 'after an edit the records are separate workouts (30 + 31 + 20)');
  -- Delete: the guided session is deleted and its overlapping import counts again.
  update public.workout_sessions set completed_at = now() - interval '1 day', duration_s = 1800 where user_id = a and title = 'Guided class';
  delete from public.workout_sessions where user_id = a and title = 'Guided class';
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 51, 'after the guided session is deleted the import counts alone (31 + 20)');

  -- XP and the league use the same eligible set.
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values (a, 'Guided class', 30, 'completed', now() - interval '1 day', 1800);
  r := app.gm_inputs(a);
  perform test.assert(jsonb_array_length(r -> 'sessions') = 2, 'XP inputs list two workouts, not three');
  perform test.assert(not exists (select 1 from jsonb_array_elements(r -> 'sessions') x where x ->> 'source' = 'apple_health' and (x ->> 'completedAt')::timestamptz = (now() - interval '1 day' + interval '1 minute')),
                      'the duplicate import is not among the XP inputs');
  perform test.assert(not has_function_privilege('anon', 'app.eligible_workouts(uuid, timestamptz)', 'execute') and not has_function_privilege('authenticated', 'app.eligible_workouts(uuid, timestamptz)', 'execute')
                      and has_function_privilege('service_role', 'app.eligible_workouts(uuid, timestamptz)', 'execute'), 'only the server can call the eligibility function');
end $$;
