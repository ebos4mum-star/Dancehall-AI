#!/usr/bin/env bash
# Builds a LOCAL scratch database in the same state as the hosted development project before the owner-applied migrations:
# the 8 applied migrations (from supabase/hosted-history.json), habits, the seed, and a stand-in migration-history table holding the hosted rows.
# Used to validate and measure the owner-apply scripts. Touches nothing hosted. Usage: scripts/owner-state.sh <scratch-db-name>
set -euo pipefail
cd "$(dirname "$0")/.."
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
DB="${1:?scratch database name}"
q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
q -d "$DB" -f supabase/tests/shim.sql >/dev/null
for f in $(node -e 'for (const a of require("./supabase/hosted-history.json").applied) console.log(a.file)') 20261207000100_habits.sql; do
  q -d "$DB" -f "supabase/migrations/$f" >/dev/null
done
q -d "$DB" -f supabase/seed.sql >/dev/null
q -d "$DB" >/dev/null <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text unique, rollback text[]);
insert into supabase_migrations.schema_migrations (version, name) values
 ('20261114150446','identity_consent'),('20261114150507','weight_goals_readiness'),('20261114150548','food_nutrition'),('20261114150649','dance_catalog'),
 ('20261114150728','coach'),('20261114150747','integration'),('20261114150751','deletion_config'),('20261114150755','fit_challenges'),('20261114221234','habits');
SQL
