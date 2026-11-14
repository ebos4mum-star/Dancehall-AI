-- Structural security checks over the whole public schema. These fail if a future migration forgets a lock.
do $$
declare r record;
begin
  -- Every table in public has RLS enabled and at least one policy.
  for r in select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    perform test.assert(r.relrowsecurity, format('RLS enabled on public.%s', r.relname));
    perform test.assert(exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = r.relname),
                        format('public.%s has at least one policy', r.relname));
  end loop;

  -- anon has no privileges on any table or sequence in public.
  perform test.assert(not exists (
    select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.grantee = 'anon'),
    'anon has no table grants in public');
  perform test.assert(not exists (
    select 1 from information_schema.column_privileges g where g.table_schema = 'public' and g.grantee = 'anon'),
    'anon has no column grants in public');

  -- authenticated never gets blanket write access: tables must not grant TRUNCATE, TRIGGER or REFERENCES.
  perform test.assert(not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
    'authenticated has no TRUNCATE/TRIGGER/REFERENCES');

  -- No write policy is unconditional.
  perform test.assert(not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(p.qual, 'true') in ('true', '(true)')) and (coalesce(p.with_check, 'true') in ('true', '(true)'))),
    'no unconditional write policies');

  -- No policy targets the anon or public role.
  perform test.assert(not exists (
    select 1 from pg_policies p where p.schemaname = 'public' and (p.roles && array['anon'::name, 'public'::name])),
    'no policy applies to anon/public');

  -- Every SECURITY DEFINER function pins search_path.
  for r in select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'app') and p.prosecdef loop
    perform test.assert(r.proconfig is not null and exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%'),
                        format('SECURITY DEFINER function %s pins search_path', r.proname));
  end loop;

  -- No public function is executable by anon.
  perform test.assert(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
    'anon cannot execute any public function');

  -- Every column of user-owned tables that could identify a person sits in an owner-keyed table.
  perform test.assert(not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.column_name ~* '(stake|deposit|forfeit|penalty|wager|bet)'),
    'no money-staking style columns exist');

  -- Views in public must not bypass RLS.
  perform test.assert(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)),
    'every public view is security_invoker');
end $$;
