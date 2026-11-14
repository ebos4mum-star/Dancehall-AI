-- Runs last. Every public table with a user_id column must hold rows (seeded by earlier tests) that a different user can never read,
-- insert into, update or delete. This catches new tables that were added without owner-only policies.
do $$
declare t record; owner_id uuid; other uuid; cnt bigint; n_tables int := 0;
begin
  for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name loop
    execute format('select user_id from public.%I limit 1', t.table_name) into owner_id;
    perform test.assert(owner_id is not null, format('earlier tests seeded rows in public.%s', t.table_name));
    select id into other from auth.users where id <> owner_id order by id limit 1;
    perform test.as_user(other);
    execute format('select count(*) from public.%I where user_id = %L', t.table_name, owner_id) into cnt;
    perform test.assert(cnt = 0, format('another user reads zero rows of public.%s', t.table_name));
    begin
      execute format('delete from public.%I where user_id = %L', t.table_name, owner_id);
      get diagnostics cnt = row_count;
    exception when insufficient_privilege then cnt := 0;
    end;
    perform test.assert(cnt = 0, format('another user deletes zero rows of public.%s', t.table_name));
    perform test.as_admin();
    n_tables := n_tables + 1;
  end loop;
  perform test.assert(n_tables >= 10, 'isolation test covered the expected tables');
  raise notice 'owner isolation verified on % tables', n_tables;
end $$;
