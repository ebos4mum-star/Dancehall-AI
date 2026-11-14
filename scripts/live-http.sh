#!/usr/bin/env bash
# Runs the opt-in HTTP live suite (apps/mobile/src/data/live) against the dedicated DanceHall development project.
# Run it from a machine that CAN reach https://<project>.supabase.co (the build sandbox's network policy blocks it).
#
# Credentials come from the environment or from a git-ignored env file (default apps/mobile/.env.live, or LIVE_ENV_FILE). Nothing is echoed.
#   LIVE_SUPABASE_URL, LIVE_SUPABASE_PUBLISHABLE_KEY, LIVE_USER_A_EMAIL/PASSWORD, LIVE_USER_B_EMAIL/PASSWORD
# The suite's own guard refuses any other project, any non-publishable key, and any non-`.test` email.
set -euo pipefail
cd "$(dirname "$0")/.."
ENVFILE="${LIVE_ENV_FILE:-apps/mobile/.env.live}"
if [ -f "$ENVFILE" ]; then set -a; . "$ENVFILE"; set +a; fi
for v in LIVE_SUPABASE_URL LIVE_SUPABASE_PUBLISHABLE_KEY LIVE_USER_A_EMAIL LIVE_USER_A_PASSWORD LIVE_USER_B_EMAIL LIVE_USER_B_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "Missing $v (see docs/LIVE_HTTP_RUNBOOK.md)." >&2; exit 2; }
done
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "${LIVE_SUPABASE_URL%/}/auth/v1/health" || true)
case "$code" in 2*|401|403) ;; *) echo "Cannot reach the project API from this environment (HTTP $code). The suite needs network access to it." >&2; exit 3 ;; esac
export LIVE_SUPABASE=1
exec pnpm --filter @dancehall/mobile exec vitest run src/data/live
