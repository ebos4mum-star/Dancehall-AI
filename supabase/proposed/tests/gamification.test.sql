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
