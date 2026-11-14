-- Nutrition: reference foods, food diary, photo analyses with retention, saved meals and budget meal plans.
-- Food records are health data: owner-only, consent-gated. Photo analysis needs a SEPARATE AI consent; manual logging does not.

-- foods: shared reference data. Readable by signed-in users; written only by trusted server code / seeding.
create table public.foods (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  category text not null check (category in ('grain', 'protein', 'legume', 'vegetable', 'fruit', 'dairy', 'fat', 'snack', 'drink', 'mixed_dish')),
  region_tags text[] not null default '{}',
  kcal_100g numeric(6, 1) not null check (kcal_100g between 0 and 950),
  protein_100g numeric(5, 1) not null check (protein_100g between 0 and 100),
  carbs_100g numeric(5, 1) not null check (carbs_100g between 0 and 100),
  fat_100g numeric(5, 1) not null check (fat_100g between 0 and 100),
  fiber_100g numeric(5, 1) not null default 0 check (fiber_100g between 0 and 100),
  serving_g numeric(6, 1) not null check (serving_g > 0),
  serving_label text not null,
  cost_tier smallint not null check (cost_tier between 1 and 3),
  aliases text[] not null default '{}',
  source text not null default 'curated' check (source in ('curated', 'usda_fdc', 'open_food_facts')),
  -- Development data is synthetic and must be replaced with licensed, reviewed data before release.
  is_synthetic boolean not null default true,
  attribution text
);
alter table public.foods enable row level security;
revoke all on public.foods from anon, authenticated;
grant select on public.foods to authenticated;
create policy foods_read on public.foods for select to authenticated using (true);

-- food_photo_analyses: one row per photo sent for analysis. The image itself is temporary.
-- Retention: the stored original is deleted 24 hours after a successful analysis unless the user saves it; unsuccessful or abandoned
-- uploads are deleted within 24 hours of upload. Status, result and deadlines are written only by trusted server code.
create table public.food_photo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'succeeded', 'failed', 'deleted')),
  provider text not null default 'mock' check (provider in ('mock', 'live')),
  requested_at timestamptz not null default now(),
  analyzed_at timestamptz,
  delete_after timestamptz default (now() + interval '24 hours'),
  saved boolean not null default false,
  deleted_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  constraint photo_path_in_own_folder check (storage_path is null or storage_path like user_id::text || '/%')
);
create index food_photo_expiry_idx on public.food_photo_analyses (delete_after) where deleted_at is null;
create index food_photo_user_idx on public.food_photo_analyses (user_id, requested_at desc);
alter table public.food_photo_analyses enable row level security;
revoke all on public.food_photo_analyses from anon, authenticated;
grant select, delete on public.food_photo_analyses to authenticated;
grant insert (storage_path, provider) on public.food_photo_analyses to authenticated;
grant update (saved) on public.food_photo_analyses to authenticated;
create policy photo_select_own on public.food_photo_analyses for select to authenticated using (user_id = (select auth.uid()));
create policy photo_insert_own on public.food_photo_analyses for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing') and app.has_consent('ai_processing_of_food_photos'));
create policy photo_update_own on public.food_photo_analyses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy photo_delete_own on public.food_photo_analyses for delete to authenticated using (user_id = (select auth.uid()));

-- Saving a photo keeps it; un-saving restarts the 24-hour clock. A photo that is already deleted cannot be "saved".
create or replace function app.photo_saved_changed() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.saved is distinct from old.saved then
    if new.saved and (old.deleted_at is not null or old.storage_path is null) then
      raise exception 'photo_already_deleted: the photo is no longer stored' using errcode = 'check_violation';
    end if;
    new.delete_after := case when new.saved then null else now() + interval '24 hours' end;
  end if;
  return new;
end $$;
create trigger photo_saved_changed before update on public.food_photo_analyses for each row execute function app.photo_saved_changed();

-- Trusted server functions (service role only): finish or fail an analysis, list expired photos, record deletion.
create or replace function public.food_photo_complete(p_id uuid, p_result jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.food_photo_analyses
     set status = 'succeeded', analyzed_at = now(), result = p_result,
         delete_after = case when saved then null else now() + interval '24 hours' end
   where id = p_id and status = 'uploaded' and deleted_at is null;
end $$;
create or replace function public.food_photo_fail(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.food_photo_analyses
     set status = 'failed', delete_after = least(coalesce(delete_after, now() + interval '24 hours'), now() + interval '24 hours')
   where id = p_id and status = 'uploaded' and deleted_at is null;
end $$;
create or replace function public.food_photo_expired(p_now timestamptz default now())
returns table (id uuid, user_id uuid, storage_path text) language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, a.storage_path from public.food_photo_analyses a
   where a.deleted_at is null and a.storage_path is not null and a.saved = false and a.delete_after is not null and a.delete_after <= p_now
$$;
-- Call only after the stored object has been removed through the Storage API.
create or replace function public.food_photo_mark_deleted(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.food_photo_analyses set status = 'deleted', storage_path = null, deleted_at = now(), delete_after = null where id = p_id;
end $$;
revoke all on function public.food_photo_complete(uuid, jsonb), public.food_photo_fail(uuid), public.food_photo_expired(timestamptz), public.food_photo_mark_deleted(uuid) from public, anon, authenticated;
grant execute on function public.food_photo_complete(uuid, jsonb), public.food_photo_fail(uuid), public.food_photo_expired(timestamptz), public.food_photo_mark_deleted(uuid) to service_role;

-- Private storage bucket for temporary food photos: JPEG only, 5 MB, each person confined to their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
create policy food_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy food_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy food_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- food_logs: a meal eaten at a time. Manual logging needs only health-data consent; a photo-sourced log also needs the AI-photo consent.
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  source text not null default 'manual' check (source in ('manual', 'photo', 'saved_meal', 'plan')),
  photo_analysis_id uuid references public.food_photo_analyses (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint food_log_not_in_future check (logged_at <= now() + interval '1 day')
);
create index food_logs_user_time_idx on public.food_logs (user_id, logged_at desc);
alter table public.food_logs enable row level security;
revoke all on public.food_logs from anon, authenticated;
grant select, delete on public.food_logs to authenticated;
grant insert (logged_at, meal_type, source, photo_analysis_id) on public.food_logs to authenticated;
grant update (logged_at, meal_type) on public.food_logs to authenticated;
create policy food_logs_select_own on public.food_logs for select to authenticated using (user_id = (select auth.uid()));
create policy food_logs_insert_own on public.food_logs for insert to authenticated
  with check (
    user_id = (select auth.uid()) and app.has_consent('health_data_processing')
    and (source <> 'photo' or app.has_consent('ai_processing_of_food_photos'))
    and (photo_analysis_id is null or exists (select 1 from public.food_photo_analyses a where a.id = photo_analysis_id and a.user_id = (select auth.uid())))
  );
create policy food_logs_update_own on public.food_logs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy food_logs_delete_own on public.food_logs for delete to authenticated using (user_id = (select auth.uid()));

-- food_log_items: what was eaten. Values are estimates with a calorie range; source/confidence/user_edited say how far to trust them.
create table public.food_log_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.food_logs (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  food_id text references public.foods (id),
  name text not null check (char_length(name) between 1 and 80),
  grams numeric(7, 1) not null check (grams > 0 and grams <= 5000),
  kcal numeric(7, 1) not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g numeric(6, 1) not null default 0 check (fat_g between 0 and 2000),
  kcal_low numeric(7, 1) not null check (kcal_low >= 0),
  kcal_high numeric(7, 1) not null check (kcal_high >= 0),
  source text not null check (source in ('curated', 'usda_fdc', 'open_food_facts', 'user_manual', 'ai_estimate')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  user_edited boolean not null default false,
  created_at timestamptz not null default now(),
  constraint kcal_within_range check (kcal_low <= kcal and kcal <= kcal_high)
);
create index food_log_items_log_idx on public.food_log_items (log_id);
create index food_log_items_user_idx on public.food_log_items (user_id, created_at desc);

-- Any change to an item's values counts as the person editing it, so an unreviewed estimate can never be silently changed.
create or replace function app.food_item_edited() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.name, new.grams, new.kcal, new.protein_g, new.carbs_g, new.fat_g, new.kcal_low, new.kcal_high, new.food_id)
     is distinct from (old.name, old.grams, old.kcal, old.protein_g, old.carbs_g, old.fat_g, old.kcal_low, old.kcal_high, old.food_id) then
    new.user_edited := true;
  end if;
  return new;
end $$;
create trigger food_item_edited before update on public.food_log_items for each row execute function app.food_item_edited();

alter table public.food_log_items enable row level security;
revoke all on public.food_log_items from anon, authenticated;
grant select, delete on public.food_log_items to authenticated;
grant insert (log_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high, source, confidence, user_edited) on public.food_log_items to authenticated;
grant update (food_id, name, grams, kcal, protein_g, carbs_g, fat_g, kcal_low, kcal_high) on public.food_log_items to authenticated;
create policy food_items_select_own on public.food_log_items for select to authenticated using (user_id = (select auth.uid()));
create policy food_items_insert_own on public.food_log_items for insert to authenticated
  with check (
    user_id = (select auth.uid()) and app.has_consent('health_data_processing')
    and exists (select 1 from public.food_logs l where l.id = log_id and l.user_id = (select auth.uid()))
  );
create policy food_items_update_own on public.food_log_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy food_items_delete_own on public.food_log_items for delete to authenticated using (user_id = (select auth.uid()));

-- saved_meals: reusable meals (a snapshot of items).
create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_at timestamptz not null default now()
);
create index saved_meals_user_idx on public.saved_meals (user_id, created_at desc);
alter table public.saved_meals enable row level security;
revoke all on public.saved_meals from anon, authenticated;
grant select, delete on public.saved_meals to authenticated;
grant insert (name, meal_type, items) on public.saved_meals to authenticated;
grant update (name) on public.saved_meals to authenticated;
create policy saved_meals_select_own on public.saved_meals for select to authenticated using (user_id = (select auth.uid()));
create policy saved_meals_insert_own on public.saved_meals for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy saved_meals_update_own on public.saved_meals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_meals_delete_own on public.saved_meals for delete to authenticated using (user_id = (select auth.uid()));

-- meal_plans: rule-based plans within a relative budget level. A plan is a starting point to edit, not a prescription.
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  start_date date not null,
  days smallint not null check (days between 1 and 14),
  budget_level text not null check (budget_level in ('low', 'medium', 'flexible')),
  budget_cents integer check (budget_cents is null or budget_cents between 0 and 10000000),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  target_kcal integer not null check (target_kcal between 800 and 6000),
  created_at timestamptz not null default now(),
  constraint budget_with_currency check ((budget_cents is null) = (currency is null))
);
create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 13),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id text references public.foods (id),
  name text not null check (char_length(name) between 1 and 80),
  grams numeric(7, 1) not null check (grams > 0 and grams <= 5000),
  kcal numeric(7, 1) not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,
  cost_tier smallint check (cost_tier between 1 and 3)
);
create index meal_plans_user_idx on public.meal_plans (user_id, created_at desc);
create index meal_plan_items_plan_idx on public.meal_plan_items (plan_id, day_index);
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
revoke all on public.meal_plans, public.meal_plan_items from anon, authenticated;
grant select, delete on public.meal_plans, public.meal_plan_items to authenticated;
grant insert (name, start_date, days, budget_level, budget_cents, currency, target_kcal) on public.meal_plans to authenticated;
grant insert (plan_id, day_index, meal_type, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, cost_tier) on public.meal_plan_items to authenticated;
create policy plans_select_own on public.meal_plans for select to authenticated using (user_id = (select auth.uid()));
create policy plans_insert_own on public.meal_plans for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy plans_delete_own on public.meal_plans for delete to authenticated using (user_id = (select auth.uid()));
create policy plan_items_select_own on public.meal_plan_items for select to authenticated using (user_id = (select auth.uid()));
create policy plan_items_insert_own on public.meal_plan_items for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing')
              and exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy plan_items_delete_own on public.meal_plan_items for delete to authenticated using (user_id = (select auth.uid()));
