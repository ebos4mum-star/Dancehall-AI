-- Test helpers (applied after migrations; test-only).
create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

-- Create a user as the service role would (the signup trigger creates the profile row).
create or replace function test.make_user(p_email text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v, p_email);
  return v;
end $$;

create or replace function test.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create or replace function test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  perform set_config('role', 'anon', false);
end $$;

create or replace function test.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

-- Assert that a statement fails with a message matching the pattern.
create or replace function test.throws(p_sql text, p_pattern text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then raise exception 'expected failure /%/ but statement succeeded: %', p_pattern, p_sql; end if;
  if v_msg !~* p_pattern then raise exception 'expected failure /%/ but got: % (statement: %)', p_pattern, v_msg, p_sql; end if;
end $$;

create or replace function test.assert(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ASSERTION FAILED: %', p_what; end if;
end $$;

-- Count rows affected by a DML statement.
create or replace function test.rows_affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
