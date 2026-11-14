do $$
declare a uuid; b uuid; n bigint; v_ts timestamptz;
begin
  a := test.make_user('a@example.test'); b := test.make_user('b@example.test');

  -- Signup trigger created profile rows; owners see only their own.
  perform test.as_user(a);
  perform test.assert((select count(*) from public.profiles) = 1, 'user A sees exactly one profile');
  perform test.assert((select id from public.profiles) = a, 'user A sees their own profile');

  -- Profile updates: allowed columns work; protected column onboarded_at is not writable.
  update public.profiles set display_name = 'Ama', country = 'GH', time_zone = 'Africa/Accra', unit_system = 'imperial' where id = a;
  perform test.throws($q$update public.profiles set onboarded_at = now() where id = $q$ || quote_literal(a), 'permission denied');
  perform test.assert(test.rows_affected(format('update public.profiles set display_name = %L where id = %L', 'Hacked', b)) = 0, 'cannot update another profile');
  perform test.throws($q$insert into public.profiles (id) values (gen_random_uuid())$q$, 'permission denied');
  perform test.throws($q$update public.profiles set country = 'gh' where id = $q$ || quote_literal(a), 'check constraint');
  perform test.throws($q$delete from public.profiles$q$, 'permission denied');

  -- Health data cannot be written without consent.
  perform test.throws(format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, '1990-01-01', 170)$q$, a), 'row-level security');

  -- Consent: append-only history, latest decision wins.
  perform test.assert(not app.has_consent('health_data_processing'), 'no consent by default');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  perform test.assert(app.has_consent('health_data_processing'), 'consent granted');
  perform test.throws($q$update public.consents set granted = false$q$, 'permission denied');
  perform test.throws($q$delete from public.consents$q$, 'permission denied');
  perform test.throws($q$insert into public.consents (purpose, policy_version, granted) values ('made_up', 'v0', true)$q$, 'check constraint');
  perform test.throws(format($q$insert into public.consents (user_id, purpose, policy_version, granted) values (%L, 'social_sharing', 'v0', true)$q$, a), 'permission denied');

  -- Adults only: under 18 rejected in the database, adults accepted.
  perform test.throws(format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, current_date - interval '17 years', 170)$q$, a), 'adults_only');
  perform test.throws(format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, current_date - interval '150 years', 170)$q$, a), 'invalid_birth_date');
  perform test.throws(format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, '1990-01-01', 20)$q$, a), 'check constraint');
  perform test.throws(format($q$insert into public.profile_private (user_id, birth_date, height_cm) values (%L, '1990-01-01', 170)$q$, b), 'row-level security');
  insert into public.profile_private (user_id, birth_date, height_cm, sex, activity_level) values (a, '1990-01-01', 170, 'female', 'moderate');
  perform test.throws(format($q$update public.profile_private set birth_date = current_date - interval '10 years' where user_id = %L$q$, a), 'adults_only');

  -- Onboarding completes only through the function, and only when complete.
  perform test.as_user(b);
  perform test.throws($q$select public.complete_onboarding()$q$, 'profile_incomplete');
  perform test.as_user(a);
  v_ts := public.complete_onboarding();
  perform test.assert(v_ts is not null, 'onboarding completed');
  perform test.assert((select onboarded_at from public.profiles where id = a) = v_ts, 'onboarded_at stored');

  -- Withdrawing consent blocks new health writes but keeps reading and the history.
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.assert(not app.has_consent('health_data_processing'), 'consent withdrawn');
  perform test.throws($q$update public.profile_private set height_cm = 171$q$, 'row-level security');
  perform test.assert((select count(*) from public.profile_private) = 1, 'owner can still read after withdrawal');
  perform test.assert((select count(*) from public.consents) = 2, 'consent history preserved');

  -- Owner isolation: B cannot see A's private rows or consents.
  perform test.as_user(b);
  perform test.assert((select count(*) from public.profile_private) = 0, 'B cannot read A private profile');
  perform test.assert((select count(*) from public.consents) = 0, 'B cannot read A consents');
  perform test.assert((select count(*) from public.profiles) = 1, 'B sees only own profile');

  -- Anonymous callers have nothing.
  perform test.as_anon();
  perform test.throws($q$select * from public.profiles$q$, 'permission denied');
  perform test.throws($q$select public.complete_onboarding()$q$, 'permission denied');
  perform test.as_admin();
end $$;
