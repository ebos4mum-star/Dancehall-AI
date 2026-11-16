#!/usr/bin/env bash
# Applies the test shim, every migration in order, and every *.test.sql file to a throwaway database on plain Postgres.
# Connection uses the standard PG* environment variables (CI sets them for a Postgres service container).
# Locally, if no server answers, this tries to start the Ubuntu-packaged cluster (see docs/DEVELOPMENT.md).
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${DH_TEST_DB:-dh_test}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

if ! pg_isready -q 2>/dev/null; then
  if command -v pg_lsclusters >/dev/null && pg_lsclusters -h | grep -q down; then
    ver=$(pg_lsclusters -h | awk 'NR==1{print $1}'); name=$(pg_lsclusters -h | awk 'NR==1{print $2}')
    echo "Starting local Postgres cluster $ver/$name"
    pg_ctlcluster "$ver" "$name" start; for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q && break; sleep 1; done
  fi
fi
pg_isready -q || { echo "No Postgres server reachable. Set PGHOST/PGUSER/PGPASSWORD or see docs/DEVELOPMENT.md." >&2; exit 2; }

q -d postgres -c "drop database if exists $DB" -c "create database $DB"
q -d "$DB" -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do echo "migrate  $f"; q -d "$DB" -f "$f"; done
[ -f supabase/seed.sql ] && { echo "seed     supabase/seed.sql"; q -d "$DB" -f supabase/seed.sql; }
q -d "$DB" -f supabase/tests/helpers.sql
fail=0
for f in supabase/tests/*.test.sql; do
  if out=$(q -d "$DB" -f "$f" 2>&1); then echo "PASS     $f"; else echo "FAIL     $f"; echo "$out" | sed 's/^/         /'; fail=1; fi
done
if bash supabase/tests/concurrency.sh "$DB"; then :; else fail=1; fi
q -d postgres -c "drop database if exists $DB" >/dev/null
# The M3 v2 release step, rehearsed on its own throwaway database (never a hosted project).
if bash supabase/proposed/dry-run.sh; then :; else fail=1; fi
# The proposed Community schema, rehearsed the same way (also never a hosted project).
if bash supabase/proposed/community-dry-run.sh; then :; else fail=1; fi
# The proposed social schema (friends, sharing, group goals), rehearsed the same way.
if bash supabase/proposed/social-dry-run.sh; then :; else fail=1; fi
# The proposed Apple Health columns and gamification ledger/league, rehearsed the same way.
if bash supabase/proposed/gamification-dry-run.sh; then :; else fail=1; fi
# The proposed account-deletion executor (App Review 5.1.1(v)), rehearsed the same way.
if bash supabase/proposed/deletion-dry-run.sh; then :; else fail=1; fi
[ "$fail" = 0 ] && echo "Database tests passed." || { echo "Database tests FAILED." >&2; exit 1; }
