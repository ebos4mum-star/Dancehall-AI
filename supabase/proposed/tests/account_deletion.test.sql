-- The deletion executor: nothing before the waiting period ends, a cancelled request is respected, and once due the person and everything about them is gone.
do $$
declare a uuid; b uuid; c uuid; t record; n int; tables_checked int := 0; cnt bigint;
begin
  perform test.as_admin();
  a := test.make_user('del-a@example.test'); b := test.make_user('del-b@example.test'); c := test.make_user('del-c@example.test');
  -- Give person A data in several tables, and B some too (B must be untouched).
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.weight_entries (weight_kg, measured_at) values (80, now() - interval '3 days'), (79.5, now());
  perform test.as_user(b);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.weight_entries (weight_kg, measured_at) values (70, now());
  -- requests: A and C ask; C cancels
  perform test.as_user(a); perform public.request_account_deletion();
  perform test.as_user(c); perform public.request_account_deletion(); perform public.cancel_account_deletion();
  perform test.as_admin();

  -- clients cannot run the executor
  perform test.as_user(a);
  perform test.throws($q$select public.purge_due_account_deletions()$q$, 'permission denied');
  perform test.as_anon();
  perform test.throws($q$select public.purge_due_account_deletions()$q$, 'permission denied');
  perform test.as_admin();
  perform set_config('role', 'service_role', false);

  -- not yet due: nothing happens
  perform test.assert(public.purge_due_account_deletions() = 0, 'nothing is deleted while the waiting period runs');
  perform set_config('role', 'none', false);
  perform test.assert(exists (select 1 from auth.users where id = a), 'the account still exists during the waiting period');

  -- due: A is deleted; B and the cancelled C are not
  update public.account_deletion_requests set scheduled_for = now() - interval '1 minute' where user_id in (a, c);
  perform set_config('role', 'service_role', false);
  perform test.assert(public.purge_due_account_deletions() = 1, 'only the due, uncancelled request is executed');
  perform set_config('role', 'none', false);
  perform test.assert(not exists (select 1 from auth.users where id = a), 'the account is deleted');
  perform test.assert(exists (select 1 from auth.users where id = b) and exists (select 1 from auth.users where id = c), 'other people and a cancelled request are untouched');
  perform test.assert((select count(*) from public.weight_entries where user_id = b) = 1, 'another person''s data is untouched');

  -- nothing about A remains anywhere in public
  for t in select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name in ('user_id', 'owner_id', 'author_id', 'reporter_id', 'blocker_id', 'blocked_id', 'id') and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') loop
    if t.column_name = 'id' and t.table_name <> 'profiles' then continue; end if;
    execute format('select count(*) from public.%I where %I = %L', t.table_name, t.column_name, a) into cnt;
    perform test.assert(cnt = 0, format('no row about the deleted person remains in public.%s.%s', t.table_name, t.column_name));
    tables_checked := tables_checked + 1;
  end loop;
  perform test.assert(tables_checked >= 20, 'the scan covered the expected tables');
end $$;
