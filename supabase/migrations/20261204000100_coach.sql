-- Fit Concierge: conversations, confirmed actions, Daily Fit Plans, weekly reviews, AI usage metering with atomic budget and quota enforcement,
-- and kill-switch flags. Everything personal is owner-only. People never write assistant text, actions or usage: trusted server code does.

-- ========== Feature flags and AI kill switches ==========
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  enabled boolean not null default false,
  note text check (note is null or char_length(note) <= 300),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to authenticated;
grant update (enabled, note) on public.feature_flags to authenticated;
create policy flags_read on public.feature_flags for select to authenticated using (true);
create policy flags_staff_update on public.feature_flags for update to authenticated using (app.has_permission('flags.manage')) with check (app.has_permission('flags.manage'));
create or replace function app.flag_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
create trigger feature_flags_stamp before update on public.feature_flags for each row execute function app.flag_stamp();
-- Kill switches default to OFF (meaning AI is allowed). Turning one ON stops that feature everywhere.
insert into public.feature_flags (key, note) values
  ('ai.kill_all', 'Stops every billable AI request'),
  ('ai.kill.food_photo', 'Stops meal photo analysis'),
  ('ai.kill.concierge_chat', 'Stops the Fit Concierge chat'),
  ('ai.kill.weekly_review', 'Stops weekly reviews')
on conflict (key) do nothing;

-- Extend the audit trigger to record flag changes.
create or replace function app.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end; v_detail jsonb; v_id text;
begin
  if tg_table_name = 'licences' then
    v_id := v_row ->> 'id'; v_detail := jsonb_build_object('op', tg_op, 'status', v_row ->> 'status', 'territories', v_row -> 'territories');
  elsif tg_table_name = 'content_reviews' then
    v_id := v_row ->> 'id'; v_detail := jsonb_build_object('workout_id', v_row ->> 'workout_id', 'type', v_row ->> 'review_type', 'outcome', v_row ->> 'outcome');
  elsif tg_table_name = 'workouts' then
    v_id := v_row ->> 'id'; v_detail := jsonb_build_object('status', v_row ->> 'status', 'from', case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'status' end);
  elsif tg_table_name = 'staff_roles' then
    v_id := v_row ->> 'user_id'; v_detail := jsonb_build_object('op', tg_op, 'role', v_row ->> 'role');
  elsif tg_table_name = 'feature_flags' then
    v_id := v_row ->> 'key'; v_detail := jsonb_build_object('enabled', v_row ->> 'enabled', 'from', case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'enabled' end);
  else
    v_id := v_row ->> 'id'; v_detail := '{}'::jsonb;
  end if;
  perform app.audit_write(tg_op || ' ' || tg_table_name, tg_table_name, v_id, v_detail);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger feature_flags_audit after update on public.feature_flags for each row execute function app.audit_row();

-- ========== AI usage metering, quotas and budget (server-written only) ==========
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  -- Kept for cost accounting when an account is deleted, with the person detached (see the append-only trigger).
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null check (feature in ('food_photo', 'fridge_to_meal', 'meal_plan', 'food_swap', 'menu_assist', 'concierge_chat', 'weekly_review', 'voice')),
  model text not null check (char_length(model) <= 60),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  outcome text not null check (outcome in ('ok', 'schema_rejected', 'output_rejected', 'provider_error', 'risk_referral', 'safety_redirect')),
  created_at timestamptz not null default clock_timestamp()
);
create index ai_usage_user_idx on public.ai_usage_events (user_id, created_at desc);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
grant select on public.ai_usage_events to authenticated;
create policy ai_usage_select_own on public.ai_usage_events for select to authenticated using (user_id = (select auth.uid()));
-- Append-only. The single exception is the database detaching a deleted person (user_id -> null): nothing else may change, and rows are never deleted.
create or replace function app.ai_usage_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
     and (new.id, new.feature, new.model, new.input_tokens, new.output_tokens, new.cost_usd, new.outcome, new.created_at)
         is not distinct from (old.id, old.feature, old.model, old.input_tokens, old.output_tokens, old.cost_usd, old.outcome, old.created_at) then
    return new;
  end if;
  raise exception 'ai_usage_events_is_append_only' using errcode = 'insufficient_privilege';
end $$;
create trigger ai_usage_no_change before update or delete on public.ai_usage_events for each row execute function app.ai_usage_immutable();

create table public.ai_user_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  feature text not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, month, feature)
);
alter table public.ai_user_usage enable row level security;
revoke all on public.ai_user_usage from anon, authenticated;
grant select on public.ai_user_usage to authenticated;
create policy ai_user_usage_select_own on public.ai_user_usage for select to authenticated using (user_id = (select auth.uid()));

-- The application-side monthly ceiling. NOT a guarantee of the provider's bill (see docs/AI_COST_CONTROLS.md): pair it with the provider's own limit.
create table public.ai_budget (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ceiling_usd numeric(10, 2) not null check (ceiling_usd > 0),
  settled_usd numeric(12, 6) not null default 0 check (settled_usd >= 0),
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd >= 0)
);
alter table public.ai_budget enable row level security;
revoke all on public.ai_budget from anon, authenticated;
-- Server-only: an explicit deny-all policy documents that no signed-in person can read or write the budget.
create policy ai_budget_no_access on public.ai_budget for all to authenticated using (false) with check (false);

-- Atomic: the UPDATE ... WHERE takes the row lock, so concurrent requests are serialized and the ceiling cannot be oversubscribed.
create or replace function public.ai_budget_reserve(p_month text, p_worst numeric, p_ceiling numeric default 50) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_worst is null or p_worst < 0 then return false; end if;
  insert into public.ai_budget (month, ceiling_usd) values (p_month, p_ceiling) on conflict (month) do nothing;
  update public.ai_budget set reserved_usd = reserved_usd + p_worst where month = p_month and settled_usd + reserved_usd + p_worst <= ceiling_usd;
  get diagnostics n = row_count;
  return n = 1;
end $$;
create or replace function public.ai_budget_settle(p_month text, p_reserved numeric, p_actual numeric) returns table (settled numeric, ceiling numeric) language sql security definer set search_path = '' as $$
  update public.ai_budget set reserved_usd = greatest(0, reserved_usd - p_reserved), settled_usd = settled_usd + greatest(0, p_actual)
   where month = p_month returning settled_usd, ceiling_usd
$$;
-- Per-person monthly allowance: also atomic. Returns false once the limit is reached.
create or replace function public.ai_quota_consume(p_user uuid, p_month text, p_feature text, p_limit integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.ai_user_usage (user_id, month, feature, count) values (p_user, p_month, p_feature, 0) on conflict do nothing;
  update public.ai_user_usage set count = count + 1 where user_id = p_user and month = p_month and feature = p_feature and count < p_limit;
  get diagnostics n = row_count;
  return n = 1;
end $$;
create or replace function public.ai_quota_refund(p_user uuid, p_month text, p_feature text) returns void language sql security definer set search_path = '' as $$
  update public.ai_user_usage set count = greatest(0, count - 1) where user_id = p_user and month = p_month and feature = p_feature
$$;
revoke all on function public.ai_budget_reserve(text, numeric, numeric), public.ai_budget_settle(text, numeric, numeric), public.ai_quota_consume(uuid, text, text, integer), public.ai_quota_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_budget_reserve(text, numeric, numeric), public.ai_budget_settle(text, numeric, numeric), public.ai_quota_consume(uuid, text, text, integer), public.ai_quota_refund(uuid, text, text) to service_role;

-- ========== Conversations ==========
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null default 'Conversation' check (char_length(title) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
revoke all on public.ai_conversations from anon, authenticated;
grant select, delete on public.ai_conversations to authenticated;
grant insert (title) on public.ai_conversations to authenticated;
grant update (title) on public.ai_conversations to authenticated;
create policy conv_select_own on public.ai_conversations for select to authenticated using (user_id = (select auth.uid()));
create policy conv_insert_own on public.ai_conversations for insert to authenticated with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy conv_update_own on public.ai_conversations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy conv_delete_own on public.ai_conversations for delete to authenticated using (user_id = (select auth.uid()));

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  because jsonb not null default '[]' check (jsonb_typeof(because) = 'array'),
  support_referral boolean not null default false,
  -- True when the reply used the person's own records (requires the separate personalization consent, enforced by the server).
  used_personal_data boolean not null default false,
  provider text not null default 'mock' check (provider in ('mock', 'live')),
  created_at timestamptz not null default clock_timestamp()
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, seq);
alter table public.ai_messages enable row level security;
revoke all on public.ai_messages from anon, authenticated;
grant select, delete on public.ai_messages to authenticated;
grant insert (conversation_id, role, content) on public.ai_messages to authenticated;
create policy msg_select_own on public.ai_messages for select to authenticated using (user_id = (select auth.uid()));
-- People can write only their own USER messages. Assistant messages, reasons and personalization flags come from trusted server code.
create policy msg_insert_own_user on public.ai_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'user' and app.has_consent('health_data_processing')
              and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy msg_delete_own on public.ai_messages for delete to authenticated using (user_id = (select auth.uid()));

-- Changes the coach proposes. Created by the server; the person decides. Nothing is applied until status becomes 'applied' by the person's confirmation.
create table public.coach_actions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.ai_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('update_daily_plan', 'add_workout', 'swap_meal', 'adjust_goal', 'add_habit')),
  summary text not null check (char_length(summary) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index coach_actions_msg_idx on public.coach_actions (message_id);
create or replace function app.coach_action_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.message_id, new.user_id, new.kind, new.summary, new.payload) is distinct from (old.id, old.message_id, old.user_id, old.kind, old.summary, old.payload) then
    raise exception 'coach_action_immutable' using errcode = 'check_violation';
  end if;
  if old.status <> 'proposed' then raise exception 'coach_action_already_decided' using errcode = 'check_violation'; end if;
  if new.status = 'applied' and not app.has_consent('health_data_processing') then raise exception 'consent_required' using errcode = 'check_violation'; end if;
  new.decided_at := now();
  return new;
end $$;
create trigger coach_actions_guard before update on public.coach_actions for each row execute function app.coach_action_guard();
alter table public.coach_actions enable row level security;
revoke all on public.coach_actions from anon, authenticated;
grant select on public.coach_actions to authenticated;
grant update (status) on public.coach_actions to authenticated;
create policy actions_select_own on public.coach_actions for select to authenticated using (user_id = (select auth.uid()));
create policy actions_decide_own on public.coach_actions for update to authenticated
  using (user_id = (select auth.uid()) and status = 'proposed') with check (user_id = (select auth.uid()) and status in ('applied', 'dismissed'));

-- Retention (OWNER DECISION PENDING: 90 days proposed). Server job: remove old conversations; people can also delete theirs at any time.
create or replace function public.coach_purge_old(p_days integer default 90) returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.ai_conversations where updated_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.coach_purge_old(integer) from public, anon, authenticated;
grant execute on function public.coach_purge_old(integer) to service_role;

-- ========== Daily Fit Plans ==========
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_date date not null,
  mode text not null default 'normal' check (mode in ('normal', 'busy', 'travel', 'comeback')),
  generated_by text not null default 'rules' check (generated_by in ('rules', 'coach')),
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);
create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  position smallint not null check (position between 0 and 30),
  kind text not null check (kind in ('workout', 'meal', 'habit', 'goal')),
  title text not null check (char_length(title) between 1 and 120),
  detail text check (detail is null or char_length(detail) <= 300),
  why text check (why is null or char_length(why) <= 300),
  ref jsonb check (ref is null or jsonb_typeof(ref) = 'object'),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index daily_plan_items_plan_idx on public.daily_plan_items (plan_id, position);
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
revoke all on public.daily_plans, public.daily_plan_items from anon, authenticated;
grant select, delete on public.daily_plans, public.daily_plan_items to authenticated;
grant insert (plan_date, mode, generated_by) on public.daily_plans to authenticated;
grant update (mode) on public.daily_plans to authenticated;
grant insert (plan_id, position, kind, title, detail, why, ref, done_at) on public.daily_plan_items to authenticated;
grant update (done_at) on public.daily_plan_items to authenticated;
create policy plans_select_own_daily on public.daily_plans for select to authenticated using (user_id = (select auth.uid()));
create policy plans_insert_own_daily on public.daily_plans for insert to authenticated with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy plans_update_own_daily on public.daily_plans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy plans_delete_own_daily on public.daily_plans for delete to authenticated using (user_id = (select auth.uid()));
create policy dpi_select_own on public.daily_plan_items for select to authenticated using (user_id = (select auth.uid()));
create policy dpi_insert_own on public.daily_plan_items for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing') and exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy dpi_update_own on public.daily_plan_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy dpi_delete_own on public.daily_plan_items for delete to authenticated using (user_id = (select auth.uid()));

-- ========== Weekly reviews ==========
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  provider text not null default 'mock' check (provider in ('mock', 'live')),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.weekly_reviews enable row level security;
revoke all on public.weekly_reviews from anon, authenticated;
grant select, delete on public.weekly_reviews to authenticated;
grant insert (week_start, content, provider) on public.weekly_reviews to authenticated;
create policy reviews_select_own_weekly on public.weekly_reviews for select to authenticated using (user_id = (select auth.uid()));
-- A review reads the person's own records, so it needs both the health-data and the AI-personalization consents.
create policy reviews_insert_own_weekly on public.weekly_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing') and app.has_consent('ai_coach_personalization'));
create policy reviews_delete_own_weekly on public.weekly_reviews for delete to authenticated using (user_id = (select auth.uid()));
