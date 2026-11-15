# SQL proposals (NOT APPLIED, NOT MIGRATIONS)

**Status: proposal for review.** None of this SQL is in `supabase/migrations/`, none has been applied to the hosted project `vvwjhbsyxetnktimgaxg`, and no migration file exists for it. Each proposal needs its own explicit approval before it becomes a migration.

## How this was checked (locally only)

Each block was applied to a throwaway local Postgres database on top of all 13 existing migrations plus seed, and the proposed tests were run there. The **entire** existing SQL suite (15 files, including the RLS-coverage, definer-allowlist and owner-isolation sweeps) was then re-run with the three proposals and the new test file present: **17 of 17 files passed**. This was local Postgres 16, not the hosted project, and not Supabase's Postgres 17 in CI. Nothing hosted was touched.

## Ordering, independence and what V1 needs

| Proposal                      | Needed for V1?                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Notes                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **M1** `pathway_preferences`  | **No, probably not.** The existing `wellness_prefs` cap is 2,048 bytes. Measured with `pg_column_size`: today's worst-case preferences document is 596 bytes, and the worst-case set of V1 additions (all nine pathways, six styles, six cuisines, budget, three mobility flags, experience, schedule, sleep window) is 546 bytes, about 1,140 bytes together. V1 therefore fits **without a migration** if answers stay compact. Revisit only if the assessment grows. | Keep the proposal ready.                                                                          |
| **M2** `fasting_plans`        | No. Fasting is not enabled in V1. Needed only at the V1.5 fasting gate.                                                                                                                                                                                                                                                                                                                                                                                                 | Also creates the `fasting.enabled` flag row **off**, and one helper function in the `app` schema. |
| **M3** widen `workouts.style` | Only when real Dancehall or reggae content exists (see the content plan).                                                                                                                                                                                                                                                                                                                                                                                               | Replaces one check constraint on an existing hosted table, so it has the most care.               |

The three are independent: each can be approved, applied or declined alone.

---

## M1: `pathway_preferences`

Purpose: richer "My approach" answers (pathways, styles, cuisines, budget, mobility, schedule). One row per person. Same security shape as `wellness_prefs`: own row only, consent-gated writes, no anonymous access, cascade delete.

```sql
-- PROPOSAL M1: pathway_preferences. Additive. One row per person; holds the optional "My approach" answers.
create table public.pathway_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8192),
  updated_at timestamptz not null default now()
);
alter table public.pathway_preferences enable row level security;
revoke all on public.pathway_preferences from anon, authenticated;
grant select, delete on public.pathway_preferences to authenticated;
grant insert (schema_version, data) on public.pathway_preferences to authenticated;
grant update (schema_version, data, updated_at) on public.pathway_preferences to authenticated;
create policy pathway_prefs_select_own on public.pathway_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy pathway_prefs_insert_own on public.pathway_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy pathway_prefs_update_own on public.pathway_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing'));
create policy pathway_prefs_delete_own on public.pathway_preferences for delete to authenticated using (user_id = (select auth.uid()));
create trigger pathway_preferences_updated_at before update on public.pathway_preferences for each row execute function app.set_updated_at();
```

Differences from `wellness_prefs` (deliberate): a larger cap (8 KB), a `schema_version`, and the update policy also requires consent (so withdrawing health-data consent stops edits). `user_id` is not an insertable column, so nobody can write a row for someone else.
Privacy: covered by the account export (needs a code change in the export builder) and removed by cascade on deletion.

## M2: `fasting_plans`

Purpose: the person's chosen schedule and the **outcome** of their eligibility screening, and nothing else. There are no screening answers, no fast start or stop times, no durations and no counters, so there is nothing to rank, badge or leaderboard.

```sql
-- PROPOSAL M2: fasting_plans. Additive. Stores the chosen schedule and eligibility OUTCOME only: no screening answers, no fast times, no durations.
-- Server-side kill switch: writes are impossible unless the feature flag 'fasting.enabled' is on (it is created OFF).
insert into public.feature_flags (key, enabled, note) values
  ('fasting.enabled', false, 'Optional 12:12 / 14:10 / 16:8 schedules. Off until policy, screening and clinical content are approved')
on conflict (key) do nothing;

create or replace function app.flag_on(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = p_key), false)
$$;
revoke all on function app.flag_on(text) from public, anon;
grant execute on function app.flag_on(text) to authenticated, service_role;

create table public.fasting_plans (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  schedule text not null check (schedule in ('12:12', '14:10', '16:8')),
  window_start time not null,                     -- local time the eating window opens; the window length follows from the schedule
  reminders boolean not null default false,
  status text not null default 'paused' check (status in ('active', 'paused', 'stopped')),
  paused_until date,
  screening_outcome text not null default 'not_cleared' check (screening_outcome in ('cleared', 'not_cleared')),
  screening_version smallint not null check (screening_version >= 1),
  screened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fasting_active_needs_clearance check (status <> 'active' or screening_outcome = 'cleared'),
  constraint fasting_pause_date_only_when_paused check (paused_until is null or status = 'paused')
);

-- A shared eating-concern or pregnancy/postpartum flag always blocks an active plan, whatever the client says.
create or replace function app.fasting_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if new.status = 'active' then
    select data into v from public.wellness_prefs where user_id = new.user_id;
    if coalesce((v ->> 'eatingConcern')::boolean, false) or coalesce((v ->> 'pregnantOrPostpartum')::boolean, false) then
      raise exception 'fasting_not_available: a shared safety flag blocks fasting' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function app.fasting_guard() from public, anon, authenticated;
create trigger fasting_plans_guard before insert or update on public.fasting_plans for each row execute function app.fasting_guard();
create trigger fasting_plans_updated_at before update on public.fasting_plans for each row execute function app.set_updated_at();

alter table public.fasting_plans enable row level security;
revoke all on public.fasting_plans from anon, authenticated;
grant select, delete on public.fasting_plans to authenticated;      -- stopping and deleting is always allowed, flag or not
grant insert (schedule, window_start, reminders, status, paused_until, screening_outcome, screening_version) on public.fasting_plans to authenticated;
grant update (schedule, window_start, reminders, status, paused_until, screening_outcome, screening_version, screened_at, updated_at) on public.fasting_plans to authenticated;
create policy fasting_select_own on public.fasting_plans for select to authenticated using (user_id = (select auth.uid()));
create policy fasting_insert_own on public.fasting_plans for insert to authenticated
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing') and app.flag_on('fasting.enabled'));
create policy fasting_update_own on public.fasting_plans for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and app.has_consent('health_data_processing') and (status = 'stopped' or app.flag_on('fasting.enabled')));
create policy fasting_delete_own on public.fasting_plans for delete to authenticated using (user_id = (select auth.uid()));
```

What this enforces in the database:

- Only `12:12`, `14:10` and `16:8` are storable.
- `status = 'active'` is impossible unless `screening_outcome = 'cleared'`.
- A shared eating-concern or pregnancy/postpartum flag (read from the person's own `wellness_prefs`) blocks any active plan, even if the app sends `cleared`.
- **Server-side kill switch:** with `fasting.enabled` off (the created default) no one can insert a plan or restart one; a person can **always** stop a plan or delete it.
- `app.flag_on` is `SECURITY DEFINER` with an empty `search_path`, lives in the unexposed `app` schema (not `public`, so it is not part of the reviewed user-callable allowlist), and has no anonymous execute. The guard trigger function has no execute grant for signed-in users, the same hardening applied to `household_after_member_delete`.

**Honest limitation:** the database cannot verify that a person's screening answers were genuinely "cleared", because it deliberately does not store the answers. `screening_outcome` is computed by shared rules on the device and is therefore self-attested. The database enforces everything that can be enforced without the answers (schedule set, shared safety flags, flag on, own row). The clinical protection comes from the reviewed screening rules, the education content and the flag staying off until review.

Inserting the `fasting.enabled` row is a **hosted data change** (and is why this belongs in the migration only after approval).

## M3: widen `workouts.style`

Purpose: allow `dancehall` and `reggae` (plus `soca` and `chair_dance`, which the plan also needs) as workout styles.

```sql
-- PROPOSAL M3: widen workouts.style. Replaces ONE check constraint on a hosted table; it only ADDS values, so every existing row stays valid.
-- Ship only together with real, reviewed, rights-cleared content and the matching client enum change.
alter table public.workouts drop constraint workouts_style_check;
alter table public.workouts add constraint workouts_style_check
  check (style in ('afrobeats', 'amapiano', 'hip_hop', 'latin', 'bollywood', 'low_impact', 'dancehall', 'reggae', 'soca', 'chair_dance'));
```

Properties: it only **adds** values, so every existing row stays valid (the constraint is re-validated against all rows when added). It touches an existing hosted table, so it needs separate approval. `workout_sessions.style` is unconstrained text, so history logging needs no change.

Changes that must ship in the **same** pull request, or tests fail:

1. `DANCE_STYLES` in `packages/shared/src/workouts.ts`.
2. `packages/shared/src/sql-parity.test.ts`: it currently reads the style list from the **original** `create table public.workouts` text, so it must be changed to read the latest constraint definition.
3. English style labels in `apps/mobile/src/i18n/en.ts`; seed data and the seed generator check.
4. Any style filter chips in the Dance tab.
5. Do **not** insert Dancehall or reggae workouts until the content plan's gates (rights, qualified review) are met. The constraint alone adds no content.

## Proposed tests (to become `supabase/tests/16_pathways.test.sql` if approved)

These pass locally together with the proposals.

```sql
-- PROPOSED tests for M1, M2, M3 (to live in supabase/tests/16_pathways.test.sql if approved).
do $$
declare a uuid; b uuid; n int;
begin
  a := test.make_user('path-a@example.test'); b := test.make_user('path-b@example.test');

  -- ===== M1 pathway_preferences =====
  perform test.as_user(a);
  perform test.throws($q$insert into public.pathway_preferences (data) values ('{"pathways":["dance"]}')$q$, 'row-level security');  -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.pathway_preferences (data) values ('{"pathways":["dance","mindful"],"budget":"low"}');
  perform test.throws($q$insert into public.pathway_preferences (data) values ('[]')$q$, 'check constraint');
  perform test.throws(format($q$update public.pathway_preferences set data = jsonb_build_object('x', repeat('y', 9000))$q$), 'check constraint');   -- 8 KB cap
  perform test.throws($q$insert into public.pathway_preferences (user_id, data) values (gen_random_uuid(), '{}')$q$, 'permission denied');   -- user_id is not insertable, so nobody can write for someone else
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.pathway_preferences), 'another person sees no preferences');
  update public.pathway_preferences set data = '{"hijack":true}';
  perform test.as_user(a);
  perform test.assert((select not (data ? 'hijack') from public.pathway_preferences), 'another person cannot change them');
  perform test.as_anon();
  perform test.throws($q$select * from public.pathway_preferences$q$, 'permission denied');

  -- ===== M2 fasting_plans =====
  perform test.as_user(a);
  -- Flag is OFF by default: nothing can be written.
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('12:12', '08:00', 'active', 'cleared', 1)$q$, 'row-level security');
  perform test.as_admin();
  update public.feature_flags set enabled = true where key = 'fasting.enabled';
  perform test.as_user(a);
  -- Only the three schedules.
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('18:6', '08:00', 'paused', 'cleared', 1)$q$, 'check constraint');
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('20:4', '08:00', 'paused', 'cleared', 1)$q$, 'check constraint');
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('23:1', '08:00', 'paused', 'cleared', 1)$q$, 'check constraint');
  -- Activation needs a cleared screening outcome.
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('12:12', '08:00', 'active', 'not_cleared', 1)$q$, 'fasting_active_needs_clearance');
  -- A shared eating-concern flag blocks activation even with a cleared outcome.
  insert into public.wellness_prefs (data) values ('{"eatingConcern":true}');
  perform test.throws($q$insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('14:10', '08:00', 'active', 'cleared', 1)$q$, 'fasting_not_available');
  update public.wellness_prefs set data = '{"eatingConcern":false}';
  insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('12:12', '08:00', 'active', 'cleared', 1);
  update public.fasting_plans set schedule = '16:8';
  perform test.throws($q$update public.fasting_plans set schedule = '24:0'$q$, 'check constraint');
  perform test.throws($q$update public.fasting_plans set paused_until = current_date + 1$q$, 'fasting_pause_date_only_when_paused');
  update public.fasting_plans set status = 'paused', paused_until = current_date + 2;
  -- The pregnancy / postpartum flag blocks reactivation too.
  update public.wellness_prefs set data = '{"pregnantOrPostpartum":true}';
  perform test.throws($q$update public.fasting_plans set status = 'active', paused_until = null$q$, 'fasting_not_available');
  -- Stopping is always possible, even when the flag is switched off; so is deleting.
  perform test.as_admin();
  update public.feature_flags set enabled = false where key = 'fasting.enabled';
  perform test.as_user(a);
  update public.fasting_plans set status = 'stopped', paused_until = null;
  perform test.assert((select status = 'stopped' from public.fasting_plans), 'a person can always stop');
  perform test.throws($q$update public.fasting_plans set status = 'paused'$q$, 'row-level security');   -- cannot (re)start anything while the flag is off
  perform test.assert(not has_function_privilege('anon', 'app.flag_on(text)', 'execute'), 'anon cannot execute the flag helper');
  perform test.assert(not has_function_privilege('authenticated', 'app.fasting_guard()', 'execute'), 'the guard trigger function is not executable by signed-in users');

  -- Isolation and deletion.
  perform test.as_user(b);
  perform test.assert((select count(*) = 0 from public.fasting_plans), 'another person sees no fasting plan');
  perform test.as_user(a);
  delete from public.fasting_plans;
  perform test.assert((select count(*) = 0 from public.fasting_plans), 'a person can delete their plan (flag off)');
  -- Leave one paused plan behind (flag briefly on) so the owner-isolation sweep in 99_ has a row to protect.
  perform test.as_admin();
  update public.feature_flags set enabled = true where key = 'fasting.enabled';
  perform test.as_user(a);
  update public.wellness_prefs set data = '{}';
  insert into public.fasting_plans (schedule, window_start, status, screening_outcome, screening_version) values ('12:12', '08:00', 'paused', 'cleared', 1);
  perform test.as_admin();
  update public.feature_flags set enabled = false where key = 'fasting.enabled';
  perform test.as_user(a);

  -- ===== M3 workouts.style =====
  perform test.as_admin();
  perform test.assert(pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.workouts'::regclass and conname = 'workouts_style_check')) ~ 'dancehall'
    and pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.workouts'::regclass and conname = 'workouts_style_check')) ~ 'reggae', 'dancehall and reggae are allowed');
  perform test.assert(not pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.workouts'::regclass and conname = 'workouts_style_check')) ~ 'ballet', 'unknown styles are still refused');
  perform test.assert(not exists (select 1 from public.workouts where style not in ('afrobeats','amapiano','hip_hop','latin','bollywood','low_impact','dancehall','reggae','soca','chair_dance')), 'every existing workout style is still valid');
end $$;
```

## Other things these proposals deliberately avoid

- No new consent purpose (a separate purpose for the later medical companion would need to widen `consents.purpose`'s check and is not proposed now).
- No new celebration kind (the `celebrations.achievement_id` check allows only five kinds; a migration would be needed for any new kind, so V1 reuses the existing ones).
- No new wellness log kind (`wellness_entries.kind` is a database check list; a stress or mood log would need a migration, so V1 uses the existing sleep, hunger and recovery logs).
- No change to any grant on an existing table.

## What approving each one would trigger

For each: a migration file with the next free timestamp, the test file, an update to `supabase/hosted-history.json` as **pending**, the replica run (`supabase/tests/replica.sh`), the usual PR and CI, and only then a separate authorisation to apply it to the hosted project and a post-apply fingerprint check.
