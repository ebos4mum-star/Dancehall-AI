-- VERIFY the final schema (after all four migrations)
-- Compares the whole public schema catalog with a clean build of all 13 repository migrations. Run once after verify_04.
-- Read-only. Every row must show ok = true, and the last row must say ALL OK. If anything is false, STOP and tell the assistant; do not continue.
with c(check_name, expected, actual) as (values
  ('public tables with RLS (count)', '48/48', (select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public')::text),
  ('catalog: columns', '48:36c4d7c04f4e3f44f454995a68deb0db', (select count(*)::text||':'||md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in (select tablename from pg_tables where schemaname='public') group by table_name) x)::text),
  ('catalog: policies', '129:8cb09362522e9c0393779e2632a5aa5e', (select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public')::text),
  ('catalog: functions', '57:ab69038bfd9618304644dd88cc97f711', (select count(*)::text||':'||md5(string_agg(n.nspname||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc),'|' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app'))::text),
  ('catalog: constraints', '285:2faa63a25f3201aae81f045fa8705167', (select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')::text),
  ('catalog: indexes', '90:2b761162460821c1cf46805803398384', (select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public')::text),
  ('catalog: triggers', '27:4f8f9c5b67ab0615fdb300e293c9d555', (select count(*)::text||':'||md5(string_agg(c.relname||t.tgname,'|' order by c.relname,t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public')::text),
  ('migration history rows (9 before + 4 owner-applied)', '13', (select count(*)::text from supabase_migrations.schema_migrations)::text)
)
select check_name, expected, actual, (expected = actual) as ok from c
union all
select 'ALL OK', '', '', coalesce(bool_and(expected = actual), false) from c
order by 4, 1;
