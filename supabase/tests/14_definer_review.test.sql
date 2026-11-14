-- Review guard for SECURITY DEFINER functions in the exposed `public` schema (the Supabase advisor flags every one callable by signed-in users).
-- Each of these is intentionally user-callable and checks the caller inside; this test pins that set so a NEW user-callable definer function
-- cannot slip in unreviewed, and re-proves the properties that make the existing ones safe.
do $$
declare r record; a uuid; b uuid; n int;
  allowed text[] := array['audit_verify','cancel_account_deletion','complete_onboarding','household_create','household_create_invite',
                          'household_join','household_leave','household_remove_member','request_account_deletion','workout_playable_media'];
  actual text[];
begin
  -- 1. Every definer function in public pins an empty search_path and is not executable by anon or PUBLIC.
  for r in select p.oid, p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef loop
    perform test.assert(r.proconfig is not null and 'search_path=""' = any (r.proconfig), format('public.%s pins an empty search_path', r.proname));
    perform test.assert(not has_function_privilege('anon', r.oid, 'execute'), format('anon cannot execute public.%s', r.proname));
  end loop;

  -- 2. The set of definer functions that signed-in users may execute is exactly the reviewed allowlist.
  select array_agg(p.proname order by p.proname) into actual from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute');
  perform test.assert(actual = allowed, format('user-callable definer functions equal the reviewed list (got %s)', actual));

  -- 3. Behaviour: self-scoped, and denied to the wrong people.
  perform test.as_admin();
  a := test.make_user('definer-a@example.test'); b := test.make_user('definer-b@example.test');
  perform test.as_anon();
  perform test.throws($q$select public.audit_verify()$q$, 'permission denied');
  perform test.throws($q$select public.request_account_deletion()$q$, 'permission denied');
  perform test.as_user(a);
  perform test.throws($q$select public.audit_verify()$q$, 'permission denied');   -- signed in but not staff
  perform test.assert((select count(*) = 0 from public.workout_playable_media('no-such-workout')), 'media lookup for an unknown or unpublished workout returns nothing');
  perform public.request_account_deletion();
  perform test.as_user(b);
  perform test.assert(not public.cancel_account_deletion(), 'one person cannot cancel another person''s deletion request');
  perform test.throws($q$select public.complete_onboarding()$q$, 'profile_incomplete');   -- acts only on the caller's own (empty) profile
  perform test.as_user(a);
  perform test.assert(public.cancel_account_deletion(), 'the owner can cancel their own request');
end $$;
