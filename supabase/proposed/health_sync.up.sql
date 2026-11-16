-- PROPOSED, NOT APPLIED. Apple Health workout import: lets a workout session record where it came from and remember the source system's id, so the same Apple
-- Health workout can never be imported twice. Stores only what the person already sees on a workout: type (as the title), start, duration. No calories, heart rate,
-- route or any other health sample is imported. Rehearsed by supabase/proposed/gamification-dry-run.sh; never applied to a hosted project without approval.
alter table public.workout_sessions add column external_id text check (external_id is null or char_length(external_id) between 1 and 128);
alter table public.workout_sessions drop constraint workout_sessions_source_check;
alter table public.workout_sessions add constraint workout_sessions_source_check check (source in ('manual', 'quick_fit', 'program', 'plan', 'apple_health'));
-- An imported workout needs its source id, and a source id is unique per person: the database refuses a second copy.
alter table public.workout_sessions add constraint workout_sessions_import_has_id check ((source = 'apple_health') = (external_id is not null));
grant insert (external_id) on public.workout_sessions to authenticated;
create unique index workout_sessions_external_uidx on public.workout_sessions (user_id, external_id) where external_id is not null;
