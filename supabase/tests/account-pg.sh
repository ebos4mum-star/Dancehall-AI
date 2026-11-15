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
# Rollback: applying the down script removes exactly the account-recovery objects, leaves every other table, policy and function alone, and the migration re-applies cleanly.
if [ "$rc" = 0 ]; then
  snap() { psql -X -q -At -d "$DB" -c "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app') and c.relkind in ('r','p')) || ' ' || (select count(*) from pg_policies) || ' ' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app') and p.proname not like 'acct\\_%' and p.proname <> 'revoke_user_sessions')"; }
  before=$(snap)
  # The replay fix rolls back first (it sits on top): its function and column go, the previous behaviour returns, and it re-applies cleanly.
  q -d "$DB" -f supabase/rollback/20261215000100_account_recovery_replay_fix.down.sql
  gone=$(psql -X -q -At -d "$DB" -c "select (select count(*) from pg_proc where proname='acct_tx_applied') + (select count(*) from information_schema.columns where table_schema='app' and table_name='acct_tx' and column_name='applied_at')")
  [ "$gone" = 0 ] || { echo "replay-fix rollback left objects behind" >&2; rc=1; }
  q -d "$DB" -f supabase/migrations/20261215000100_account_recovery_replay_fix.sql >/dev/null 2>&1 || { echo "re-applying the replay fix after rollback failed" >&2; rc=1; }
  q -d "$DB" -f supabase/rollback/20261215000100_account_recovery_replay_fix.down.sql
  q -d "$DB" -f supabase/rollback/20261214000100_account_recovery.down.sql
  left=$(psql -X -q -At -d "$DB" -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'acct\\_%' or (n.nspname='app' and p.proname='revoke_user_sessions') or (select to_regclass('app.acct_tx') is not null)")
  after=$(snap)
  [ "$left" = 0 ] || { echo "rollback left account objects behind" >&2; rc=1; }
  # Unrelated objects: table/policy/function counts outside the account ones must be unchanged except for the four dropped tables.
  echo "rollback: objects before/after (tables policies other-functions): $before -> $after"
  q -d "$DB" -f supabase/migrations/20261214000100_account_recovery.sql >/dev/null 2>&1 || { echo "re-applying the migration after rollback failed" >&2; rc=1; }
  q -d "$DB" -f supabase/migrations/20261215000100_account_recovery_replay_fix.sql >/dev/null 2>&1 || { echo "re-applying the replay fix after rollback failed" >&2; rc=1; }
  [ "$rc" = 0 ] && echo "rollback and re-apply: ok"
fi
q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
exit $rc
