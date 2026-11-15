-- Before M3 v2: the database refuses the new styles (so the migration is genuinely needed, and nothing can sneak a new style in early).
do $$
begin
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('m3-pre', 'x', 'dancehall', 'beginner', 'low', 'low', 10, 'x', '[]', '[]')$q$, 'check constraint');
  perform test.throws($q$insert into public.workouts (id, title, style, level, intensity, impact, minutes, summary, blocks, safety) values ('m3-pre', 'x', 'chair_dance', 'beginner', 'low', 'low', 10, 'x', '[]', '[]')$q$, 'check constraint');
  perform test.assert((select count(*) = 14 from public.workouts), 'the 14 sample workouts are seeded');
end $$;
