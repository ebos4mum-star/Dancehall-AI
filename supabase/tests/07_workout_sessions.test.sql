do $$
declare a uuid; b uuid; s1 uuid; s2 uuid; s3 uuid;
begin
  a := test.make_user('sa@example.test'); b := test.make_user('sb@example.test');
  perform test.as_user(a);
  perform test.throws($q$insert into public.workout_sessions (title, minutes, planned_for) values ('Latin 10', 10, current_date)$q$, 'row-level security');   -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.workout_sessions (workout_id, title, style, minutes, planned_for, source) values ('qf10-latin-rhythm', 'Latin Rhythm 10', 'latin', 10, current_date + 1, 'quick_fit') returning id into s1;
  perform test.assert((select status = 'planned' and completed_at is null from public.workout_sessions where id = s1), 'new sessions are planned');
  perform test.throws($q$insert into public.workout_sessions (title, minutes) values ('No date', 10)$q$, 'planned_has_date');
  perform test.throws($q$insert into public.workout_sessions (workout_id, title, minutes, planned_for) values ('no-such-workout', 'x', 10, current_date)$q$, 'foreign key');
  perform test.throws($q$insert into public.workout_sessions (title, minutes, planned_for, perceived_exertion) values ('x', 10, current_date, 11)$q$, 'check constraint');
  perform test.throws($q$insert into public.workout_sessions (title, minutes, planned_for, status) values ('x', 10, current_date, 'skipped')$q$, 'row-level security');
  perform test.throws(format($q$insert into public.workout_sessions (user_id, title, minutes, planned_for) values (%L, 'x', 10, current_date)$q$, b), 'permission denied');
  perform test.throws($q$insert into public.workout_sessions (title, minutes, status, completed_at) values ('x', 10, 'completed', now() + interval '30 days')$q$, 'completed_not_in_future');

  -- log a finished workout directly, and complete a planned one
  insert into public.workout_sessions (workout_id, title, style, minutes, status, duration_s, perceived_exertion, low_impact, source) values ('qf5-lowimpact-reset', 'Low-Impact Reset', 'low_impact', 5, 'completed', 290, 4, true, 'manual') returning id into s2;
  perform test.assert((select completed_at is not null from public.workout_sessions where id = s2), 'completing sets the completion time');
  update public.workout_sessions set status = 'completed', duration_s = 612, perceived_exertion = 6, low_impact = false where id = s1;
  perform test.assert((select completed_at is not null and duration_s = 612 from public.workout_sessions where id = s1), 'a planned session can be completed');
  update public.workout_sessions set status = 'planned' where id = s1;
  perform test.assert((select completed_at is null from public.workout_sessions where id = s1), 'undoing a completion clears the time');
  update public.workout_sessions set status = 'skipped' where id = s1;
  perform test.assert((select status = 'skipped' and completed_at is null from public.workout_sessions where id = s1), 'sessions can be skipped');
  update public.workout_sessions set status = 'planned', planned_for = current_date + 2 where id = s1;
  perform test.assert((select planned_for = current_date + 2 from public.workout_sessions where id = s1), 'sessions can be rescheduled');
  perform test.throws(format($q$update public.workout_sessions set title = 'x' where id = %L$q$, s1), 'permission denied');
  perform test.throws(format($q$update public.workout_sessions set user_id = %L where id = %L$q$, b, s1), 'permission denied');
  insert into public.workout_sessions (title, minutes, planned_for) values ('Custom', 20, current_date) returning id into s3;
  delete from public.workout_sessions where id = s3;
  perform test.assert((select count(*) from public.workout_sessions) = 2, 'owners can delete sessions');

  -- isolation
  perform test.as_user(b);
  perform test.assert((select count(*) from public.workout_sessions) = 0, 'B cannot see A sessions');
  perform test.assert(test.rows_affected(format($q$update public.workout_sessions set status = 'skipped' where id = %L$q$, s1)) = 0, 'B cannot change A sessions');
  perform test.assert(test.rows_affected(format($q$delete from public.workout_sessions where id = %L$q$, s1)) = 0, 'B cannot delete A sessions');

  -- withdrawn consent blocks new writes but not reading
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.throws($q$insert into public.workout_sessions (title, minutes, planned_for) values ('x', 10, current_date)$q$, 'row-level security');
  perform test.throws(format($q$update public.workout_sessions set status = 'skipped' where id = %L$q$, s1), 'row-level security');
  perform test.assert((select count(*) from public.workout_sessions) = 2, 'owner can still read their history');
  perform test.as_admin();
end $$;
