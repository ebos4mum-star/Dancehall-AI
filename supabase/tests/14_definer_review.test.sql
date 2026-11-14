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

-- 4. The household trigger function (SECURITY DEFINER, in the unexposed `app` schema) must not be executable through PUBLIC, anon or signed-in
--    roles, yet the trigger must keep working: deleting a membership still promotes an heir or removes an empty household.
do $$
declare f oid := 'app.household_after_member_delete()'::regprocedure; a uuid; b uuid; h uuid; code text;
begin
  perform test.assert(not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where p.oid = f and x.grantee = 0 and x.privilege_type = 'EXECUTE'),
    'PUBLIC has no execute on app.household_after_member_delete()');
  perform test.assert(not has_function_privilege('anon', f, 'execute'), 'anon cannot execute the household trigger function');
  perform test.assert(not has_function_privilege('authenticated', f, 'execute'), 'signed-in users cannot execute the household trigger function');
  perform test.assert((select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_proc p where p.oid = f), 'its SECURITY DEFINER and empty search_path are unchanged');
  perform test.assert(exists (select 1 from pg_trigger where tgname = 'household_members_after_delete' and tgfoid = f and not tgisinternal), 'the trigger still points at it');

  -- The trigger still fires for signed-in users (who hold no execute privilege on the function): owner leaves -> the member inherits ownership;
  -- last member leaves -> the household is deleted.
  perform test.as_admin();
  a := test.make_user('trigger-a@example.test'); b := test.make_user('trigger-b@example.test');
  perform test.as_user(a); h := public.household_create('Trigger test');
  code := public.household_create_invite(h);
  perform test.as_user(b); perform public.household_join(code);
  -- Deleting an account cascades to the membership, which fires the trigger.
  perform test.as_admin();
  delete from public.profiles where id = a;
  perform test.assert((select role = 'owner' from public.household_members where household_id = h and member_id = b), 'the remaining member inherits ownership');
  delete from public.profiles where id = b;
  perform test.assert(not exists (select 1 from public.households where id = h), 'the last member leaving removes the household');
end $$;
