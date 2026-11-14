do $$
declare a uuid; b uuid; n int;
begin
  perform test.as_admin();
  a := test.make_user('cel-a@example.test'); b := test.make_user('cel-b@example.test');
  perform test.as_user(a);
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full')$q$, 'row-level security');  -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full');
  insert into public.celebrations (achievement_id, mode) values ('weekly:movement_minutes:2026-06-15', 'gentle'), ('monthly:movement_weeks:2026-06', 'off'), ('yearly:movement_weeks:2026', 'full');
  perform test.assert((select count(*) = 4 from public.celebrations), 'the owner sees their ledger');
  perform test.assert((select user_id = a from public.celebrations limit 1), 'rows are owned by the caller');

  -- First writer wins: handling the same achievement again is a duplicate, never a second celebration.
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'gentle')$q$, 'duplicate key');
  perform test.assert((select mode = 'full' from public.celebrations where achievement_id = 'daily:water:2026-06-17'), 'the first record is kept');
  -- Cannot be forged, rewritten or backdated.
  perform test.throws($q$update public.celebrations set mode = 'off'$q$, 'permission denied');
  perform test.throws($q$insert into public.celebrations (achievement_id, mode, shown_at) values ('daily:habits:2026-06-17', 'full', now() - interval '3 days')$q$, 'permission denied');
  perform test.throws(format($q$insert into public.celebrations (user_id, achievement_id, mode) values (%L, 'daily:habits:2026-06-17', 'full')$q$, b), 'permission denied');

  -- Only well-formed achievement ids about movement, water and habits are accepted: nothing about weight or food.
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:weight:2026-06-17', 'full')$q$, 'celebrations_achievement_id_check');
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:calories:2026-06-17', 'full')$q$, 'celebrations_achievement_id_check');
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('hourly:water:2026-06-17', 'full')$q$, 'celebrations_achievement_id_check');
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:water:tomorrow', 'full')$q$, 'celebrations_achievement_id_check');
  perform test.throws($q$insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-18', 'loud')$q$, 'celebrations_mode_check');

  -- Isolation
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.celebrations), 'another person sees none of it');
  perform test.assert(test.rows_affected($q$delete from public.celebrations$q$) = 0, 'another person deletes nothing');
  perform test.as_anon();
  perform test.throws($q$select * from public.celebrations$q$, 'permission denied');
  perform test.as_user(a);
  perform test.assert(test.rows_affected($q$delete from public.celebrations where achievement_id = 'yearly:movement_weeks:2026'$q$) = 1, 'the owner can delete their own record (data control)');
end $$;

-- Account deletion removes the ledger, and only that person's.
do $$
declare c uuid; d uuid;
begin
  perform test.as_admin();
  c := test.make_user('cel-c@example.test'); d := test.make_user('cel-d@example.test');
  perform test.as_user(c);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full');
  perform test.as_user(d);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.celebrations (achievement_id, mode) values ('daily:water:2026-06-17', 'full');
  perform test.as_admin();
  delete from auth.users where id = c;
  perform test.assert((select count(*) = 0 from public.celebrations where user_id = c), 'deleting an account removes its celebration ledger');
  perform test.assert((select count(*) = 1 from public.celebrations where user_id = d), 'another person''s ledger is untouched');
end $$;
