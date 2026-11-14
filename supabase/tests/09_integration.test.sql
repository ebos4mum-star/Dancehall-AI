do $$
declare
  a uuid; b uuid; st uuid; r public.account_deletion_requests; n bigint; pid uuid;
begin
  a := test.make_user('ia@example.test'); b := test.make_user('ib@example.test'); st := test.make_user('iflag@example.test');
  insert into public.staff_roles (user_id, role) values (st, 'admin');

  -- ---------- the person's AI pause ----------
  perform test.as_user(a);
  insert into public.ai_preferences (ai_paused) values (true);
  perform test.assert((select ai_paused from public.ai_preferences), 'person can pause their own AI');
  perform test.throws(format($q$insert into public.ai_preferences (user_id, ai_paused) values (%L, true)$q$, b), 'permission denied');
  update public.ai_preferences set ai_paused = false;
  perform test.throws($q$update public.ai_preferences set updated_at = now() - interval '1 year'$q$, 'permission denied');
  update public.ai_preferences set ai_paused = true;
  -- pausing never touches the staff kill switch, and a person cannot change it
  perform test.assert(test.rows_affected($q$update public.feature_flags set enabled = true where key = 'ai.kill_all'$q$) = 0, 'a person cannot flip the kill switch');
  perform test.as_admin();
  perform test.assert((select not enabled from public.feature_flags where key = 'ai.kill_all'), 'pause does not set the kill switch');
  perform test.assert(public.ai_user_paused(a) and not public.ai_user_paused(b), 'server reads each person''s own pause');
  -- and the kill switch does not set anyone's pause
  update public.feature_flags set enabled = true where key = 'ai.kill_all';
  perform test.assert(not public.ai_user_paused(b), 'kill switch is not a user pause');
  update public.feature_flags set enabled = false where key = 'ai.kill_all';
  perform test.as_user(b);
  perform test.assert((select count(*) from public.ai_preferences) = 0, 'preferences are private');
  perform test.throws($q$select public.ai_user_paused(auth.uid())$q$, 'permission denied');

  -- ---------- account-deletion requests ----------
  perform test.as_anon();
  perform test.throws($q$select public.request_account_deletion()$q$, 'permission denied');
  perform test.as_user(a);                                    -- no consent needed
  r := public.request_account_deletion();
  perform test.assert(r.status = 'pending' and r.scheduled_for > now() + interval '29 days', 'request is pending with a 30-day grace period');
  pid := r.id;
  perform test.assert((public.request_account_deletion()).id = pid, 'requesting twice is idempotent');
  perform test.throws($q$insert into public.account_deletion_requests (user_id) values (auth.uid())$q$, 'permission denied');
  perform test.throws(format($q$update public.account_deletion_requests set status = 'completed' where id = %L$q$, pid), 'permission denied');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.account_deletion_requests) = 0, 'requests are private');
  perform test.assert(not public.cancel_account_deletion(), 'cannot cancel someone else''s request');
  perform test.assert((select count(*) from public.account_deletion_requests where status = 'pending') = 0, 'b has none');
  perform test.throws($q$select * from public.account_deletion_due()$q$, 'permission denied');
  perform test.as_admin();
  perform test.assert((select count(*) from public.account_deletion_due()) = 0, 'not due inside the grace period');
  perform test.assert((select count(*) from public.account_deletion_due(now() + interval '31 days')) = 1, 'due after the grace period');
  perform test.as_user(a);
  perform test.assert(public.cancel_account_deletion(), 'person can cancel');
  perform test.assert(not public.cancel_account_deletion(), 'cancel is idempotent');
  perform test.as_admin();
  perform test.assert((select count(*) from public.account_deletion_due(now() + interval '31 days')) = 0, 'cancelled requests are never due');
  perform test.as_user(a);
  r := public.request_account_deletion();
  perform test.assert(r.id <> pid, 'a new request can be made after cancelling');
  perform test.as_admin();
  perform public.account_deletion_complete(r.id);
  perform test.assert((select status from public.account_deletion_requests where id = r.id) = 'completed', 'job records completion');

  -- ---------- the grace period is configuration, writable only by trusted code ----------
  perform test.as_user(a);
  perform test.throws($q$update public.app_config set int_value = 0$q$, 'permission denied');
  perform test.throws($q$insert into public.app_config (key, int_value) values ('x.y', 1)$q$, 'permission denied');
  perform test.assert((select int_value from public.app_config where key = 'account_deletion_grace_days') = 30, 'provisional default is readable');
  perform public.request_account_deletion();
  perform test.assert(public.cancel_account_deletion(), 'cancel the open request');
  perform test.as_admin();
  update public.app_config set int_value = 7 where key = 'account_deletion_grace_days';
  perform test.as_user(a);
  r := public.request_account_deletion();
  perform test.assert(r.scheduled_for between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'request follows the configured grace period');
end $$;
