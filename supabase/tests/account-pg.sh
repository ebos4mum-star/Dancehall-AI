#!/usr/bin/env bash
# Builds a throwaway database (shim + every migration) and runs the account core's shared suite against the real acct_* SQL functions.
# Same PG* environment as run.sh. Touches nothing hosted.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DH_ACCOUNT_DB:-dh_account}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg_isready -q || { echo "No Postgres server reachable (see run.sh)." >&2; exit 2; }
q -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
q -d "$DB" -f supabase/tests/shim.sql >/dev/null
for f in supabase/migrations/*.sql; do q -d "$DB" -f "$f" >/dev/null 2>&1; done
if [ -n "${PGHOST:-}" ]; then url="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-}@${PGHOST}:${PGPORT:-5432}/$DB"
else url="postgresql://$(whoami)@localhost/$DB?host=/var/run/postgresql"; fi
rc=0
DH_ACCOUNT_PG_URL="$url" pnpm --filter @dancehall/shared exec vitest run src/account-pg.test.ts || rc=$?
q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
exit $rc
