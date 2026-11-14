-- Runs the shared goal cases against the real trigger. The TypeScript mirror (hardCheckGoal) is tested against the same file,
-- so the offline mock and the database cannot drift apart.
\set cases `cat supabase/tests/goal-cases.json`
select set_config('test.cases', :'cases', false);
do $$
declare
  u uuid := test.make_user('parity@example.test');
  doc jsonb := current_setting('test.cases')::jsonb;
  c jsonb; got text; n int := 0;
begin
  perform test.as_user(u);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.profile_private (user_id, birth_date, height_cm) values (u, (doc #>> '{adult,birthDate}')::date, 170);
  for c in select * from jsonb_array_elements(doc -> 'cases') loop
    update public.profile_private set height_cm = (c ->> 'heightCm')::numeric;
    got := null;
    begin
      insert into public.goals (type, period, start_date, end_date, start_kg, target_kg)
      values (c ->> 'type', c ->> 'period', (c ->> 'startDate')::date, (c ->> 'endDate')::date, (c ->> 'startKg')::numeric, (c ->> 'targetKg')::numeric);
    exception when others then
      got := substring(sqlerrm from '^[a-z_]+');
    end;
    perform set_config('role', 'none', false);
    delete from public.goals where user_id = u;
    perform test.as_user(u);
    if got is distinct from (c ->> 'expect') then
      raise exception 'goal case "%": database said %, expected %', c ->> 'name', coalesce(got, 'accepted'), coalesce(c ->> 'expect', 'accepted');
    end if;
    n := n + 1;
  end loop;
  perform test.as_admin();
  raise notice 'goal parity: % cases agree', n;
end $$;
