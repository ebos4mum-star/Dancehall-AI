-- Rolls back community.up.sql. Destroys all community content (posts, comments, reactions, reports, blocks, usernames). Run only on purpose.
drop table if exists public.community_blocks, public.community_reports, public.community_reactions, public.community_comments, public.community_media, public.community_posts, public.community_members, public.community_retired_names, public.community_uploads, public.community_burst, public.community_report_resolutions cascade;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'community\_%' loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

