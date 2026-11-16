-- PROPOSED, NOT APPLIED. The executor for account deletion.
--
-- Today a person can ask to delete their account in the app (public.request_account_deletion, 30-day cancellable waiting period) but NOTHING performs the deletion
-- afterwards: the migration that created the request says "the irreversible purge is a separate trusted job" and that job does not exist. Apple's App Review
-- Guideline 5.1.1(v) requires that account deletion actually delete the account, so this is a launch requirement.
--
-- This function is that job. It is service-role only (run by pg_cron inside the project, or by the scheduled server call). It deletes the auth user; every table
-- that references the person (directly or through profiles) removes its rows by cascade, including all Community content. Community media files and other storage
-- objects are removed afterwards by the maintenance jobs (the Community delete trigger records orphaned files; see community.up.sql).
create or replace function public.purge_due_account_deletions(p_limit integer default 50) returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select id, user_id from public.account_deletion_requests
     where status = 'pending' and scheduled_for <= now()
     order by scheduled_for
     limit greatest(1, least(coalesce(p_limit, 50), 200))
       for update skip locked
  loop
    delete from auth.users where id = r.user_id; -- cascades to profiles and everything below; the request row goes with it
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.purge_due_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.purge_due_account_deletions(integer) to service_role;

-- Schedule (inside the project, free): select cron.schedule('purge-account-deletions', '*/30 * * * *', 'select public.purge_due_account_deletions()');
