#!/usr/bin/env bash
# LOCAL dry run of the proposed Apple Health columns and gamification schema on a throwaway Postgres database. It never touches a hosted project.
#   migrations -> community -> social -> health_sync -> gamification -> tests -> structural guards -> rollback -> apply again.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DH_GM_DB:-dh_gm}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
if ! pg_isready -q 2>/dev/null && command -v pg_lsclusters >/dev/null && pg_lsclusters -h | grep -q down; then
  ver=$(pg_lsclusters -h | awk 'NR==1{print $1}'); name=$(pg_lsclusters -h | awk 'NR==1{print $2}'); pg_ctlcluster "$ver" "$name" start; for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q && break; sleep 1; done
fi
pg_isready -q || { echo "No Postgres server reachable (see docs/DEVELOPMENT.md)." >&2; exit 2; }
q -d postgres -c "drop database if exists $DB" -c "create database $DB"
trap 'q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
q -d "$DB" -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do q -d "$DB" -f "$f"; done
q -d "$DB" -f supabase/seed.sql
q -d "$DB" -f supabase/tests/helpers.sql
ok() { echo "PASS     $1"; }
run() { local msg="$1"; shift; if "$@"; then ok "$msg"; else echo "FAIL     $msg" >&2; exit 1; fi; }
run "apply: community.up.sql (prerequisite)" q -d "$DB" -f supabase/proposed/community.up.sql
run "apply: social.up.sql (prerequisite)" q -d "$DB" -f supabase/proposed/social.up.sql
run "apply: health_sync.up.sql" q -d "$DB" -f supabase/proposed/health_sync.up.sql
run "apply: gamification.up.sql" q -d "$DB" -f supabase/proposed/gamification.up.sql
run "gamification tests (privileges, import ids, idempotent ledger, league privacy, deletion)" q -d "$DB" -f supabase/proposed/tests/gamification.test.sql
run "structural RLS guard still holds" q -d "$DB" -f supabase/tests/01_rls_coverage.test.sql
run "rollback: gamification.down.sql" q -d "$DB" -f supabase/proposed/gamification.down.sql
run "rollback: health_sync.down.sql" q -d "$DB" -f supabase/proposed/health_sync.down.sql
q -d "$DB" -tc "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'gm\_%'" | grep -q '^ *0$' && ok "rollback removed every gamification table" || { echo "FAIL     rollback leftovers" >&2; exit 1; }
q -d "$DB" -tc "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname like 'gm\_%'" | grep -q '^ *0$' && ok "rollback removed every gamification function" || { echo "FAIL     rollback leftovers" >&2; exit 1; }
q -d "$DB" -tc "select count(*) from information_schema.columns where table_name = 'workout_sessions' and column_name = 'external_id'" | grep -q '^ *0$' && ok "rollback removed the import column" || { echo "FAIL     rollback leftovers" >&2; exit 1; }
run "apply again after rollback" bash -c "psql -X -q -v ON_ERROR_STOP=1 -d $DB -f supabase/proposed/health_sync.up.sql && psql -X -q -v ON_ERROR_STOP=1 -d $DB -f supabase/proposed/gamification.up.sql"
echo "Gamification dry run passed (local throwaway database only)."
