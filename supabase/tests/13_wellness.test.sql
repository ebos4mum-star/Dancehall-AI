do $$
declare a uuid; b uuid; e1 uuid;
begin
  a := test.make_user('well-a@example.test'); b := test.make_user('well-b@example.test');
  perform test.as_user(a);
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 250)$q$, 'row-level security');  -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 250) returning id into e1;
  perform test.assert((select user_id = a from public.wellness_entries where id = e1), 'an entry is owned by the caller');

  -- ranges and labels mirror the shared module
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 0)$q$, 'wellness_amount_range');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 6000)$q$, 'wellness_amount_range');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('sleep', current_date, 20)$q$, 'wellness_amount_range');
  insert into public.wellness_entries (kind, day, amount, label) values ('sleep', current_date, 7.5, 'rested');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, label) values ('sleep', current_date - 1, 7, 'amazing')$q$, 'wellness_label_valid');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('sleep', current_date, 6)$q$, 'duplicate key');   -- one night once
  insert into public.wellness_entries (kind, day, amount, amount2) values ('walk', current_date, 30, 2.4);
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, amount2) values ('hydration', current_date, 250, 1)$q$, 'wellness_distance_walk_only');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, amount2) values ('walk', current_date, 30, 500)$q$, 'wellness_distance_walk_only');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('measurement', current_date, 80)$q$, 'wellness_label_valid');   -- site required
  insert into public.wellness_entries (kind, day, amount, label) values ('measurement', current_date, 82, 'waist');
  insert into public.wellness_entries (kind, day, amount, label) values ('hunger', current_date, 0, 'comfortable'), ('recovery', current_date, 0, 'ok');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, label) values ('hunger', current_date, 3, 'full')$q$, 'wellness_amount_range');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('walk', current_date + 30, 20)$q$, 'wellness_day_not_in_future');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount) values ('bogus', current_date, 1)$q$, 'check constraint');

  -- idempotency: the same client key records nothing twice
  insert into public.wellness_entries (kind, day, amount, client_key) values ('strength', current_date, 20, 'key-abcdef-1');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, client_key) values ('strength', current_date, 20, 'key-abcdef-1')$q$, 'duplicate key');
  perform test.throws($q$insert into public.wellness_entries (kind, day, amount, client_key) values ('strength', current_date, 20, 'short')$q$, 'check constraint');

  -- grants: ownership and kind cannot be rewritten, rows cannot be edited in place
  perform test.throws(format($q$insert into public.wellness_entries (user_id, kind, day, amount) values (%L, 'hydration', current_date, 100)$q$, b), 'permission denied');
  perform test.throws(format($q$update public.wellness_entries set amount = 999 where id = %L$q$, e1), 'permission denied');

  -- isolation
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.wellness_entries), 'another user sees no entries');
  delete from public.wellness_entries where id = e1;
  perform test.as_user(a);
  perform test.assert((select count(*) = 1 from public.wellness_entries where id = e1), 'another user cannot delete an entry');

  -- the owner can delete (data correction and deletion)
  delete from public.wellness_entries where id = e1;
  perform test.assert((select count(*) = 0 from public.wellness_entries where id = e1), 'the owner can delete an entry');

  -- preferences
  insert into public.wellness_prefs (data) values ('{"goalIntent":"fitness"}');
  perform test.throws($q$insert into public.wellness_prefs (data) values ('{}')$q$, 'duplicate key');
  update public.wellness_prefs set data = '{"goalIntent":"maintain"}', updated_at = now();
  perform test.assert((select data->>'goalIntent' = 'maintain' from public.wellness_prefs), 'preferences can change');
  perform test.throws($q$update public.wellness_prefs set data = to_jsonb(repeat('x', 5000))$q$, 'check constraint');
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.wellness_prefs), 'another user sees no preferences');
  perform test.throws($q$insert into public.wellness_prefs (data) values ('{}')$q$, 'row-level security');  -- b has not consented
  perform test.as_anon();
  perform test.throws($q$select * from public.wellness_entries$q$, 'permission denied');
  perform test.throws($q$select * from public.wellness_prefs$q$, 'permission denied');
end $$;

-- Account deletion removes every wellness row for that person (and only theirs). Uses its own users so the isolation test still has seeded rows.
do $$
declare c uuid; d uuid;
begin
  perform test.as_admin();
  c := test.make_user('well-c@example.test'); d := test.make_user('well-d@example.test');
  perform test.as_user(c);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 250);
  insert into public.wellness_prefs (data) values ('{"goalIntent":"lose"}');
  perform test.as_user(d);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.wellness_entries (kind, day, amount) values ('hydration', current_date, 500);
  perform test.as_admin();
  delete from auth.users where id = c;
  perform test.assert((select count(*) = 0 from public.wellness_entries where user_id = c), 'deleting an account removes its wellness entries');
  perform test.assert((select count(*) = 0 from public.wellness_prefs where user_id = c), 'deleting an account removes its wellness preferences');
  perform test.assert((select count(*) = 1 from public.wellness_entries where user_id = d), 'another person''s wellness data is untouched');
end $$;
