#!/usr/bin/env bash
# Runs the iOS app on YOUR Mac (simulator or a connected iPhone) against the STAGING Supabase project, with Friends switched on for this local run only.
# It builds and installs locally with Xcode (`expo run:ios`): nothing is uploaded to EAS, TestFlight or the App Store, and no shared build profile is touched.
#   cp scripts/friends-staging.env.example .friends-staging.env     (git-ignored; fill in the staging publishable key)
#   bash scripts/friends-staging-ios.sh [--device] [--community] [--health]    (without --device: the iOS Simulator; --community also switches Community on for this run;
#                                                                             --health adds the Apple Health native module and import switch, as the staging-preview profile does)
# Safety: refuses any project other than staging (the development project and everything else are rejected), refuses a secret or service key, and sets
# EXPO_PUBLIC_APP_ENV=preview so the production feature guard (which refuses Friends) is never involved.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGING_REF="bxhnrjulksganzydgrgm"
DEV_REF="vvwjhbsyxetnktimgaxg"
ENV_FILE="${FRIENDS_ENV_FILE:-.friends-staging.env}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Copy scripts/friends-staging.env.example to $ENV_FILE and fill it in." >&2; exit 2; }
set -a; . "$ENV_FILE"; set +a
URL="${EXPO_PUBLIC_SUPABASE_URL:-}"; KEY="${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}"
[ "$URL" = "https://${STAGING_REF}.supabase.co" ] || { echo "EXPO_PUBLIC_SUPABASE_URL must be exactly https://${STAGING_REF}.supabase.co (the staging project). Refusing." >&2; exit 3; }
case "$URL$KEY" in *"$DEV_REF"*) echo "That is the development project. Refusing." >&2; exit 3;; esac
case "$KEY" in sb_publishable_*) ;; *) echo "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be the PUBLISHABLE key (sb_publishable_...). Refusing." >&2; exit 4;; esac
case "$KEY" in *sb_secret_*|*service_role*) echo "A secret or service key must never be used in the app. Refusing." >&2; exit 4;; esac
export EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_AUTH_MODE=supabase EXPO_PUBLIC_CLOUD_ACCOUNTS=1 EXPO_PUBLIC_SOCIAL=1
unset EXPO_PUBLIC_COMMUNITY EXPO_PUBLIC_PRODUCTION_ACCOUNTS EXPO_PUBLIC_BARCODE_PROVIDER EXPO_PUBLIC_APPLE_HEALTH
DEVICE=0; COMMUNITY=0; HEALTH=0
for a in "$@"; do case "$a" in --device) DEVICE=1;; --community) COMMUNITY=1;; --health) HEALTH=1;; *) echo "Unknown option $a" >&2; exit 2;; esac; done
[ "$COMMUNITY" = "1" ] && export EXPO_PUBLIC_COMMUNITY=1
[ "$HEALTH" = "1" ] && export EXPO_PUBLIC_APPLE_HEALTH=1
echo "Staging project ${STAGING_REF}; Friends ON$([ "$COMMUNITY" = "1" ] && echo ', Community ON')$([ "$HEALTH" = "1" ] && echo ', Apple Health ON') for this local run; app environment: preview; nothing will be uploaded."
[ "${DRY_RUN:-0}" = "1" ] && { echo "Dry run: checks passed."; exit 0; }
cd apps/mobile
if [ "$DEVICE" = "1" ]; then exec npx expo run:ios --device; else exec npx expo run:ios; fi
