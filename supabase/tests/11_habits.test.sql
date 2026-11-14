do $$
declare a uuid; b uuid; h1 uuid; h2 uuid; n int;
begin
  a := test.make_user('habit-a@example.test'); b := test.make_user('habit-b@example.test');
  perform test.as_user(a);
  perform test.throws($q$insert into public.habits (name) values ('Stretch')$q$, 'row-level security');   -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  insert into public.habits (name) values ('Stretch for two minutes') returning id into h1;
  insert into public.habits (name) values ('Drink water') returning id into h2;
  perform test.assert((select user_id = a from public.habits where id = h1), 'a habit is owned by the caller');
  perform test.throws($q$insert into public.habits (name) values ('   ')$q$, 'check constraint');
  perform test.throws($q$insert into public.habits (name) values (repeat('x', 41))$q$, 'check constraint');
  perform test.throws(format($q$insert into public.habits (user_id, name) values (%L, 'x')$q$, b), 'permission denied');

  -- the five-habit limit, and archiving frees a slot
  insert into public.habits (name) values ('Walk'), ('Dance break'), ('Sleep early');
  perform test.throws($q$insert into public.habits (name) values ('A sixth habit')$q$, 'habit_limit_reached');
  update public.habits set archived_at = now() where id = h2;
  insert into public.habits (name) values ('A sixth habit, after archiving one');

  -- check-ins: one per habit per day, own and active habits only, never far in the future
  insert into public.habit_checkins (habit_id, day) values (h1, current_date);
  perform test.throws(format($q$insert into public.habit_checkins (habit_id, day) values (%L, current_date)$q$, h1), 'duplicate key');
  perform test.throws(format($q$insert into public.habit_checkins (habit_id, day) values (%L, current_date)$q$, h2), 'row-level security');   -- archived
  perform test.throws(format($q$insert into public.habit_checkins (habit_id, day) values (%L, current_date + 30)$q$, h1), 'habit_day_not_in_future');
  perform test.throws(format($q$insert into public.habit_checkins (user_id, habit_id, day) values (%L, %L, current_date - 1)$q$, b, h1), 'permission denied');

  -- column grants: only the name and archive time can change
  perform test.throws(format($q$update public.habits set user_id = %L where id = %L$q$, b, h1), 'permission denied');
  perform test.throws(format($q$update public.habit_checkins set day = current_date - 3 where habit_id = %L$q$, h1), 'permission denied');

  -- isolation
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.habits), 'another user sees no habits');
  perform test.assert((select count(*) = 0 from public.habit_checkins), 'another user sees no check-ins');
  perform test.throws(format($q$insert into public.habit_checkins (habit_id, day) values (%L, current_date - 1)$q$, h1), 'row-level security');
  update public.habits set name = 'hijack' where id = h1;
  delete from public.habit_checkins where habit_id = h1;
  perform test.as_user(a);
  perform test.assert((select name = 'Stretch for two minutes' from public.habits where id = h1), 'another user cannot rename it');
  perform test.assert((select count(*) = 1 from public.habit_checkins where habit_id = h1), 'another user cannot delete the check-in');

  -- un-checking removes the row; archived history stays readable
  delete from public.habit_checkins where habit_id = h1 and day = current_date;
  perform test.assert((select count(*) = 0 from public.habit_checkins where habit_id = h1), 'un-checking deletes the day');
  insert into public.habit_checkins (habit_id, day) values (h1, current_date - 1);
  perform test.assert((select archived_at is not null from public.habits where id = h2), 'an archived habit is kept');
  perform test.as_anon();
  perform test.throws($q$select * from public.habits$q$, 'permission denied');
end $$;
