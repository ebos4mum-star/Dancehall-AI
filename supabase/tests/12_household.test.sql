do $$
declare a uuid; b uuid; c uuid; h uuid; code text; code2 text; m uuid; n int;
begin
  a := test.make_user('hh-a@example.test'); b := test.make_user('hh-b@example.test'); c := test.make_user('hh-c@example.test');
  perform test.as_user(a);
  h := public.household_create('Home');
  perform test.throws($q$select public.household_create('Second')$q$, 'already_in_household');
  perform test.throws($q$insert into public.households (name) values ('direct')$q$, 'permission denied');
  perform test.throws(format($q$insert into public.household_members (household_id, member_id) values (%L, %L)$q$, h, a), 'permission denied');
  code := public.household_create_invite(h);
  perform test.assert(length(code) = 10, 'an invite code is returned once');
  perform test.assert((select count(*) = 1 from public.household_invites), 'owner sees the invite row');
  perform test.assert(not exists (select 1 from public.household_invites where code_hash = convert_to(code, 'utf8')), 'code is stored hashed');

  -- outsider sees nothing and cannot write
  perform test.as_user(c);
  perform test.assert((select count(*) = 0 from public.households), 'outsider sees no household');
  perform test.throws(format($q$insert into public.household_meals (household_id, day, meal_type, title) values (%L, current_date, 'dinner', 'x')$q$, h), 'row-level security');
  perform test.assert(public.household_join('WRONGCODE1') is null, 'a wrong code joins nothing (returns null, and is counted)');
  perform test.throws(format($q$select public.household_create_invite(%L)$q$, h), 'not_owner');
  perform test.assert((select count(*) = 0 from public.household_invites), 'outsider cannot read invites');

  -- join with the code; single use
  perform test.as_user(b);
  perform test.assert(public.household_join(' ' || lower(code) || ' ') = h, 'join works, case and spaces forgiven');
  perform test.throws(format($q$select public.household_join(%L)$q$, code), 'already_in_household');
  perform test.as_user(c);
  perform test.assert(public.household_join(code) is null, 'a used code joins nothing');   -- already used

  -- shared meals and grocery list
  perform test.as_user(b);
  insert into public.household_meals (household_id, day, meal_type, title) values (h, current_date, 'dinner', 'Rice and peas');
  perform test.assert((select added_by = b from public.household_meals limit 1), 'added_by is the caller');
  perform test.throws(format($q$insert into public.household_meals (household_id, day, meal_type, title, added_by) values (%L, current_date, 'lunch', 'x', %L)$q$, h, a), 'permission denied');
  perform test.throws(format($q$insert into public.household_meals (household_id, day, meal_type, title) values (%L, current_date, 'brunch', 'x')$q$, h), 'check constraint');
  insert into public.household_grocery_items (household_id, name, quantity) values (h, 'Plantain', '4');
  perform test.as_user(a);
  perform test.assert((select count(*) = 1 from public.household_meals), 'housemate sees the shared meal');
  update public.household_grocery_items set checked_by = a, checked_at = now();
  perform test.assert((select checked_by = a from public.household_grocery_items), 'housemate can tick an item');
  perform test.throws(format($q$update public.household_grocery_items set checked_by = %L$q$, b), 'row-level security');
  perform test.throws($q$update public.household_grocery_items set name = 'renamed'$q$, 'permission denied');

  -- no health data leaks: a housemate cannot read the other's private tables
  perform test.assert((select count(*) = 0 from public.weight_entries), 'housemate sees no weights');
  perform test.assert((select count(*) = 0 from public.food_logs), 'housemate sees no food diary');

  -- full household, remove, leave, ownership transfer
  code2 := public.household_create_invite(h);
  perform test.as_user(b);
  perform test.throws(format($q$select public.household_remove_member(%L)$q$, a), 'not_owner');
  perform test.as_user(a);
  perform public.household_remove_member(b);
  perform test.assert((select count(*) = 1 from public.household_members), 'owner removed a member');
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.household_meals), 'removed member loses access');
  perform test.as_user(c);
  perform public.household_join(code2);
  perform test.as_user(a);
  perform public.household_leave();
  perform test.as_user(c);
  perform test.assert((select role = 'owner' from public.household_members where member_id = c), 'ownership passes to the remaining member');
  perform public.household_leave();
  perform test.as_admin();
  perform test.assert((select count(*) = 0 from public.households), 'last person out deletes the household and its lists');
  perform test.assert((select count(*) = 0 from public.household_grocery_items), 'lists are deleted with it');
  perform test.as_anon();
  perform test.throws($q$select * from public.households$q$, 'permission denied');
  perform test.throws($q$select public.household_create('x')$q$, 'permission denied');
end $$;

-- Attempt limit: 5 incorrect codes in 15 minutes pause joining for that person only; a correct join afterwards clears their count.
do $$
declare a uuid; b uuid; x uuid; h uuid; code text; i int;
begin
  perform test.as_admin();
  a := test.make_user('hh-limit-a@example.test'); x := test.make_user('hh-limit-x@example.test'); b := test.make_user('hh-limit-b@example.test');
  perform test.as_user(a);
  h := public.household_create('Limit home');
  code := public.household_create_invite(h);
  perform test.as_user(x);
  for i in 1..5 loop perform test.assert(public.household_join('BADCODE' || i) is null, 'incorrect code ' || i || ' is refused'); end loop;
  perform test.throws(format($q$select public.household_join(%L)$q$, code), 'too_many_attempts');   -- even the right code, while paused
  perform test.assert((select count(*) = 5 from public.household_join_attempts), 'a person sees only their own attempts');
  perform test.throws($q$insert into public.household_join_attempts (user_id) values (auth.uid())$q$, 'permission denied');   -- cannot write or reset their own count
  perform test.throws($q$delete from public.household_join_attempts$q$, 'permission denied');
  -- Someone else is not affected by x's attempts.
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.household_join_attempts), 'another person sees none of those attempts');
  perform test.assert(public.household_join('BADCODE') is null, 'a typo or two is fine');
  perform test.assert(public.household_join(code) = h, 'a correct code still joins');
  perform test.assert((select count(*) = 0 from public.household_join_attempts), 'a correct join clears the count');
  -- After the window passes the pause ends.
  perform test.as_admin();
  update public.household_join_attempts set attempted_at = now() - interval '16 minutes' where user_id = x;
  perform test.as_user(x);
  perform test.assert(public.household_join('BADCODE6') is null, 'after the window, attempts are allowed again');
end $$;
