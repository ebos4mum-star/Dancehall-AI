-- Household meals and grocery coordination. A small group (up to 6 people) shares ONLY meal ideas for the week and one grocery list.
-- Privacy model: no weights, goals, calories, food diary, workouts or coach data is ever visible to a housemate, and none of those tables
-- is touched here. Joining needs a single-use, expiring invite code (stored hashed). Leaving is always possible and immediate.
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.households enable row level security;

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, member_id)
);
create index household_members_member_idx on public.household_members (member_id);
-- A person belongs to at most one household (keeps the privacy model simple).
create unique index household_members_one_per_person on public.household_members (member_id);
alter table public.household_members enable row level security;

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code_hash bytea not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.household_invites enable row level security;

create table public.household_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index household_meals_idx on public.household_meals (household_id, day);
alter table public.household_meals enable row level security;

create table public.household_grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  quantity text check (quantity is null or char_length(quantity) <= 20),
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index household_grocery_idx on public.household_grocery_items (household_id, created_at);
alter table public.household_grocery_items enable row level security;

create or replace function app.is_household_member(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = p_household and m.member_id = (select auth.uid()));
$$;
create or replace function app.is_household_owner(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = p_household and m.member_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on function app.is_household_member(uuid), app.is_household_owner(uuid) from public, anon;
grant execute on function app.is_household_member(uuid), app.is_household_owner(uuid) to authenticated;

-- Reads: members only. All writes to households/membership/invites go through the functions below.
revoke all on public.households, public.household_members, public.household_invites, public.household_meals, public.household_grocery_items from anon, authenticated;
grant select on public.households, public.household_members, public.household_meals, public.household_grocery_items to authenticated;
create policy households_select on public.households for select to authenticated using (app.is_household_member(id));
create policy household_members_select on public.household_members for select to authenticated using (app.is_household_member(household_id));
-- Invites: only the owner reads them (hashes only); no direct writes.
grant select on public.household_invites to authenticated;
create policy household_invites_select on public.household_invites for select to authenticated using (app.is_household_owner(household_id));

grant insert (household_id, day, meal_type, title) on public.household_meals to authenticated;
grant delete on public.household_meals to authenticated;
create policy household_meals_select on public.household_meals for select to authenticated using (app.is_household_member(household_id));
create policy household_meals_insert on public.household_meals for insert to authenticated
  with check (app.is_household_member(household_id) and added_by = (select auth.uid()));
create policy household_meals_delete on public.household_meals for delete to authenticated using (app.is_household_member(household_id));

grant insert (household_id, name, quantity) on public.household_grocery_items to authenticated;
grant update (checked_by, checked_at) on public.household_grocery_items to authenticated;
grant delete on public.household_grocery_items to authenticated;
create policy household_grocery_select on public.household_grocery_items for select to authenticated using (app.is_household_member(household_id));
create policy household_grocery_insert on public.household_grocery_items for insert to authenticated
  with check (app.is_household_member(household_id) and added_by = (select auth.uid()));
-- A tick may only be recorded as the caller (or cleared).
create policy household_grocery_update on public.household_grocery_items for update to authenticated
  using (app.is_household_member(household_id))
  with check (app.is_household_member(household_id) and (checked_by is null or checked_by = (select auth.uid())));
create policy household_grocery_delete on public.household_grocery_items for delete to authenticated using (app.is_household_member(household_id));

create or replace function public.household_create(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); hid uuid;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where member_id = me) then
    raise exception 'already_in_household' using errcode = 'check_violation';
  end if;
  insert into public.households (name, created_by) values (p_name, me) returning id into hid;
  insert into public.household_members (household_id, member_id, role) values (hid, me, 'owner');
  return hid;
end $$;

-- Returns the plain code ONCE; only its hash is stored. Valid 48 hours, single use.
create or replace function public.household_create_invite(p_household uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare code text := upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if not app.is_household_owner(p_household) then raise exception 'not_owner' using errcode = 'insufficient_privilege'; end if;
  if (select count(*) from public.household_members where household_id = p_household) >= 6 then
    raise exception 'household_full' using errcode = 'check_violation';
  end if;
  insert into public.household_invites (household_id, code_hash, created_by, expires_at)
  values (p_household, sha256(convert_to(code, 'utf8')), (select auth.uid()), now() + interval '48 hours');
  return code;
end $$;

create or replace function public.household_join(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); inv public.household_invites;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where member_id = me) then
    raise exception 'already_in_household' using errcode = 'check_violation';
  end if;
  select * into inv from public.household_invites
   where code_hash = sha256(convert_to(upper(btrim(p_code)), 'utf8')) and used_at is null and expires_at > now() for update;
  if not found then raise exception 'invalid_invite' using errcode = 'check_violation'; end if;
  if (select count(*) from public.household_members where household_id = inv.household_id) >= 6 then
    raise exception 'household_full' using errcode = 'check_violation';
  end if;
  update public.household_invites set used_at = now() where id = inv.id;
  insert into public.household_members (household_id, member_id, role) values (inv.household_id, me, 'member');
  return inv.household_id;
end $$;

-- Leave at any time. If the owner leaves, the longest-standing member becomes owner; the last person out deletes the household.
create or replace function public.household_leave() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); m public.household_members; heir uuid;
begin
  select * into m from public.household_members where member_id = me;
  if not found then return; end if;
  delete from public.household_members where member_id = me;
  select member_id into heir from public.household_members where household_id = m.household_id order by joined_at, member_id limit 1;
  if heir is null then
    delete from public.households where id = m.household_id;
  elsif m.role = 'owner' then
    update public.household_members set role = 'owner'
     where household_id = m.household_id and member_id = heir
       and not exists (select 1 from public.household_members x where x.household_id = m.household_id and x.role = 'owner');
  end if;
end $$;

-- The owner can remove someone else.
create or replace function public.household_remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); hid uuid;
begin
  select household_id into hid from public.household_members where member_id = me and role = 'owner';
  if hid is null then raise exception 'not_owner' using errcode = 'insufficient_privilege'; end if;
  if p_member = me then raise exception 'use_leave' using errcode = 'check_violation'; end if;
  delete from public.household_members where household_id = hid and member_id = p_member;
end $$;

-- Deleting an account removes the membership (FK cascade); this keeps ownership and emptiness consistent afterwards.
create or replace function app.household_after_member_delete() returns trigger language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if not exists (select 1 from public.household_members where household_id = old.household_id) then
    delete from public.households where id = old.household_id;
  elsif old.role = 'owner' and not exists (select 1 from public.household_members where household_id = old.household_id and role = 'owner') then
    select member_id into heir from public.household_members where household_id = old.household_id order by joined_at, member_id limit 1;
    update public.household_members set role = 'owner' where household_id = old.household_id and member_id = heir;
  end if;
  return null;
end $$;
create trigger household_members_after_delete after delete on public.household_members for each row execute function app.household_after_member_delete();

revoke all on function public.household_create(text), public.household_create_invite(uuid), public.household_join(text),
  public.household_leave(), public.household_remove_member(uuid) from public, anon;
grant execute on function public.household_create(text), public.household_create_invite(uuid), public.household_join(text),
  public.household_leave(), public.household_remove_member(uuid) to authenticated;
