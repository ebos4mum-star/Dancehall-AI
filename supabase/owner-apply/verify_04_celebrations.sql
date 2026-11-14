-- VERIFY after migration 4 of 4: celebrations
-- Run in the same SQL Editor immediately after 04_celebrations.sql succeeded (before the next migration).
-- Read-only. Every row must show ok = true, and the last row must say ALL OK. If anything is false, STOP and tell the assistant; do not continue.
with c(check_name, expected, actual) as (values
  ('history row recorded', '1', (select count(*)::text from supabase_migrations.schema_migrations where name='celebrations')::text),
  ('celebrations table has RLS', '1/1', (select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public' and tablename in ('celebrations'))::text),
  ('celebrations policies (count : hash)', '3:8b3badd67813ce1381f22c681b7591d7', (select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public' and tablename in ('celebrations'))::text),
  ('celebrations column definitions (hash)', '207739beab521dff1d7c8fc0acc9c533', (select md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in ('celebrations') group by table_name) x)::text),
  ('celebrations constraints incl. id and mode checks (count : hash)', '4:556d578908df12c5ef3b7baf05f0e7ab', (select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c where connamespace='public'::regnamespace and conrelid::regclass::text in ('celebrations'))::text),
  ('celebrations indexes (count : hash)', '2:efef16192266225279fb5f965df7b934', (select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public' and tablename in ('celebrations'))::text),
  ('table grants (count : hash)', '2:486ff3e1116867d8e8b0053b3680c920', (select count(*)::text||':'||md5(string_agg(table_name||privilege_type||grantee,'|' order by table_name,privilege_type,grantee)) from information_schema.role_table_grants where table_schema='public' and table_name in ('celebrations') and grantee in ('anon','authenticated'))::text),
  ('column grants: insert limited to id and mode (count : hash)', '2:aaba3ca8530555b973ed71df6b1fd98a', (select count(*)::text||':'||md5(string_agg(table_name||'.'||column_name||privilege_type||grantee,'|' order by table_name,column_name,privilege_type,grantee)) from information_schema.column_privileges where table_schema='public' and table_name in ('celebrations') and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE'))::text)
)
select check_name, expected, actual, (expected = actual) as ok from c
union all
select 'ALL OK', '', '', coalesce(bool_and(expected = actual), false) from c
order by 4, 1;
