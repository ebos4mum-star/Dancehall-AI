#!/usr/bin/env bash
# Proves the AI budget and per-person quota cannot be oversubscribed by concurrent requests (separate database sessions racing).
# Called by run.sh against the throwaway database; uses the standard PG* environment variables.
set -euo pipefail
DB="$1"
q() { psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

USER_ID=$(q -c "insert into auth.users (email) values ('race@example.test') returning id")
WORKERS=10; TRIES=6

# Budget: ceiling 5.00, each request reserves 1.00, 60 racing attempts => exactly 5 may succeed.
tmp=$(mktemp -d)
for w in $(seq 1 $WORKERS); do
  ( for _ in $(seq 1 $TRIES); do q -c "set role service_role; select public.ai_budget_reserve('2099-01', 1.0, 5.0)"; done > "$tmp/b$w" ) &
done
wait
granted=$(cat "$tmp"/b* | grep -c '^t$' || true)
reserved=$(q -c "select reserved_usd from public.ai_budget where month = '2099-01'")
if [ "$granted" != "5" ] || [ "${reserved%.*}" != "5" ]; then echo "BUDGET RACE FAILED: granted=$granted reserved=$reserved (expected 5)" >&2; exit 1; fi

# Quota: limit 3, 60 racing attempts => exactly 3 may succeed.
for w in $(seq 1 $WORKERS); do
  ( for _ in $(seq 1 $TRIES); do q -c "set role service_role; select public.ai_quota_consume('$USER_ID', '2099-01', 'concierge_chat', 3)"; done > "$tmp/q$w" ) &
done
wait
ok=$(cat "$tmp"/q* | grep -c '^t$' || true)
count=$(q -c "select count from public.ai_user_usage where user_id = '$USER_ID' and month = '2099-01'")
if [ "$ok" != "3" ] || [ "$count" != "3" ]; then echo "QUOTA RACE FAILED: granted=$ok count=$count (expected 3)" >&2; exit 1; fi
rm -rf "$tmp"
echo "concurrency: 60 racing budget requests granted exactly 5; 60 racing quota requests granted exactly 3"
