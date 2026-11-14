-- Account-deletion grace period is CONFIGURATION, not a finalized product policy. 30 days is a provisional default pending an owner and
-- counsel decision. Only trusted server code / migrations can change it; people can read it but never write it.
create table public.app_config (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  int_value integer not null check (int_value >= 0),
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;
create policy app_config_read on public.app_config for select to authenticated using (true);
insert into public.app_config (key, int_value, note) values
  ('account_deletion_grace_days', 30, 'PROVISIONAL default. Final waiting period is an owner/counsel decision.');

alter table public.account_deletion_requests alter column scheduled_for drop default;

create or replace function public.request_account_deletion() returns public.account_deletion_requests language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_days integer := coalesce((select int_value from public.app_config where key = 'account_deletion_grace_days'), 30);
  r public.account_deletion_requests;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.account_deletion_requests (user_id, scheduled_for) values (v_uid, now() + make_interval(days => v_days))
    on conflict (user_id) where status = 'pending' do nothing;
  select * into r from public.account_deletion_requests where user_id = v_uid and status = 'pending';
  return r;
end $$;
