#!/usr/bin/env bash
# Local replica of the dedicated development project's CURRENT state, then the planned incremental apply.
#  1. Build a throwaway database from only the migrations recorded as applied in supabase/hosted-history.json (+ seed).
#  2. Check its catalog fingerprint equals the one read from the hosted project (so the replica is faithful).
#  3. Apply ONLY the pending migrations, in order, as the hosted plan would.
#  4. Check the result's fingerprint equals a database built from every migration at once (the incremental path == the clean path).
#  5. Run every SQL test against the replica after the incremental apply.
# Needs a Postgres server (same as run.sh). Touches nothing hosted.
set -euo pipefail
cd "$(dirname "$0")/../.."
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg_isready -q || { echo "No Postgres server reachable (see run.sh)." >&2; exit 2; }
HIST=supabase/hosted-history.json
R=dh_replica; F=dh_fresh
fp() { psql -X -q -At -F ' ' -d "$1" -f supabase/tests/fingerprint.sql | awk '{print $1, $3}' | sort; }
fresh() { q -d postgres -c "drop database if exists $1" -c "create database $1"; q -d "$1" -f supabase/tests/shim.sql >/dev/null; }

fresh $R
for f in $(node -e 'for (const a of require("./'$HIST'").applied) console.log(a.file)'); do q -d $R -f "supabase/migrations/$f" >/dev/null; done
q -d $R -f supabase/seed.sql >/dev/null
node -e '
const b = require("./'$HIST'").fingerprintAfterApplied;
for (const [k, v] of Object.entries(b)) console.log(k, v);' | sort > /tmp/dh_expected.txt
fp $R | grep -v '^$' > /tmp/dh_actual.txt
diff -u /tmp/dh_expected.txt /tmp/dh_actual.txt && echo "replica matches the hosted fingerprint (8 applied migrations)"

for f in $(node -e 'for (const f of require("./'$HIST'").pending) console.log(f)'); do echo "apply pending $f"; q -d $R -f "supabase/migrations/$f" >/dev/null; done
helpers() { q -d "$1" -f supabase/tests/helpers.sql >/dev/null; }

fresh $F
for f in supabase/migrations/*.sql; do q -d $F -f "$f" >/dev/null; done
q -d $F -f supabase/seed.sql >/dev/null
diff -u <(fp $F) <(fp $R) && echo "incremental apply == clean apply (all catalog fingerprints identical)"

helpers $R
fail=0
for t in supabase/tests/*.test.sql; do
  if out=$(q -d $R -f "$t" 2>&1); then echo "PASS     $t"; else echo "FAIL     $t"; echo "$out" | sed 's/^/         /'; fail=1; fi
done
q -d postgres -c "drop database if exists $R" -c "drop database if exists $F" >/dev/null
[ "$fail" = 0 ] && echo "Replica tests passed." || { echo "Replica tests FAILED." >&2; exit 1; }
