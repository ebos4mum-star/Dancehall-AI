-- VERIFY after migration 2 of 4: wellness
-- Run in the same SQL Editor immediately after 02_wellness.sql succeeded (before the next migration).
-- Read-only. Every row must show ok = true, and the last row must say ALL OK. If anything is false, STOP and tell the assistant; do not continue.
with c(check_name, expected, actual) as (values
  ('history row recorded', '1', (select count(*)::text from supabase_migrations.schema_migrations where name='wellness')::text),
  ('2 wellness tables have RLS', '2/2', (select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public' and tablename in ('wellness_entries','wellness_prefs'))::text),
  ('wellness policies (count : hash)', '7:e28a978785995a1d9cc7f36247c4516d', (select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public' and tablename in ('wellness_entries','wellness_prefs'))::text),
  ('wellness column definitions (hash)', 'f69f678699f1dac8c294c841caf2d72f', (select md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in ('wellness_entries','wellness_prefs') group by table_name) x)::text),
  ('wellness constraints (count : hash)', '11:7b2f2601afc3c8824379e5a665359917', (select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c where connamespace='public'::regnamespace and conrelid::regclass::text in ('wellness_entries','wellness_prefs'))::text),
  ('wellness indexes (count : hash)', '5:abb1fe96e5104da03dca4708674d1d04', (select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public' and tablename in ('wellness_entries','wellness_prefs'))::text),
  ('table grants for anon and authenticated (count : hash)', '4:97c125742cb5e2ff65e4728ab5133f13', (select count(*)::text||':'||md5(string_agg(table_name||privilege_type||grantee,'|' order by table_name,privilege_type,grantee)) from information_schema.role_table_grants where table_schema='public' and table_name in ('wellness_entries','wellness_prefs') and grantee in ('anon','authenticated'))::text),
  ('column grants (count : hash)', '9:06675d049ea294e0895af8c1e4da771b', (select count(*)::text||':'||md5(string_agg(table_name||'.'||column_name||privilege_type||grantee,'|' order by table_name,column_name,privilege_type,grantee)) from information_schema.column_privileges where table_schema='public' and table_name in ('wellness_entries','wellness_prefs') and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE'))::text)
)
select check_name, expected, actual, (expected = actual) as ok from c
union all
select 'ALL OK', '', '', coalesce(bool_and(expected = actual), false) from c
order by 4, 1;
