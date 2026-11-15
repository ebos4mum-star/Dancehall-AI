-- ROLLBACK for M3 v2: restores the original six styles.
-- It FAILS (and changes nothing) while any workout still uses a new style, which is the safe behaviour: remove or reassign those rows first (see docs/RELEASE_SEQUENCE.md).
-- workout_sessions.style is unconstrained text, so history logged with a new style is unaffected by the rollback.
begin;
alter table public.workouts drop constraint if exists workouts_style_check;
alter table public.workouts add constraint workouts_style_check
  check (style in ('afrobeats', 'amapiano', 'hip_hop', 'latin', 'bollywood', 'low_impact'));
commit;
