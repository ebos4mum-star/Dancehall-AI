do $$
declare a uuid; b uuid; g uuid;
begin
  a := test.make_user('wa@example.test'); b := test.make_user('wb@example.test');
  -- Set up two onboarded adults (as the app would).
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.profile_private (user_id, birth_date, height_cm) values (a, '1985-05-05', 170);
  perform test.as_user(b);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.profile_private (user_id, birth_date, height_cm) values (b, '1992-02-02', 165);

  -- Weight entries: own only, validated, consent-gated.
  perform test.as_user(a);
  insert into public.weight_entries (weight_kg, measured_at) values (82.4, now() - interval '7 days'), (81.9, now());
  perform test.assert((select count(*) from public.weight_entries) = 2, 'A has two entries');
  perform test.throws($q$insert into public.weight_entries (weight_kg) values (10)$q$, 'check constraint');
  perform test.throws($q$insert into public.weight_entries (weight_kg, measured_at) values (80, now() + interval '30 days')$q$, 'weight_not_in_future');
  perform test.throws(format($q$insert into public.weight_entries (user_id, weight_kg) values (%L, 70)$q$, b), 'permission denied');
  perform test.throws($q$insert into public.weight_entries (weight_kg, source) values (80, 'bogus')$q$, 'check constraint');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.weight_entries) = 0, 'B cannot see A weight entries');
  perform test.assert(test.rows_affected(format('delete from public.weight_entries where user_id = %L', a)) = 0, 'B cannot delete A entries');
  perform test.assert(test.rows_affected(format('update public.weight_entries set weight_kg = 50 where user_id = %L', a)) = 0, 'B cannot update A entries');
  insert into public.weight_entries (weight_kg) values (66.0);

  -- Goals: valid goals of each period.
  perform test.as_user(a);
  insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'weekly', current_date, current_date + 7, 82, 81.6) returning id into g;
  insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'monthly', current_date, (current_date + interval '1 month')::date, 82, 80.5);
  insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'yearly', current_date, (current_date + interval '1 year')::date, 82, 74);
  perform test.assert((select count(*) from public.goals) = 3, 'A has weekly, monthly and yearly goals');
  perform test.assert((select planned_weekly_change_kg from public.goals where period = 'weekly') = -0.4, 'weekly pace computed by the database');
  -- Only one active goal per period.
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'weekly', current_date, current_date + 7, 82, 81.7)$q$, 'goals_one_active_per_period');
  -- The client cannot set the computed pace or the owner.
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg, planned_weekly_change_kg)
    values ('maintain', 'weekly', current_date, current_date + 7, 82, 82, -5)$q$, 'permission denied');

  -- Safety limits enforced in the database.
  perform test.as_user(b);
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'weekly', current_date, current_date + 7, 66, 63)$q$, 'goal_pace_too_fast');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'yearly', current_date, (current_date + interval '1 year')::date, 66, 45)$q$, 'goal_target_below_healthy_range');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'monthly', current_date, (current_date + interval '1 month')::date, 66, 70)$q$, 'goal_direction_mismatch');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('gain', 'weekly', current_date, current_date + 7, 66, 67.5)$q$, 'goal_pace_too_fast');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('maintain', 'weekly', current_date, current_date + 10, 66, 66)$q$, 'goal_period_mismatch');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('maintain', 'weekly', current_date, current_date + 7, 66, 65)$q$, 'goal_direction_mismatch');
  insert into public.goals (type, period, start_date, end_date, start_kg, target_kg) values ('maintain', 'monthly', current_date, (current_date + interval '1 month')::date, 66, 66);
  -- already below the minimum BMI: a loss goal is refused
  perform test.as_admin();
  insert into public.weight_entries (user_id, weight_kg) values (b, 66);  -- (service/admin path, unaffected by RLS)
  perform test.as_user(b);
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
    values ('lose', 'yearly', current_date, (current_date + interval '1 year')::date, 49, 48)$q$, 'goal_unsafe_underweight');

  -- Goals are immutable except for status; isolation holds.
  perform test.as_user(a);
  perform test.throws(format($q$update public.goals set target_kg = 60 where id = %L$q$, g), 'permission denied');
  perform test.assert(test.rows_affected(format($q$update public.goals set status = 'completed' where id = %L$q$, g)) = 1, 'owner can end a goal');
  insert into public.goals (type, period, start_date, end_date, start_kg, target_kg) values ('maintain', 'weekly', current_date, current_date + 7, 81.6, 81.6);
  perform test.as_user(b);
  perform test.assert(test.rows_affected(format($q$update public.goals set status = 'abandoned' where id = %L$q$, g)) = 0, 'B cannot change A goal');
  perform test.assert((select count(*) from public.goals where user_id = a) = 0, 'B cannot see A goals');

  -- Readiness screening: private, consent-gated, owner only.
  perform test.as_user(a);
  insert into public.readiness_screenings (answers, outcome) values ('{"dizziness_or_loss_of_balance": true}', 'low_impact_and_check_with_professional');
  perform test.throws($q$insert into public.readiness_screenings (answers, outcome) values ('[]', 'clear')$q$, 'check constraint');
  perform test.throws($q$insert into public.readiness_screenings (answers, outcome) values ('{}', 'whatever')$q$, 'check constraint');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.readiness_screenings) = 0, 'B cannot see A readiness answers');

  -- Withdrawn consent blocks new writes everywhere.
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.throws($q$insert into public.weight_entries (weight_kg) values (65)$q$, 'row-level security');
  perform test.throws($q$insert into public.readiness_screenings (answers, outcome) values ('{}', 'clear')$q$, 'row-level security');
  perform test.throws($q$insert into public.goals (type, period, start_date, end_date, start_kg, target_kg) values ('maintain', 'yearly', current_date, (current_date + interval '1 year')::date, 66, 66)$q$, 'row-level security');
  perform test.assert((select count(*) from public.weight_entries) = 2, 'B can still read own data');
  perform test.as_admin();
end $$;
