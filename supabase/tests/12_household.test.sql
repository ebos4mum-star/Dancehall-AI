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
  perform test.throws($q$select public.household_join('WRONGCODE1')$q$, 'invalid_invite');
  perform test.throws(format($q$select public.household_create_invite(%L)$q$, h), 'not_owner');
  perform test.assert((select count(*) = 0 from public.household_invites), 'outsider cannot read invites');

  -- join with the code; single use
  perform test.as_user(b);
  perform test.assert(public.household_join(' ' || lower(code) || ' ') = h, 'join works, case and spaces forgiven');
  perform test.throws(format($q$select public.household_join(%L)$q$, code), 'already_in_household');
  perform test.as_user(c);
  perform test.throws(format($q$select public.household_join(%L)$q$, code), 'invalid_invite');   -- already used

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
