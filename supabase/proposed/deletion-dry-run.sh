#!/usr/bin/env bash
# LOCAL dry run of the account-deletion executor on a throwaway Postgres database (never a hosted project): migrations -> apply -> tests -> rollback -> re-apply.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DH_DELETION_DB:-dh_deletion}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg_isready -q || { echo "No Postgres server reachable (see docs/DEVELOPMENT.md)." >&2; exit 2; }
q -d postgres -c "drop database if exists $DB" -c "create database $DB"
trap 'q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true' EXIT
q -d "$DB" -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do q -d "$DB" -f "$f"; done
q -d "$DB" -f supabase/seed.sql
q -d "$DB" -f supabase/tests/helpers.sql
run() { local msg="$1"; shift; if "$@"; then echo "PASS     $msg"; else echo "FAIL     $msg" >&2; exit 1; fi; }
run "apply: account_deletion_purge.up.sql" q -d "$DB" -f supabase/proposed/account_deletion_purge.up.sql
run "deletion tests" q -d "$DB" -f supabase/proposed/tests/account_deletion.test.sql
run "rollback" q -d "$DB" -f supabase/proposed/account_deletion_purge.down.sql
run "apply again after rollback" q -d "$DB" -f supabase/proposed/account_deletion_purge.up.sql
echo "Account-deletion dry run passed (local throwaway database only)."
