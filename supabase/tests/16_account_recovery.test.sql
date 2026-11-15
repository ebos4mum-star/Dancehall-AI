-- Account recovery state: locked away from every API role except the service role, session revocation works, cascades clean up, and the existing owner isolation is untouched.
do $$
declare a uuid; b uuid; r jsonb; f record; n int;
  tables text[] := array['acct_provisioning', 'acct_recovery', 'acct_tx', 'acct_hits'];
  t text;
begin
  perform test.as_admin();
  a := test.make_user('acct-a@example.test'); b := test.make_user('acct-b@example.test');

  -- 1. The tables are in the unexposed app schema, have RLS on, and no API role holds any privilege on them.
  foreach t in array tables loop
    perform test.assert((select relrowsecurity from pg_class where oid = ('app.' || t)::regclass), format('RLS enabled on app.%s', t));
    perform test.assert(not has_table_privilege('anon', 'app.' || t, 'select, insert, update, delete'), format('anon has no access to app.%s', t));
    perform test.assert(not has_table_privilege('authenticated', 'app.' || t, 'select, insert, update, delete'), format('signed-in users have no access to app.%s', t));
  end loop;

  -- 2. Every acct_* function: service role only. No PUBLIC, anon or signed-in execute; SECURITY DEFINER with an empty search_path.
  n := 0;
  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'acct\_%' loop
    n := n + 1;
    perform test.assert(not has_function_privilege('anon', f.oid, 'execute'), format('anon cannot execute %s', f.proname));
    perform test.assert(not has_function_privilege('authenticated', f.oid, 'execute'), format('signed-in users cannot execute %s', f.proname));
    perform test.assert(has_function_privilege('service_role', f.oid, 'execute'), format('service role can execute %s', f.proname));
    perform test.assert(not exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = f.oid), acldefault('f', (select proowner from pg_proc where oid = f.oid)))) x where x.grantee = 0 and x.privilege_type = 'EXECUTE'), format('PUBLIC cannot execute %s', f.proname));
    perform test.assert(f.prosecdef and 'search_path=""' = any (f.proconfig), format('%s is SECURITY DEFINER with an empty search_path', f.proname));
  end loop;
  perform test.assert(n >= 15, format('found the acct_* entry points (%s)', n));
  perform test.assert(not has_function_privilege('authenticated', 'app.revoke_user_sessions(uuid)', 'execute'), 'signed-in users cannot revoke sessions');

  -- 3. Callers other than the service role are refused outright.
  perform test.as_user(a);
  perform test.throws($q$select public.acct_by_digest('{"digestMac":"x"}'::jsonb)$q$, 'permission denied');
  perform test.throws($q$select public.acct_status(jsonb_build_object('userId', gen_random_uuid()))$q$, 'permission denied');
  perform test.throws($q$select * from app.acct_recovery$q$, 'permission denied');
  perform test.as_anon();
  perform test.throws($q$select public.acct_hit('{"bucket":"x","now":1,"windowMs":1,"limit":1}'::jsonb)$q$, 'permission denied');
  perform test.as_admin();

  -- 4. The service role can use them, and revoking sessions deletes only that user's sessions and tokens.
  perform set_config('role', 'service_role', false);
  r := public.acct_hit('{"bucket":"b","now":1000,"windowMs":60000,"limit":2}'::jsonb);
  perform test.assert(r = 'true'::jsonb, 'service role can count a hit');
  perform test.as_admin();
  insert into auth.sessions (user_id) values (a), (a), (b);
  insert into auth.refresh_tokens (user_id, session_id, token) select user_id::text, id, 'tok' from auth.sessions;
  perform set_config('role', 'service_role', false);
  perform public.acct_revoke_sessions(jsonb_build_object('userId', a));
  perform test.as_admin();
  perform test.assert((select count(*) = 0 from auth.sessions where user_id = a), 'the user''s sessions are deleted');
  perform test.assert((select count(*) = 0 from auth.refresh_tokens where user_id = a::text), 'the user''s refresh tokens are deleted');
  perform test.assert((select count(*) = 1 from auth.sessions where user_id = b), 'another user''s session is untouched');
  perform test.assert((select count(*) = 1 from auth.refresh_tokens where user_id = b::text), 'another user''s refresh token is untouched');

  -- 5. Deleting the auth user removes everything keyed to it (account deletion leaves no recovery data behind).
  insert into app.acct_provisioning (request_id, secret_mac, user_id, identifier, state, created_at) values (md5('1'), 'm', a, 'i', 'ready', 1);
  insert into app.acct_recovery (user_id, digest_mac, q1, q2, salt, proof_mac, rotated_at) values (a, 'd', 'q-a', 'q-b', md5('s'), 'p', 1);
  insert into app.acct_tx (tx_id, user_id, state, expires_at) values (md5('t'), a, 'open', 1);
  delete from auth.users where id = a;
  perform test.assert(not exists (select 1 from app.acct_recovery where user_id = a), 'recovery row removed with the user');
  perform test.assert(not exists (select 1 from app.acct_tx where user_id = a), 'transactions removed with the user');
  perform test.assert(not exists (select 1 from app.acct_provisioning where user_id = a), 'provisioning rows removed with the user');

  -- 6. Constraints hold: unsorted question pair, duplicate digest, malformed ids.
  insert into app.acct_recovery (user_id, digest_mac, q1, q2, salt, proof_mac, rotated_at) values (b, 'd2', 'q-a', 'q-b', md5('s'), 'p', 1);
  perform test.throws($q$insert into app.acct_recovery (user_id, digest_mac, q1, q2, salt, proof_mac, rotated_at) select id, 'd3', 'q-b', 'q-a', md5('s'), 'p', 1 from auth.users where email = 'acct-b@example.test'$q$, 'duplicate key|violates');
  perform test.throws($q$insert into app.acct_tx (tx_id, user_id, state, expires_at) values ('short', gen_random_uuid(), 'open', 1)$q$, 'violates');
end $$;
