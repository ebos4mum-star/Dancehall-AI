-- Social (proposed). Runs after community.up.sql and social.up.sql on a throwaway database. Privacy first: nobody but the server can touch anything,
-- and nothing about food, weight or health can be shared.
do $$ begin
  perform test.as_admin();
  perform test.assert(not has_function_privilege('anon', 'public.social_rpc(text, jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.social_rpc(text, jsonb)', 'execute'), 'the door is closed to clients');
  perform test.assert(has_function_privilege('service_role', 'public.social_rpc(text, jsonb)', 'execute'), 'the server can use the door');
  perform test.assert(not (select prosecdef from pg_proc where oid = 'public.social_rpc(text, jsonb)'::regprocedure), 'the door runs as its caller');
end $$;

-- 1. Structure and privileges.
do $$
declare t text; f record;
begin
  perform test.as_admin();
  foreach t in array array['social_friendships', 'social_blocks', 'social_shares', 'social_groups', 'social_group_members', 'social_contributions'] loop
    perform test.assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS enabled');
    perform test.assert(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t), t || ' carries a policy');
    perform test.assert(not has_table_privilege('anon', 'public.' || t, 'select'), 'anon cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'select'), 'signed-in users cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'insert'), 'signed-in users cannot write ' || t);
  end loop;
  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'social\_%' loop
    perform test.assert(not has_function_privilege('anon', f.oid, 'execute'), 'anon cannot execute app.' || f.proname);
    perform test.assert(not has_function_privilege('authenticated', f.oid, 'execute'), 'signed-in users cannot execute app.' || f.proname);
    perform test.assert(has_function_privilege('service_role', f.oid, 'execute'), 'the server can execute app.' || f.proname);
    if f.prosecdef then perform test.assert(f.proconfig is not null and 'search_path=""' = any (f.proconfig), 'app.' || f.proname || ' pins an empty search_path'); end if;
  end loop;
  perform test.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'social%' and p.proname <> 'social_rpc'), 'nothing social is exposed in public except the door');
  -- The shareable categories are exactly one, and no column anywhere in the social tables can hold food, weight or health data.
  perform test.assert((select count(*) = 1 from pg_constraint where conrelid = 'public.social_shares'::regclass and pg_get_constraintdef(oid) like '%activity_summary%'), 'sharing is limited to the activity summary');
  perform test.assert(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name like 'social\_%' and column_name ~* '(food|kcal|calorie|weight|health|photo|location|meal)'),
                      'no social column can hold food, weight, health, photo or location data');
end $$;

-- 2. Clients are really refused.
do $$
declare a uuid;
begin
  perform test.as_admin();
  a := test.make_user('s-priv-a@example.test');
  perform test.as_user(a);
  perform test.throws($q$select * from public.social_friendships$q$, 'permission denied');
  perform test.throws($q$insert into public.social_shares (owner_id, viewer_id, category) values (auth.uid(), auth.uid(), 'activity_summary')$q$, 'permission denied');
  perform test.throws($q$select app.social_overview(auth.uid())$q$, 'permission denied');
  perform test.throws($q$select public.social_rpc('social_overview', '{}')$q$, 'permission denied');
  perform test.as_anon();
  perform test.throws($q$select app.social_overview(null)$q$, 'permission denied');
end $$;

-- 3. Behaviour (run as the server).
do $$
declare a uuid; b uuid; c uuid; d uuid; g uuid; r jsonb; n int;
begin
  perform test.as_admin();
  a := test.make_user('s-a@example.test'); b := test.make_user('s-b@example.test'); c := test.make_user('s-c@example.test'); d := test.make_user('s-d@example.test');
  perform app.community_claim_username(a, 'ama_social'); perform app.community_claim_username(b, 'kofi_social');
  perform app.community_claim_username(c, 'esi_social'); perform app.community_claim_username(d, 'yaw_social');

  -- a person without a public name cannot ask, and cannot start a group
  perform test.throws(format($q$select app.social_request(%L, 'kofi_social')$q$, test.make_user('s-noname@example.test')), 'needs_username');
  perform test.throws(format($q$select app.social_create_group(%L, 'challenge', 'x', 'active_days', null, current_date, current_date + 3, array[]::text[])$q$, (select id from auth.users where email = 's-noname@example.test')), 'needs_username');
  -- friend requests
  perform test.assert(app.social_request(a, 'kofi_social') = 'requested', 'a request is made');
  perform test.throws($q$select app.social_request((select user_id from public.community_members where username = 'ama_social'), 'kofi_social')$q$, 'already_requested');
  perform test.throws($q$select app.social_respond((select user_id from public.community_members where username = 'ama_social'), 'kofi_social', true)$q$, 'no_request');   -- only the person asked can accept
  perform test.throws($q$select app.social_request((select user_id from public.community_members where username = 'ama_social'), 'ama_social')$q$, 'self');
  perform test.throws($q$select app.social_request((select user_id from public.community_members where username = 'ama_social'), 'nobody_here')$q$, 'not_found');
  perform app.social_respond(b, 'ama_social', true);
  perform test.assert(app.social_friends(a, b), 'they are friends');
  perform test.assert(app.social_lists(a) -> 'friends' = '["kofi_social"]'::jsonb, 'the list shows the friend by username');
  perform test.assert(app.social_lists(a)::text !~ '[0-9a-f]{8}-[0-9a-f]{4}', 'the list carries no ids');

  -- sharing: nothing until chosen, only the activity summary, per friend, revocable
  perform test.throws(format($q$select app.social_set_share(%L, 'kofi_social', 'food_diary', true)$q$, a), 'invalid_category');
  perform test.throws(format($q$select app.social_set_share(%L, 'kofi_social', 'weight', true)$q$, a), 'invalid_category');
  perform test.throws(format($q$select app.social_set_share(%L, 'esi_social', 'activity_summary', true)$q$, a), 'not_friends');
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values (a, 'Dancehall Basics', 30, 'completed', now() - interval '1 day', 1800), (a, 'Dancehall Basics', 30, 'completed', now() - interval '1 day' + interval '4 minutes', 1800);   -- the second is a repeat of the first and counts once
  insert into public.weight_entries (user_id, weight_kg) values (a, 70) on conflict do nothing;
  perform test.assert(app.social_view_friend(b, 'ama_social') -> 'activity' = 'null'::jsonb, 'nothing is visible until the owner turns it on');
  perform app.social_set_share(a, 'kofi_social', 'activity_summary', true);
  r := app.social_view_friend(b, 'ama_social');
  perform test.assert((r -> 'activity' ->> 'sessions')::int = 1 and (r -> 'activity' ->> 'minutes')::int = 30, 'the friend sees the weekly activity summary');
  perform test.assert(r::text !~* '(weight|kcal|food|70)', 'the view carries no weight or food data');
  perform test.assert(app.social_view_friend(a, 'kofi_social') -> 'activity' = 'null'::jsonb, 'sharing is one way');
  perform app.social_set_share(a, 'kofi_social', 'activity_summary', false);
  perform test.assert(app.social_view_friend(b, 'ama_social') -> 'activity' = 'null'::jsonb, 'turning it off is immediate');

  -- remove ends shares both ways
  perform app.social_set_share(a, 'kofi_social', 'activity_summary', true);
  perform app.social_remove(a, 'kofi_social');
  perform test.assert((select count(*) = 0 from public.social_shares), 'removing a friend removes the shares');
  perform test.throws(format($q$select app.social_view_friend(%L, 'ama_social')$q$, b), 'not_friends');

  -- blocking: indistinguishable from "not found", severs everything
  perform app.social_request(a, 'kofi_social'); perform app.social_respond(b, 'ama_social', true);
  perform app.social_set_share(b, 'ama_social', 'activity_summary', true);
  perform app.social_block(a, 'kofi_social');
  perform test.assert((select count(*) = 0 from public.social_friendships) and (select count(*) = 0 from public.social_shares), 'blocking severs the friendship and the shares');
  perform test.throws(format($q$select app.social_request(%L, 'ama_social')$q$, b), 'not_found');
  perform test.assert(app.social_lists(b) -> 'friends' = '[]'::jsonb, 'the blocked person sees nothing');
  perform app.social_unblock(a, 'kofi_social');

  -- groups
  perform app.social_request(a, 'kofi_social'); perform app.social_respond(b, 'ama_social', true);
  perform test.throws(format($q$select app.social_create_group(%L, 'challenge', 'x', 'active_minutes', null, current_date, current_date + 6, array['esi_social'])$q$, a), 'not_friends');   -- strangers cannot be pulled in
  g := app.social_create_group(a, 'challenge', 'June moves', 'active_minutes', null, current_date - 3, current_date + 20, array['kofi_social']);
  perform test.assert((app.social_groups(b) -> 0 ->> 'iAm') = 'invited' and (app.social_groups(b) -> 0 -> 'byMember') = '[]'::jsonb, 'an invitee sees only the invitation');
  perform test.throws(format($q$select app.social_report(%L, %L, current_date, 20)$q$, b, g), 'not_member');
  perform app.social_respond_group(b, g, true);
  perform app.social_report(a, g, current_date, 5000);
  perform app.social_report(b, g, current_date, 20);
  perform test.throws(format($q$select app.social_report(%L, %L, current_date + 1, 20)$q$, a, g), 'closed');
  perform test.assert((select value = 600 from public.social_contributions where group_id = g and user_id = a), 'a day is clamped');
  perform test.assert((app.social_groups(b) -> 0 -> 'byMember' -> 0 ->> 'total')::int = 600, 'members see each joined member''s total');
  perform test.assert(app.social_groups(c) = '[]'::jsonb, 'a stranger sees no group');
  perform app.social_leave_group(b, g);
  perform test.assert((select count(*) = 0 from public.social_contributions where user_id = b), 'leaving removes the person''s numbers');
  perform test.assert(app.social_groups(b) = '[]'::jsonb, 'and their visibility');
  perform app.social_leave_group(a, g);
  perform test.assert((select count(*) = 0 from public.social_groups), 'an empty group disappears');
  -- couple goals are exactly two
  perform test.throws(format($q$select app.social_create_group(%L, 'couple', 'x', 'active_days', 4, current_date, current_date + 6, array[]::text[])$q$, a), 'invalid_input');

  -- account deletion removes everything
  perform app.social_set_share(a, 'kofi_social', 'activity_summary', true);
  perform app.social_block(c, 'yaw_social');
  g := app.social_create_group(a, 'family', 'Family', 'active_days', 4, current_date, current_date + 6, array['kofi_social']);
  perform app.social_respond_group(b, g, true);
  perform app.social_report(a, g, current_date, 30);
  delete from auth.users where id = a;
  select (select count(*) from public.social_friendships) + (select count(*) from public.social_shares) + (select count(*) from public.social_contributions) into n;
  perform test.assert(n = 0, 'deleting an account removes its friendships, shares and numbers');
  perform test.assert((select count(*) from public.social_blocks) = 1, 'other people''s blocks are untouched');
end $$;

-- 4. Numbers computed by the server, and withdrawal of all consent.
do $$
declare a uuid; b uuid; g uuid; n int; ru jsonb;
begin
  perform test.as_admin();
  a := test.make_user('s4-a@example.test'); b := test.make_user('s4-b@example.test');
  perform app.community_claim_username(a, 'ama_four'); perform app.community_claim_username(b, 'kofi_four');
  perform app.social_request(a, 'kofi_four'); perform app.social_respond(b, 'ama_four', true);
  g := app.social_create_group(a, 'challenge', 'Sync', 'active_minutes', null, current_date - 5, current_date + 5, array['kofi_four']);
  perform app.social_respond_group(b, g, true);
  -- a: 30 min yesterday, a duplicate of the same workout 4 minutes later (counts once), 20 min two days ago, an uncompleted plan and a future plan (ignored).
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values
    (a, 'Dancehall Basics', 30, 'completed', now() - interval '1 day', 1800),
    (a, 'Dancehall Basics', 30, 'completed', now() - interval '1 day' + interval '4 minutes', 1800),
    (a, 'Afrobeats', 20, 'completed', now() - interval '2 days', 1200);
  insert into public.workout_sessions (user_id, title, minutes, status, planned_for) values (a, 'Planned', 30, 'planned', current_date + 1);
  -- b's own workouts must never leak into a's numbers.
  insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values (b, 'Other', 60, 'completed', now() - interval '1 day', 3600);
  n := app.social_sync_group(a, g);
  perform test.assert(n = 2, 'two days have numbers');
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 50, 'the duplicate counted once: 30 + 20');
  perform test.assert((select count(*) = 0 from public.social_contributions where group_id = g and user_id = b), 'only my own workouts are read');
  perform app.social_sync_group(a, g);   -- idempotent
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 50, 'syncing again changes nothing');
  perform test.throws(format($q$select app.social_sync_group(%L, %L)$q$, (select id from auth.users where email = 's-c@example.test'), g), 'not_member');
  -- A day without a number after the workout is removed from the group on the next sync.
  delete from public.workout_sessions where user_id = a and title = 'Afrobeats';
  perform app.social_sync_group(a, g);
  perform test.assert((select sum(value) from public.social_contributions where group_id = g and user_id = a) = 30, 'numbers follow the workouts');
  -- consent withdrawal
  perform app.social_set_share(a, 'kofi_four', 'activity_summary', true);
  perform test.assert(app.social_revoke_all(a) = 1, 'one sharing choice withdrawn');
  perform test.assert(app.social_view_friend(b, 'ama_four') -> 'activity' = 'null'::jsonb, 'nothing is visible after withdrawal');
  -- the door: reused community functions work through social_rpc, others do not
  perform test.assert(public.social_rpc('community_burst', jsonb_build_object('p_key', 'soc:x', 'p_bucket', 'b', 'p_max', 2, 'p_seconds', 60)) = 'true'::jsonb, 'the shared rate limiter is reachable');
  perform test.throws($q$select public.social_rpc('community_create_post', '{}')$q$, 'not_found');
  perform test.throws($q$select public.social_rpc('community_moderate', '{}')$q$, 'not_found');
end $$;
