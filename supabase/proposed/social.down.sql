-- Rolls back social.up.sql. Destroys all friendships, sharing choices, groups and group numbers. Run only on purpose, never on a hosted project without approval.
drop function if exists public.social_rpc(text, jsonb);
drop table if exists public.social_contributions, public.social_group_members, public.social_groups, public.social_shares, public.social_blocks, public.social_friendships cascade;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'social\_%' loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;
drop function if exists app.eligible_workouts(uuid, timestamptz);
