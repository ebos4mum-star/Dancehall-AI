-- Dance fitness: staff permissions (MFA), audit log, licensing and territorial clearance, workout catalog, programs, review records
-- and workout sessions. Catalog content is public only after the publish gates pass; media is served only where licences are cleared.

-- ========== Staff roles, permissions and audit ==========
create table public.staff_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'content_editor', 'licensing_manager', 'moderator', 'nutrition_reviewer', 'fitness_reviewer', 'support', 'analyst')),
  granted_at timestamptz not null default now(),
  granted_by uuid
);
alter table public.staff_roles enable row level security;
revoke all on public.staff_roles from anon, authenticated;
grant select on public.staff_roles to authenticated;
-- A person can see their own role. Roles are granted only by trusted server code (no client write access).
create policy staff_roles_select_own on public.staff_roles for select to authenticated using (user_id = (select auth.uid()));

-- Mirrors ROLE_PERMISSIONS in packages/shared (a test keeps them equal).
create or replace function app.role_permissions(p_role text) returns text[] language sql immutable set search_path = '' as $$
  select case p_role
    when 'admin' then array['content.edit', 'content.publish', 'licensing.manage', 'moderation.review', 'nutrition.review', 'fitness.review', 'support.lookup', 'flags.manage', 'ai_costs.view', 'audit.view', 'staff.manage', 'analytics.view']
    when 'content_editor' then array['content.edit']
    when 'licensing_manager' then array['licensing.manage', 'content.publish']
    when 'moderator' then array['moderation.review']
    when 'nutrition_reviewer' then array['nutrition.review', 'content.edit']
    when 'fitness_reviewer' then array['fitness.review', 'content.edit']
    when 'support' then array['support.lookup']
    when 'analyst' then array['analytics.view', 'ai_costs.view']
    else array[]::text[]
  end
$$;

-- True only for a signed-in person with a staff role that grants the permission AND a verified second factor (aal2). No role skips MFA.
create or replace function app.has_permission(p_permission text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    ((select auth.jwt()) ->> 'aal') = 'aal2'
    and exists (select 1 from public.staff_roles r where r.user_id = (select auth.uid()) and p_permission = any (app.role_permissions(r.role))),
    false)
$$;
revoke all on function app.role_permissions(text), app.has_permission(text) from public, anon;
grant execute on function app.role_permissions(text), app.has_permission(text) to authenticated, service_role;

-- audit_log: append-only and hash-chained. Written only by trusted triggers.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor uuid,
  action text not null,
  table_name text not null,
  row_id text,
  detail jsonb not null default '{}',
  prev_hash text not null,
  hash text not null
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_select_staff on public.audit_log for select to authenticated using (app.has_permission('audit.view'));

create or replace function app.audit_stamp(p_prev text, p_actor uuid, p_action text, p_table text, p_row text, p_detail jsonb, p_at timestamptz) returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(
    p_prev || '|' || coalesce(p_actor::text, '') || '|' || p_action || '|' || p_table || '|' || coalesce(p_row, '') || '|' || p_detail::text || '|'
    || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'utf8')), 'hex')
$$;

create or replace function app.audit_write(p_action text, p_table text, p_row text, p_detail jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_prev text; v_at timestamptz := clock_timestamp(); v_actor uuid := (select auth.uid());
begin
  perform pg_advisory_xact_lock(727001); -- one writer at a time keeps the chain in order
  select hash into v_prev from public.audit_log order by id desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  insert into public.audit_log (at, actor, action, table_name, row_id, detail, prev_hash, hash)
  values (v_at, v_actor, p_action, p_table, p_row, p_detail, v_prev, app.audit_stamp(v_prev, v_actor, p_action, p_table, p_row, p_detail, v_at));
end $$;
revoke all on function app.audit_write(text, text, text, jsonb) from public, anon, authenticated;

-- Generic audit trigger function (row details only, never health data).
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
  else
    v_id := v_row ->> 'id'; v_detail := '{}'::jsonb;
  end if;
  perform app.audit_write(tg_op || ' ' || tg_table_name, tg_table_name, v_id, v_detail);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function app.audit_row() from public, anon, authenticated;

create or replace function app.audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = 'insufficient_privilege';
end $$;
create trigger audit_no_change before update or delete on public.audit_log for each row execute function app.audit_immutable();
create trigger audit_no_truncate before truncate on public.audit_log for each statement execute function app.audit_immutable();

-- Returns the id of the first row whose chain link is wrong, or null when the whole log verifies.
create or replace function public.audit_verify() returns bigint language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev text := repeat('0', 64);
begin
  if (select auth.uid()) is not null and not app.has_permission('audit.view') then raise exception 'permission denied' using errcode = 'insufficient_privilege'; end if;
  for r in select * from public.audit_log order by id loop
    if r.prev_hash <> v_prev or r.hash <> app.audit_stamp(r.prev_hash, r.actor, r.action, r.table_name, r.row_id, r.detail, r.at) then return r.id; end if;
    v_prev := r.hash;
  end loop;
  return null;
end $$;
revoke all on function public.audit_verify() from public, anon;
grant execute on function public.audit_verify() to authenticated, service_role;

-- ========== Licensing and territorial clearance ==========
create or replace function app.valid_territories(p_t text[]) returns boolean language sql immutable set search_path = '' as $$
  select p_t is not null and cardinality(p_t) >= 1 and (select bool_and(x ~ '^([A-Z]{2}|\*)$') from unnest(p_t) x)
$$;

create table public.licences (
  id uuid primary key default gen_random_uuid(),
  asset_kind text not null check (asset_kind in ('music', 'video', 'instructor_likeness', 'image', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  licensor text not null check (char_length(licensor) between 1 and 120),
  rights_summary text check (rights_summary is null or char_length(rights_summary) <= 2000),
  territories text[] not null check (app.valid_territories(territories)),
  starts_on date not null,
  ends_on date,
  status text not null default 'draft' check (status in ('draft', 'cleared', 'revoked')),
  -- Reference to the signed agreement (never the agreement itself). A licence cannot be cleared without one.
  evidence_ref text check (evidence_ref is null or char_length(evidence_ref) between 3 and 200),
  cleared_by uuid,
  cleared_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint licence_dates_ordered check (ends_on is null or ends_on >= starts_on),
  constraint cleared_needs_evidence check (status <> 'cleared' or (evidence_ref is not null and cleared_by is not null and cleared_at is not null))
);
create or replace function app.licence_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'cleared' and (tg_op = 'INSERT' or old.status is distinct from 'cleared') then
    new.cleared_by := (select auth.uid());
    new.cleared_at := now();
  end if;
  return new;
end $$;
create trigger licences_stamp before insert or update on public.licences for each row execute function app.licence_stamp();
create trigger licences_audit after insert or update on public.licences for each row execute function app.audit_row();

alter table public.licences enable row level security;
revoke all on public.licences from anon, authenticated;
grant select on public.licences to authenticated;
grant insert (asset_kind, title, licensor, rights_summary, territories, starts_on, ends_on, evidence_ref) on public.licences to authenticated;
grant update (title, licensor, rights_summary, territories, starts_on, ends_on, evidence_ref, status) on public.licences to authenticated;
create policy licences_staff_select on public.licences for select to authenticated using (app.has_permission('licensing.manage'));
create policy licences_staff_insert on public.licences for insert to authenticated with check (app.has_permission('licensing.manage'));
create policy licences_staff_update on public.licences for update to authenticated using (app.has_permission('licensing.manage')) with check (app.has_permission('licensing.manage'));

-- Cleared and in date (any territory) / cleared, in date and covering a territory.
create or replace function app.licence_valid(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.licences l where l.id = p_id and l.status = 'cleared' and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date))
$$;
create or replace function app.licence_allows(p_id uuid, p_country text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.licences l where l.id = p_id and l.status = 'cleared' and l.starts_on <= current_date and (l.ends_on is null or l.ends_on >= current_date)
                   and ('*' = any (l.territories) or (p_country is not null and p_country = any (l.territories))))
$$;
create or replace function app.user_country() returns text language sql stable security definer set search_path = '' as $$
  select country from public.profiles where id = (select auth.uid())
$$;
revoke all on function app.licence_valid(uuid), app.licence_allows(uuid, text), app.user_country() from public, anon;
grant execute on function app.licence_valid(uuid), app.licence_allows(uuid, text), app.user_country() to authenticated, service_role;

-- ========== Instructors ==========
create table public.instructors (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (bio is null or char_length(bio) <= 1000),
  -- Real instructors need a cleared likeness licence before they can be shown.
  likeness_licence_id uuid references public.licences (id),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  is_synthetic boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create or replace function app.instructor_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.is_synthetic is distinct from old.is_synthetic then raise exception 'is_synthetic_immutable' using errcode = 'check_violation'; end if;
  if (select auth.uid()) is not null and tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'create_as_draft' using errcode = 'check_violation'; end if;
  if (select auth.uid()) is not null and tg_op = 'UPDATE' and new.status is distinct from old.status and not app.has_permission('content.publish') then
    raise exception 'publish_permission_required' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') and not new.is_synthetic then
    if new.likeness_licence_id is null or not app.licence_valid(new.likeness_licence_id) then
      raise exception 'publish_blocked_likeness_licence: a cleared likeness licence is required' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger instructors_guard before insert or update on public.instructors for each row execute function app.instructor_guard();
alter table public.instructors enable row level security;
revoke all on public.instructors from anon, authenticated;
grant select on public.instructors to authenticated;
grant insert (id, display_name, bio, likeness_licence_id) on public.instructors to authenticated;
grant update (display_name, bio, likeness_licence_id, status) on public.instructors to authenticated;
create policy instructors_select on public.instructors for select to authenticated using (status = 'published' or app.has_permission('content.edit') or app.has_permission('content.publish'));
create policy instructors_insert on public.instructors for insert to authenticated with check (app.has_permission('content.edit'));
create policy instructors_update on public.instructors for update to authenticated using (app.has_permission('content.edit') or app.has_permission('content.publish'))
  with check (app.has_permission('content.edit') or app.has_permission('content.publish'));

-- ========== Workouts ==========
-- Returns a description of the first structural problem, or null: warm-up, main section, cool-down, and a low-impact version of every block.
create or replace function app.blocks_problems(p_blocks jsonb) returns text language plpgsql immutable set search_path = '' as $$
declare b jsonb;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) = 0 then return 'no blocks'; end if;
  if not exists (select 1 from jsonb_array_elements(p_blocks) e where e ->> 'kind' = 'warmup') then return 'no warm-up'; end if;
  if not exists (select 1 from jsonb_array_elements(p_blocks) e where e ->> 'kind' = 'main') then return 'no main section'; end if;
  if not exists (select 1 from jsonb_array_elements(p_blocks) e where e ->> 'kind' = 'cooldown') then return 'no cool-down'; end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    if coalesce(btrim(b ->> 'lowImpactAlt'), '') = '' then return 'a block has no low-impact version'; end if;
    if coalesce((b ->> 'seconds')::numeric, 0) <= 0 then return 'a block has no duration'; end if;
  end loop;
  return null;
end $$;

create table public.workouts (
  id text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  title text not null check (char_length(title) between 1 and 80),
  style text not null check (style in ('afrobeats', 'amapiano', 'hip_hop', 'latin', 'bollywood', 'low_impact')),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  intensity text not null check (intensity in ('low', 'moderate', 'high')),
  impact text not null check (impact in ('low', 'moderate', 'high')),
  minutes smallint not null check (minutes between 3 and 90),
  quick_fit boolean generated always as (minutes in (5, 10, 15)) stored,
  summary text not null check (char_length(summary) between 1 and 400),
  instructor_id text references public.instructors (id),
  equipment text not null default 'none',
  content_origin text not null default 'original_text' check (content_origin in ('original_text', 'licensed', 'commissioned')),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  safety jsonb not null default '[]' check (jsonb_typeof(safety) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  published_at timestamptz,
  -- Sample content for development. Can only be set by trusted seeding and never changed; the app labels it everywhere.
  is_synthetic boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_browse_idx on public.workouts (status, style, minutes);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workout_id text not null references public.workouts (id) on delete cascade,
  kind text not null check (kind in ('video', 'audio', 'image')),
  storage_path text not null check (storage_path !~ '^/' and char_length(storage_path) <= 300),
  duration_s integer check (duration_s is null or duration_s > 0),
  licence_id uuid not null references public.licences (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index media_assets_workout_idx on public.media_assets (workout_id);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  -- Strict ordering of reviews (timestamps can tie inside one transaction); the latest review decides.
  seq bigint generated always as identity,
  workout_id text not null references public.workouts (id) on delete cascade,
  review_type text not null check (review_type in ('fitness', 'safety')),
  reviewer_id uuid not null default auth.uid(),
  outcome text not null check (outcome in ('approved', 'changes_requested')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index content_reviews_workout_idx on public.content_reviews (workout_id, seq desc);

create or replace function app.workout_guard() returns trigger language plpgsql set search_path = '' as $$
declare v_problem text; v_latest record; v_actor uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' and new.is_synthetic is distinct from old.is_synthetic then raise exception 'is_synthetic_immutable' using errcode = 'check_violation'; end if;
  if v_actor is not null then
    if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'create_as_draft' using errcode = 'check_violation'; end if;
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status and not app.has_permission('content.publish') then
        raise exception 'publish_permission_required' using errcode = 'insufficient_privilege';
      end if;
      if (new.title, new.style, new.level, new.intensity, new.impact, new.minutes, new.summary, new.instructor_id, new.equipment, new.content_origin, new.blocks, new.safety)
         is distinct from (old.title, old.style, old.level, old.intensity, old.impact, old.minutes, old.summary, old.instructor_id, old.equipment, old.content_origin, old.blocks, old.safety)
         and not app.has_permission('content.edit') then
        raise exception 'edit_permission_required' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_problem := app.blocks_problems(new.blocks);
    if v_problem is not null then raise exception 'publish_blocked_structure: %', v_problem using errcode = 'check_violation'; end if;
    if jsonb_array_length(new.safety) = 0 then raise exception 'publish_blocked_structure: no safety notes' using errcode = 'check_violation'; end if;
    if not new.is_synthetic then
      select r.outcome, r.reviewer_id into v_latest from public.content_reviews r where r.workout_id = new.id and r.review_type = 'fitness' order by r.seq desc limit 1;
      if v_latest.outcome is distinct from 'approved' or v_latest.reviewer_id is not distinct from new.created_by then
        raise exception 'publish_blocked_review: an approved fitness review by someone other than the author is required' using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.media_assets m where m.workout_id = new.id and not app.licence_valid(m.licence_id)) then
        raise exception 'publish_blocked_licence: every media asset needs a cleared, in-date licence' using errcode = 'check_violation';
      end if;
    end if;
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger workouts_guard before insert or update on public.workouts for each row execute function app.workout_guard();
create trigger workouts_audit after update of status on public.workouts for each row execute function app.audit_row();

create or replace function app.review_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.workouts w where w.id = new.workout_id and w.created_by is not distinct from new.reviewer_id) then
    raise exception 'self_review_not_allowed: reviewers cannot review their own work' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger content_reviews_guard before insert on public.content_reviews for each row execute function app.review_guard();
create trigger content_reviews_audit after insert on public.content_reviews for each row execute function app.audit_row();

create trigger staff_roles_audit after insert or update or delete on public.staff_roles for each row execute function app.audit_row();

alter table public.workouts enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_reviews enable row level security;
revoke all on public.workouts, public.media_assets, public.content_reviews from anon, authenticated;
grant select on public.workouts, public.media_assets, public.content_reviews to authenticated;
grant insert (id, title, style, level, intensity, impact, minutes, summary, instructor_id, equipment, content_origin, blocks, safety) on public.workouts to authenticated;
grant update (title, style, level, intensity, impact, minutes, summary, instructor_id, equipment, content_origin, blocks, safety, status) on public.workouts to authenticated;
grant insert (workout_id, kind, storage_path, duration_s, licence_id) on public.media_assets to authenticated;
grant update (kind, storage_path, duration_s, licence_id) on public.media_assets to authenticated;
grant delete on public.media_assets to authenticated;
grant insert (workout_id, review_type, outcome, notes) on public.content_reviews to authenticated;

create policy workouts_select on public.workouts for select to authenticated
  using (status = 'published' or app.has_permission('content.edit') or app.has_permission('content.publish'));
create policy workouts_insert on public.workouts for insert to authenticated with check (app.has_permission('content.edit'));
create policy workouts_update on public.workouts for update to authenticated
  using (app.has_permission('content.edit') or app.has_permission('content.publish'))
  with check (app.has_permission('content.edit') or app.has_permission('content.publish'));

-- Raw media rows are staff-only. People get playable media only through workout_playable_media (all-or-nothing, by country).
create policy media_staff_select on public.media_assets for select to authenticated using (app.has_permission('content.edit') or app.has_permission('licensing.manage'));
create policy media_staff_insert on public.media_assets for insert to authenticated with check (app.has_permission('content.edit'));
create policy media_staff_update on public.media_assets for update to authenticated using (app.has_permission('content.edit')) with check (app.has_permission('content.edit'));
create policy media_staff_delete on public.media_assets for delete to authenticated using (app.has_permission('content.edit'));

create policy reviews_staff_select on public.content_reviews for select to authenticated using (app.has_permission('fitness.review') or app.has_permission('content.publish'));
create policy reviews_staff_insert on public.content_reviews for insert to authenticated
  with check (app.has_permission('fitness.review') and reviewer_id = (select auth.uid()));

-- Media for a published workout, but only if EVERY asset attached to it is cleared for the caller's country (never video without cleared music).
create or replace function public.workout_playable_media(p_workout text)
returns table (id uuid, kind text, storage_path text, duration_s integer) language sql stable security definer set search_path = '' as $$
  select m.id, m.kind, m.storage_path, m.duration_s
    from public.media_assets m
   where m.workout_id = p_workout
     and exists (select 1 from public.workouts w where w.id = p_workout and w.status = 'published')
     and not exists (select 1 from public.media_assets x where x.workout_id = p_workout and not app.licence_allows(x.licence_id, app.user_country()))
$$;
revoke all on function public.workout_playable_media(text) from public, anon;
grant execute on function public.workout_playable_media(text) to authenticated;

-- Server job: pull non-sample workouts whose licences have expired or been revoked out of the catalog.
create or replace function public.workouts_unpublish_expired() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.workouts w set status = 'unpublished'
   where w.status = 'published' and not w.is_synthetic
     and exists (select 1 from public.media_assets m where m.workout_id = w.id and not app.licence_valid(m.licence_id));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.workouts_unpublish_expired() from public, anon, authenticated;
grant execute on function public.workouts_unpublish_expired() to service_role;

-- ========== Programs ==========
create table public.programs (
  id text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 1000),
  weeks smallint not null check (weeks between 1 and 12),
  sessions_per_week smallint not null check (sessions_per_week between 1 and 7),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  instructor_id text references public.instructors (id),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  is_synthetic boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.program_workouts (
  program_id text not null references public.programs (id) on delete cascade,
  week smallint not null check (week between 1 and 12),
  day smallint not null check (day between 1 and 7),
  workout_id text not null references public.workouts (id),
  primary key (program_id, week, day)
);
create or replace function app.program_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.is_synthetic is distinct from old.is_synthetic then raise exception 'is_synthetic_immutable' using errcode = 'check_violation'; end if;
  if (select auth.uid()) is not null and tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'create_as_draft' using errcode = 'check_violation'; end if;
  if (select auth.uid()) is not null and tg_op = 'UPDATE' and new.status is distinct from old.status and not app.has_permission('content.publish') then
    raise exception 'publish_permission_required' using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if exists (select 1 from public.program_workouts pw join public.workouts w on w.id = pw.workout_id where pw.program_id = new.id and w.status <> 'published') then
      raise exception 'publish_blocked_workouts: every workout in the program must be published' using errcode = 'check_violation';
    end if;
    if not new.is_synthetic and new.instructor_id is not null and not exists (select 1 from public.instructors i where i.id = new.instructor_id and i.status = 'published') then
      raise exception 'publish_blocked_instructor: the instructor must be published' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger programs_guard before insert or update on public.programs for each row execute function app.program_guard();
alter table public.programs enable row level security;
alter table public.program_workouts enable row level security;
revoke all on public.programs, public.program_workouts from anon, authenticated;
grant select on public.programs, public.program_workouts to authenticated;
grant insert (id, title, description, weeks, sessions_per_week, level, instructor_id) on public.programs to authenticated;
grant update (title, description, weeks, sessions_per_week, level, instructor_id, status) on public.programs to authenticated;
grant insert (program_id, week, day, workout_id) on public.program_workouts to authenticated;
grant delete on public.program_workouts to authenticated;
create policy programs_select on public.programs for select to authenticated using (status = 'published' or app.has_permission('content.edit') or app.has_permission('content.publish'));
create policy programs_insert on public.programs for insert to authenticated with check (app.has_permission('content.edit'));
create policy programs_update on public.programs for update to authenticated using (app.has_permission('content.edit') or app.has_permission('content.publish'))
  with check (app.has_permission('content.edit') or app.has_permission('content.publish'));
create policy program_workouts_select on public.program_workouts for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and (p.status = 'published' or app.has_permission('content.edit') or app.has_permission('content.publish'))));
create policy program_workouts_insert on public.program_workouts for insert to authenticated with check (app.has_permission('content.edit'));
create policy program_workouts_delete on public.program_workouts for delete to authenticated using (app.has_permission('content.edit'));

-- ========== Workout sessions (private health/activity data) ==========
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  workout_id text references public.workouts (id),
  program_id text references public.programs (id),
  -- Snapshot so history stays readable if the catalog entry later changes or is withdrawn.
  title text not null check (char_length(title) between 1 and 80),
  style text,
  minutes smallint not null check (minutes between 1 and 180),
  planned_for date,
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped')),
  completed_at timestamptz,
  duration_s integer check (duration_s is null or duration_s between 1 and 14400),
  perceived_exertion smallint check (perceived_exertion is null or perceived_exertion between 1 and 10),
  low_impact boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'quick_fit', 'program', 'plan')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_has_time check ((status = 'completed') = (completed_at is not null)),
  constraint planned_has_date check (status <> 'planned' or planned_for is not null),
  constraint completed_not_in_future check (completed_at is null or completed_at <= now() + interval '1 day')
);
create index workout_sessions_user_idx on public.workout_sessions (user_id, planned_for desc);
create index workout_sessions_done_idx on public.workout_sessions (user_id, completed_at desc) where status = 'completed';
create or replace function app.session_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger workout_sessions_guard before insert or update on public.workout_sessions for each row execute function app.session_guard();
alter table public.workout_sessions enable row level security;
revoke all on public.workout_sessions from anon, authenticated;
grant select, delete on public.workout_sessions to authenticated;
grant insert (workout_id, program_id, title, style, minutes, planned_for, status, completed_at, duration_s, perceived_exertion, low_impact, source) on public.workout_sessions to authenticated;
grant update (planned_for, status, completed_at, duration_s, perceived_exertion, low_impact) on public.workout_sessions to authenticated;
create policy sessions_select_own on public.workout_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy sessions_insert_own on public.workout_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and status in ('planned', 'completed') and app.has_consent('health_data_processing'));
create policy sessions_update_own on public.workout_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy sessions_delete_own on public.workout_sessions for delete to authenticated using (user_id = (select auth.uid()));
