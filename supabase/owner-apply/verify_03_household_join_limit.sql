-- VERIFY after migration 3 of 4: household_join_limit
-- Run in the same SQL Editor immediately after 03_household_join_limit.sql succeeded (before the next migration).
-- Read-only. Every row must show ok = true, and the last row must say ALL OK. If anything is false, STOP and tell the assistant; do not continue.
with c(check_name, expected, actual) as (values
  ('history row recorded', '1', (select count(*)::text from supabase_migrations.schema_migrations where name='household_join_limit')::text),
  ('attempts table has RLS', '1/1', (select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public' and tablename in ('household_join_attempts'))::text),
  ('attempts policy (count : hash)', '1:244b4a027e17815731579735e3b8c950', (select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public' and tablename in ('household_join_attempts'))::text),
  ('attempts column definitions (hash)', 'dd5da83a721be68bf73c5bf133b4de30', (select md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in ('household_join_attempts') group by table_name) x)::text),
  ('attempts constraints (count : hash)', '2:e2c7c8f166eb7ae85d710264a148f88c', (select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c where connamespace='public'::regnamespace and conrelid::regclass::text in ('household_join_attempts'))::text),
  ('attempts indexes (count : hash)', '2:7e409de510f2e7b986b510f21ace33c9', (select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public' and tablename in ('household_join_attempts'))::text),
  ('household_join now carries the limit: definition, empty search_path (count : hash)', '1:661535b2b0b61bdbd80ea30f5abcfb8f', (select count(*)::text||':'||md5(string_agg(proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(prosrc)||coalesce(proconfig::text,''),'|' order by proname)) from pg_proc p where pronamespace='public'::regnamespace and proname in ('household_join'))::text),
  ('anon still cannot execute household_join', '0', (select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('household_join') and has_function_privilege('anon', p.oid, 'execute'))::text),
  ('signed-in users still can', '1', (select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('household_join') and has_function_privilege('authenticated', p.oid, 'execute'))::text),
  ('attempts table grants (count : hash)', '1:36ded28de509db86a6f7d69373b00c86', (select count(*)::text||':'||md5(string_agg(table_name||privilege_type||grantee,'|' order by table_name,privilege_type,grantee)) from information_schema.role_table_grants where table_schema='public' and table_name in ('household_join_attempts') and grantee in ('anon','authenticated'))::text)
)
select check_name, expected, actual, (expected = actual) as ok from c
union all
select 'ALL OK', '', '', coalesce(bool_and(expected = actual), false) from c
order by 4, 1;
