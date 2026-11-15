-- STEP BEFORE THE M3 v2 ROLLBACK, only needed if new-style workouts were seeded. Run it deliberately, never automatically.
-- A workout cannot be deleted while people's logged sessions or a programme point at it, so this first detaches them: a logged session keeps its title, style label,
-- minutes, exertion and dates (only its link to the catalogue entry is cleared), and programme slots for these workouts are removed. Then the new-style workouts go.
-- Everything is in one transaction: if any statement fails, nothing changes.
begin;
update public.workout_sessions set workout_id = null
 where workout_id in (select id from public.workouts where style in ('dancehall', 'reggae', 'chair_dance'));
delete from public.program_workouts
 where workout_id in (select id from public.workouts where style in ('dancehall', 'reggae', 'chair_dance'));
delete from public.workouts where style in ('dancehall', 'reggae', 'chair_dance');
commit;
