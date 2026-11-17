#!/usr/bin/env bash
# LOCAL rehearsal of the staging upgrade, on throwaway Postgres databases only. It never touches a hosted project.
# It rebuilds what staging (bxhnrjulksganzydgrgm) holds TODAY from the pinned commits recorded in docs/STAGING_STATUS.md and docs/CLAUDE_HANDOFF.md (hash-checked), then applies ONLY the
# remaining increments in the order of docs/STAGING_DEPLOYMENT_CHECKLIST.md:
#     community.patch3_safety_phrases -> social.patch2_eligible_workouts -> health_sync.up -> gamification.up
# and proves: (1) the result is catalog-identical to a fresh build of the current files, (2) the proposed tests pass on it, (3) the rollback files return it to exactly today's staging
# state (and it can be applied again).   GEN_DOWN=1 regenerates supabase/proposed/social.patch2_eligible_workouts.down.sql from the baseline instead of checking it.
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE="${DH_STG_BASE_DB:-dh_stg_base}"; FRESH="${DH_STG_FRESH_DB:-dh_stg_fresh}"
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
if ! pg_isready -q 2>/dev/null && command -v pg_lsclusters >/dev/null && pg_lsclusters -h | grep -q down; then
  ver=$(pg_lsclusters -h | awk 'NR==1{print $1}'); name=$(pg_lsclusters -h | awk 'NR==1{print $2}'); pg_ctlcluster "$ver" "$name" start; for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q && break; sleep 1; done
fi
pg_isready -q || { echo "No Postgres server reachable (see docs/DEVELOPMENT.md)." >&2; exit 2; }
TMP="$(mktemp -d)"
cleanup() { q -d postgres -c "drop database if exists $BASE" -c "drop database if exists $FRESH" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
ok() { echo "PASS     $1"; }
run() { local msg="$1"; shift; if "$@"; then ok "$msg"; else echo "FAIL     $msg" >&2; exit 1; fi; }

# The pinned commits are needed to rebuild staging exactly. A shallow clone may not have them: skip with a clear message, unless STAGING_REHEARSAL_STRICT=1 (use it before any staging change).
for c in ac889a6cfbc30b6fc5d97a2f465a57f5d2529bda 1444af20f4d20e86814d3577c71d2c7d9bcd1a68 84719b41 887b7801ab50d5471dd5f2f15d2b99f81ea76387; do
  if ! git cat-file -e "$c^{commit}" 2>/dev/null; then
    [ "${STAGING_REHEARSAL_STRICT:-0}" = "1" ] && { echo "FAIL     pinned commit ${c:0:8} is not in this clone (git fetch the full history)" >&2; exit 1; }
    echo "SKIP     staging increment rehearsal: pinned commit ${c:0:8} is not in this clone (shallow history). Run it with full history and STAGING_REHEARSAL_STRICT=1 before any staging change."; exit 0
  fi
done
# What staging holds, from the pinned commits. Each file's SHA-256 prefix must equal the one recorded when it was applied.
BOOT=ac889a6cfbc30b6fc5d97a2f465a57f5d2529bda; SOCIAL=1444af20f4d20e86814d3577c71d2c7d9bcd1a68; PATCH1=84719b41; PATCH2=887b7801ab50d5471dd5f2f15d2b99f81ea76387
pin() { local c="$1" f="$2" want="$3" out="$4"; git cat-file -e "$c^{commit}" 2>/dev/null || { echo "FAIL     pinned commit $c is not in this clone (git fetch the branch history)" >&2; exit 1; }
  git show "$c:$f" > "$out"; local got; got=$(sha256sum "$out" | cut -c1-${#want}); [ "$got" = "$want" ] && ok "pinned $(basename "$f") @ ${c:0:8} matches the hash recorded for staging ($want)" || { echo "FAIL     $f @ $c hash $got, expected $want" >&2; exit 1; }; }
pin $BOOT supabase/proposed/community.up.sql 885a602075b4e2d5 "$TMP/community.up.sql"
pin $BOOT supabase/proposed/community.storage.sql 0d49c08cb82ceceb "$TMP/community.storage.sql"
pin $BOOT supabase/proposed/account_deletion_purge.up.sql fdb8348698ac6c83 "$TMP/purge.up.sql"
pin $SOCIAL supabase/proposed/social.up.sql fa16d8b9d6e3207b "$TMP/social.up.sql"
pin $PATCH1 supabase/proposed/social.patch1_view_dedupe.sql 86757a166e111a22 "$TMP/social.patch1.sql"
pin $PATCH2 supabase/proposed/community.patch2_photo_immediate.sql 70fb1a2d6cca5694 "$TMP/community.patch2.sql"
[ "$(sha256sum supabase/proposed/community.patch2_photo_immediate.sql | cut -c1-16)" = "70fb1a2d6cca5694" ] && ok "community.patch2 at HEAD is byte-identical to the one applied to staging (its rollback target)"
[ "$(sha256sum supabase/proposed/social.patch1_view_dedupe.sql | cut -c1-16)" = "86757a166e111a22" ] && ok "social.patch1 at HEAD is byte-identical to the one applied to staging"
git diff --quiet "$BOOT" HEAD -- supabase/migrations && ok "the 16 repository migrations are unchanged since the staging bootstrap commit"

prep() { q -d postgres -c "drop database if exists $1" -c "create database $1"; q -d "$1" -f supabase/tests/shim.sql; for f in supabase/migrations/*.sql; do q -d "$1" -f "$f"; done; q -d "$1" -f supabase/seed.sql; q -d "$1" -f supabase/tests/helpers.sql; }
# One deterministic text description of the catalog (the same read-only file the hosted before/after checks use).
snap() { q -d "$1" -At -f supabase/staging/catalog-snapshot.sql; }

echo "== 1. staging as it is today (pinned files only)"
prep "$BASE"
run "baseline: community.up.sql (earlier version)" q -d "$BASE" -f "$TMP/community.up.sql"
run "baseline: community.storage.sql" q -d "$BASE" -f "$TMP/community.storage.sql"
run "baseline: account_deletion_purge.up.sql" q -d "$BASE" -f "$TMP/purge.up.sql"
run "baseline: social.up.sql (version without patch 2)" q -d "$BASE" -f "$TMP/social.up.sql"
run "baseline: social.patch1_view_dedupe.sql" q -d "$BASE" -f "$TMP/social.patch1.sql"
run "baseline: community.patch2_photo_immediate.sql" q -d "$BASE" -f "$TMP/community.patch2.sql"
snap "$BASE" > "$TMP/before.txt"
q -d "$BASE" -At -c "select pg_get_functiondef('app.social_sync_group(uuid,uuid)'::regprocedure); select pg_get_functiondef('app.social_view_friend(uuid,text)'::regprocedure)" > "$TMP/old_social_defs.sql" 2>/dev/null || true

DOWN=supabase/proposed/social.patch2_eligible_workouts.down.sql
gen_down() { { echo "-- Rollback of social.patch2_eligible_workouts.sql: restores the two functions exactly as they are on staging today (social.up.sql @ ${SOCIAL:0:8} with social.patch1), then drops the function patch 2 added."
  echo "-- Generated by supabase/proposed/staging-increment-dry-run.sh (GEN_DOWN=1) from a rebuild of staging's current state; the same script checks this file has not drifted and rehearses it."
  echo "-- Order: run gamification.down.sql first (app.gm_inputs uses app.eligible_workouts), then this file."
  echo "begin;"
  for fn in 'app.social_sync_group(uuid,uuid)' 'app.social_view_friend(uuid,text)'; do q -d "$BASE" -At -c "select pg_get_functiondef('$fn'::regprocedure)"; echo ";"; done
  echo "drop function if exists app.eligible_workouts(uuid, timestamptz);"
  echo "commit;"; } ; }
if [ "${GEN_DOWN:-0}" = "1" ]; then gen_down > "$DOWN"; echo "Wrote $DOWN"; exit 0; fi
[ "$(gen_down | sha256sum)" = "$(sha256sum < "$DOWN")" ] && ok "social.patch2 rollback file matches staging's current function definitions (no drift)" || { echo "FAIL     $DOWN differs from staging's current definitions; regenerate with GEN_DOWN=1 and review" >&2; exit 1; }

echo "== 2. the four increments, in order"
# After each increment, the snapshot differs from the previous one only by the objects that increment is meant to change. The summary is printed so the hosted run can be compared with it.
PREV="$TMP/before.txt"
step() { local n="$1" f="$2"; run "increment $n: $(basename "$f")" q -d "$BASE" -f "$f"; snap "$BASE" > "$TMP/step$n.txt"
  local added removed; added=$(diff "$PREV" "$TMP/step$n.txt" | grep -c '^>' || true); removed=$(diff "$PREV" "$TMP/step$n.txt" | grep -c '^<' || true)
  echo "         expected catalog change after increment $n: +$added lines, -$removed lines"
  diff "$PREV" "$TMP/step$n.txt" | grep '^[<>] F ' | sed -E 's/^([<>]) F ([^ (]+)\(.*/           \1 function \2/' | sort -u | sed 's/^/        /' || true
  diff "$PREV" "$TMP/step$n.txt" | grep '^> [CKIPT] ' | awk '{print $2" "$3}' | cut -d. -f1-2 | sort -u | head -12 | sed 's/^/           + /' || true
  PREV="$TMP/step$n.txt"; }
step 1 supabase/proposed/community.patch3_safety_phrases.sql
step 2 supabase/proposed/social.patch2_eligible_workouts.sql
step 3 supabase/proposed/health_sync.up.sql
step 4 supabase/proposed/gamification.up.sql
snap "$BASE" > "$TMP/after.txt"
run "every increment is repeatable (applying the two function patches again changes nothing)" bash -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE -f supabase/proposed/community.patch3_safety_phrases.sql && psql -X -q -v ON_ERROR_STOP=1 -d $BASE -f supabase/proposed/social.patch2_eligible_workouts.sql && [ \"\$(psql -X -At -d $BASE -c \"select count(*) from pg_proc where proname='eligible_workouts'\")\" = 1 ]"

echo "== 3. the same database equals a fresh build of the current files"
prep "$FRESH"
for f in community.up.sql community.storage.sql account_deletion_purge.up.sql social.up.sql health_sync.up.sql gamification.up.sql; do q -d "$FRESH" -f supabase/proposed/$f; done
snap "$FRESH" > "$TMP/fresh.txt"
if diff -u "$TMP/fresh.txt" "$TMP/after.txt" > "$TMP/diff.txt"; then ok "incremental result is catalog-identical to a fresh build ($(wc -l < "$TMP/fresh.txt") objects compared: functions with bodies and grants, columns, constraints, indexes, policies, table grants)"; else echo "FAIL     incremental result differs from a fresh build:" >&2; head -40 "$TMP/diff.txt" >&2; exit 1; fi

echo "== 4. the proposed tests on the incremental database"
for t in community social gamification account_deletion community.storage; do run "tests: supabase/proposed/tests/$t.test.sql" q -d "$BASE" -f supabase/proposed/tests/$t.test.sql; done
run "structural RLS guard still holds" q -d "$BASE" -f supabase/tests/01_rls_coverage.test.sql

echo "== 5. rollback in reverse order returns staging's current state exactly"
run "rollback 4: gamification.down.sql" q -d "$BASE" -f supabase/proposed/gamification.down.sql
run "rollback 3: health_sync.down.sql" q -d "$BASE" -f supabase/proposed/health_sync.down.sql
run "rollback 2: social.patch2_eligible_workouts.down.sql" q -d "$BASE" -f "$DOWN"
run "rollback 1: community.patch2_photo_immediate.sql (restores the previous app.community_screen)" q -d "$BASE" -f "$TMP/community.patch2.sql"
snap "$BASE" > "$TMP/rolled.txt"
if diff -u "$TMP/before.txt" "$TMP/rolled.txt" > "$TMP/diff2.txt"; then ok "after rollback the catalog equals staging's state before the increments ($(wc -l < "$TMP/before.txt") objects)"; else echo "FAIL     rollback did not restore the previous state:" >&2; head -40 "$TMP/diff2.txt" >&2; exit 1; fi
echo "== 6. apply again after rollback"
for f in community.patch3_safety_phrases.sql social.patch2_eligible_workouts.sql health_sync.up.sql gamification.up.sql; do q -d "$BASE" -f supabase/proposed/$f; done
snap "$BASE" > "$TMP/again.txt"
diff -q "$TMP/after.txt" "$TMP/again.txt" >/dev/null && ok "applying again after rollback gives the same result" || { echo "FAIL     re-apply differs" >&2; exit 1; }
echo "Staging increment dry run passed (local throwaway databases only; no hosted project was contacted)."
