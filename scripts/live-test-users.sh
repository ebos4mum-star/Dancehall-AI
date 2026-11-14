#!/usr/bin/env bash
# Prepares the git-ignored env file for the live HTTP and Storage suites WITHOUT ever printing a password and WITHOUT any privileged key.
#   1. Generates two strong random passwords and two synthetic `.test` emails (unique per run).
#   2. Writes apps/mobile/.env.live (mode 600) with the approved project URL and the publishable key you supply.
#   3. Tells you to create the two users in the Supabase dashboard (the passwords are shown only by `show-passwords`, on request).
# Usage:  LIVE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... bash scripts/live-test-users.sh [init|show-passwords|clean]
set -euo pipefail
cd "$(dirname "$0")/.."
ENVFILE="${LIVE_ENV_FILE:-apps/mobile/.env.live}"
REF="vvwjhbsyxetnktimgaxg"
case "${1:-init}" in
  init)
    [ ! -e "$ENVFILE" ] || { echo "$ENVFILE already exists. Run 'clean' first (it deletes it)." >&2; exit 1; }
    key="${LIVE_SUPABASE_PUBLISHABLE_KEY:-}"
    case "$key" in sb_publishable_*) ;; *) echo "Set LIVE_SUPABASE_PUBLISHABLE_KEY to the publishable key (sb_publishable_...). Never use a secret/service key." >&2; exit 2 ;; esac
    id="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
    pw() { head -c 24 /dev/urandom | base64 | tr -d '/+=\n' | head -c 28; }
    umask 077
    {
      echo "LIVE_SUPABASE_URL=https://$REF.supabase.co"
      echo "LIVE_SUPABASE_PUBLISHABLE_KEY=$key"
      echo "LIVE_USER_A_EMAIL=live-a-$id@example.test"
      echo "LIVE_USER_A_PASSWORD=$(pw)"
      echo "LIVE_USER_B_EMAIL=live-b-$id@example.test"
      echo "LIVE_USER_B_PASSWORD=$(pw)"
    } > "$ENVFILE"
    echo "Wrote $ENVFILE (mode 600; the default path is git-ignored). Passwords were not printed."
    echo "Next: create these two users in the dashboard (Authentication > Users > Add user > Auto Confirm User)."
    echo "Emails:"; grep -E '^LIVE_USER_[AB]_EMAIL=' "$ENVFILE" | sed 's/^LIVE_USER_\(.\)_EMAIL=/  \1: /'
    echo "Passwords: run 'bash scripts/live-test-users.sh show-passwords' on a private screen when the dashboard asks."
    ;;
  show-passwords)
    [ -f "$ENVFILE" ] || { echo "No $ENVFILE" >&2; exit 1; }
    grep -E '^LIVE_USER_[AB]_PASSWORD=' "$ENVFILE" | sed 's/^LIVE_USER_\(.\)_PASSWORD=/  \1: /'
    ;;
  clean)
    [ -f "$ENVFILE" ] && { shred -u "$ENVFILE" 2>/dev/null || rm -f "$ENVFILE"; echo "Removed $ENVFILE."; }
    echo "Now delete the two users in the dashboard (their rows cascade) and remove any leftover objects under their folders in the food-photos bucket."
    ;;
  *) echo "usage: $0 [init|show-passwords|clean]" >&2; exit 2 ;;
esac
