-- PROPOSAL M3 v2: widen workouts.style so Dancehall, reggae and chair-dance workouts can be stored.
-- NOT a migration and NOT applied: this file lives outside supabase/migrations on purpose. It is validated locally by supabase/proposed/dry-run.sh.
-- It replaces ONE check constraint on a hosted table and only ADDS values, so every existing row stays valid (the constraint is re-checked against all rows).
-- It adds no content. Ship it only with the matching client change (already in the code: LIVE_STYLES includes the new styles only when this has been applied) and approved content.
begin;
alter table public.workouts drop constraint if exists workouts_style_check;
alter table public.workouts add constraint workouts_style_check
  check (style in ('afrobeats', 'amapiano', 'hip_hop', 'latin', 'bollywood', 'low_impact', 'dancehall', 'reggae', 'chair_dance'));
commit;
