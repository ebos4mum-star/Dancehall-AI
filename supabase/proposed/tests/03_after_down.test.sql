-- After the rollback: the original six styles only, existing history intact.
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = 'public.workouts'::regclass and conname = 'workouts_style_check';
  perform test.assert(def !~ 'dancehall' and def !~ 'reggae' and def !~ 'chair_dance', 'the new styles are no longer allowed');
  perform test.assert(def ~ 'afrobeats' and def ~ 'low_impact', 'the original styles remain');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('m3-after', 'x', 'dancehall', 'beginner', 'low', 'low', 10, 'x', '[]', '[]')$q$, 'check constraint');
  perform test.assert((select count(*) = 14 from public.workouts), 'the 14 sample workouts remain');
  perform test.assert((select count(*) = 2 from public.workout_sessions), 'both logged sessions remain');
  perform test.assert((select count(*) = 1 from public.workout_sessions where style = 'dancehall' and title = 'Dancehall draft' and minutes = 10 and workout_id is null), 'a session that pointed at a removed workout keeps its title, style label and minutes, with only the catalogue link cleared');
  perform test.assert((select count(*) = 1 from public.workout_sessions where style = 'reggae'), 'a session with a new style label is untouched');
end $$;
