#!/usr/bin/env bash
# Validates supabase/live/db_live_suite.sql against a LOCAL replica built from the repository migrations (same schema as the hosted project once its
# migrations are applied). The suite always rolls back and reports its result in the error message: LIVE_SUITE_RESULT {...}.
set -uo pipefail
cd "$(dirname "$0")/../.."
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg_isready -q || { echo "No Postgres server reachable." >&2; exit 2; }
DB=dh_live_local
q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
q -d $DB -f supabase/tests/shim.sql >/dev/null
for f in supabase/migrations/*.sql; do q -d $DB -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }; done
q -d $DB -f supabase/seed.sql >/dev/null
out=$(psql -X -q -d $DB -f supabase/live/db_live_suite.sql 2>&1)
q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
line=$(echo "$out" | grep -o 'LIVE_SUITE_RESULT .*' | head -1)
if [ -z "$line" ]; then echo "$out"; echo "Suite did not complete." >&2; exit 1; fi
echo "$line" | sed 's/^LIVE_SUITE_RESULT //' | python3 -c 'import json,sys; r=json.loads(sys.stdin.read()); print("passed",r["passed"],"failed",r["failed"],"of",r["total"]); print("areas",r["by_area"]); [print("FAIL",f) for f in r["failures"]]; sys.exit(1 if r["failed"] else 0)'
