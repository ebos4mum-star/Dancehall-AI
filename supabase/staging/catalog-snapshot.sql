-- READ-ONLY. One deterministic text line per function (body hash, security flag, grants), column, constraint, index, policy and table grant in the public and app schemas.
-- Run it on staging BEFORE a change, AFTER it, and AFTER a rollback, and compare the outputs with diff: a rollback is proven by an EMPTY diff. The same file is used by the local
-- rehearsal (supabase/proposed/staging-increment-dry-run.sh), so a local and a hosted run describe things the same way. It selects only catalog metadata, never any row of user data.
--   psql "$STAGING_DB_URL" -X -At -f supabase/staging/catalog-snapshot.sql > before.txt
select x from (
 select 'F '||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||md5(pg_get_functiondef(p.oid))||' sd='||p.prosecdef||' acl='||coalesce(p.proacl::text,'') x
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app') and p.prokind = 'f'
 union all select 'C '||table_schema||'.'||table_name||'.'||column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,'') from information_schema.columns where table_schema in ('public','app')
 union all select 'K '||conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace in ('public'::regnamespace,'app'::regnamespace)
 union all select 'I '||indexdef from pg_indexes where schemaname in ('public','app')
 union all select 'P '||schemaname||'.'||tablename||' '||policyname||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,'') from pg_policies where schemaname in ('public','app')
 union all select 'T '||c.relnamespace::regnamespace||'.'||c.relname||' rls='||c.relrowsecurity||' acl='||coalesce(c.relacl::text,'') from pg_class c where c.relkind='r' and c.relnamespace in ('public'::regnamespace,'app'::regnamespace)
) s order by x;
