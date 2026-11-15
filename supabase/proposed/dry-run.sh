#!/usr/bin/env bash
# LOCAL dry run of the first content release's database step, on a throwaway Postgres database. It never touches a hosted project.
#   build the schema from the migrations and the seed -> before checks -> apply M3 v2 -> after checks -> the rollback must refuse while new-style rows exist
#   -> remove them -> rollback -> after-rollback checks -> apply again (the up script must be repeatable).
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DH_DRYRUN_DB:-dh_m3v2}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg_isready -q || { echo "No Postgres server reachable (see docs/DEVELOPMENT.md)." >&2; exit 2; }
q -d postgres -c "drop database if exists $DB" -c "create database $DB"
trap 'q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
q -d "$DB" -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do q -d "$DB" -f "$f"; done
q -d "$DB" -f supabase/seed.sql
q -d "$DB" -f supabase/tests/helpers.sql
ok() { echo "PASS     $1"; }
q -d "$DB" -f supabase/proposed/tests/01_before.test.sql && ok "before: the new styles are refused and the sample catalogue is seeded"
q -d "$DB" -f supabase/proposed/m3v2_workout_styles.up.sql && ok "apply: M3 v2"
q -d "$DB" -f supabase/proposed/tests/02_after_up.test.sql && ok "after: new styles stored as drafts, nothing publishable or visible, logging foreign keys behave"
# The rollback must refuse (and change nothing) while a new-style workout exists.
if q -d "$DB" -f supabase/proposed/m3v2_workout_styles.down.sql 2>/dev/null; then echo "FAIL     the rollback ran while new-style workouts existed" >&2; exit 1; fi
ok "rollback refuses while new-style workouts exist (fail-safe)"
q -d "$DB" -c "select count(*) from pg_constraint where conname = 'workouts_style_check' and pg_get_constraintdef(oid) like '%dancehall%'" -t | grep -q 1 && ok "the failed rollback changed nothing"
# Deleting the rows directly is blocked by the sessions that point at them, so the rollback has a preparation step that keeps people's history.
if q -d "$DB" -c "delete from public.workouts where id like 'm3-%'" 2>/dev/null; then echo "FAIL     a workout was deleted while a logged session referenced it" >&2; exit 1; fi
ok "a workout referenced by a logged session cannot simply be deleted"
q -d "$DB" -f supabase/proposed/m3v2_rollback_prep.sql && ok "rollback preparation: sessions detached (history kept), new-style workouts removed"
q -d "$DB" -f supabase/proposed/m3v2_workout_styles.down.sql && ok "rollback: after removing the new-style rows"
q -d "$DB" -f supabase/proposed/tests/03_after_down.test.sql && ok "after rollback: original styles only, history intact"
q -d "$DB" -f supabase/proposed/m3v2_workout_styles.up.sql && q -d "$DB" -f supabase/proposed/m3v2_workout_styles.up.sql && ok "apply is repeatable"
echo "M3 v2 dry run passed (local throwaway database only)."
