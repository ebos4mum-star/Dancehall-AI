-- Rollback of health_sync.up.sql. Imported rows are removed first, because the old constraint cannot hold them.
delete from public.workout_sessions where source = 'apple_health';
drop index if exists public.workout_sessions_external_uidx;
alter table public.workout_sessions drop constraint if exists workout_sessions_import_has_id;
alter table public.workout_sessions drop constraint workout_sessions_source_check;
alter table public.workout_sessions add constraint workout_sessions_source_check check (source in ('manual', 'quick_fit', 'program', 'plan'));
alter table public.workout_sessions drop column external_id;
