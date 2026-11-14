do $$
declare a uuid; b uuid; c1 uuid;
begin
  a := test.make_user('chal-a@example.test'); b := test.make_user('chal-b@example.test');
  perform test.as_user(a);
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (7, 3)$q$, 'row-level security');   -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  insert into public.fit_challenges (length_days, target_days) values (7, 3) returning id into c1;
  perform test.assert((select status = 'active' and user_id = a from public.fit_challenges where id = c1), 'a new challenge is active and owned by the caller');
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (14, 5)$q$, 'fit_challenges_one_active');

  -- rest days are guaranteed: at most 5 active days in every 7
  update public.fit_challenges set status = 'abandoned' where id = c1;
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (7, 6)$q$, 'target_leaves_rest_days');
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (30, 22)$q$, 'target_leaves_rest_days');
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (14, 0)$q$, 'target_leaves_rest_days');
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days) values (10, 3)$q$, 'check constraint');
  insert into public.fit_challenges (length_days, target_days) values (7, 5);
  update public.fit_challenges set status = 'completed' where status = 'active';
  insert into public.fit_challenges (length_days, target_days) values (30, 21);
  update public.fit_challenges set status = 'completed' where status = 'active';

  -- column-level grants: only the status can change; ownership and the commitment cannot
  perform test.throws(format($q$update public.fit_challenges set target_days = 1 where id = %L$q$, c1), 'permission denied');
  perform test.throws(format($q$update public.fit_challenges set user_id = %L where id = %L$q$, b, c1), 'permission denied');
  perform test.throws(format($q$insert into public.fit_challenges (user_id, length_days, target_days) values (%L, 7, 3)$q$, b), 'permission denied');
  perform test.throws($q$insert into public.fit_challenges (length_days, target_days, status) values (7, 3, 'completed')$q$, 'permission denied');

  -- isolation
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.fit_challenges), 'another user sees nothing');
  update public.fit_challenges set status = 'abandoned' where id = c1;
  delete from public.fit_challenges where id = c1;
  perform test.as_user(a);
  perform test.assert((select count(*) = 1 from public.fit_challenges where id = c1), 'another user cannot change or delete it');
  delete from public.fit_challenges where id = c1;
  perform test.assert((select count(*) = 0 from public.fit_challenges where id = c1), 'the owner can delete their challenge');
  perform test.as_anon();
  perform test.throws($q$select * from public.fit_challenges$q$, 'permission denied');
end $$;
