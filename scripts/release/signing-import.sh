#!/usr/bin/env bash
# Imports the App Store distribution certificate into a throwaway keychain and installs the App Store provisioning profile,
# after checking that the two belong together and match this app. macOS only. Nothing is printed except non-secret facts.
# Inputs (environment, from the protected GitHub environment): P12_BASE64, P12_PASSWORD, PROFILE_BASE64, TEAM_ID, BUNDLE_ID,
# RUNNER_TEMP, GITHUB_OUTPUT. Output: profile_name, profile_uuid.
set -euo pipefail
: "${P12_BASE64:?}" "${P12_PASSWORD:?}" "${PROFILE_BASE64:?}" "${TEAM_ID:?}" "${BUNDLE_ID:?}" "${RUNNER_TEMP:?}" "${GITHUB_OUTPUT:?}"
PB=/usr/libexec/PlistBuddy
KC="$RUNNER_TEMP/release-signing.keychain-db"
KC_PASS="$(openssl rand -base64 32)"
echo "::add-mask::$KC_PASS"

printf '%s' "$P12_BASE64" | base64 --decode > "$RUNNER_TEMP/distribution.p12"
printf '%s' "$PROFILE_BASE64" | base64 --decode > "$RUNNER_TEMP/app.mobileprovision"

security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings -lut 3600 "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
security import "$RUNNER_TEMP/distribution.p12" -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k "$KC" >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$KC_PASS" "$KC" >/dev/null
# Put the throwaway keychain first in the search list so xcodebuild finds the identity.
# shellcheck disable=SC2046
security list-keychains -d user -s "$KC" $(security list-keychains -d user | tr -d '"')

IDENT_LINE="$(security find-identity -v -p codesigning "$KC" | grep 'Apple Distribution' | head -n 1 || true)"
[ -n "$IDENT_LINE" ] || { echo "No 'Apple Distribution' identity in the certificate file (a development or Mac certificate is refused)."; exit 1; }
IDENT_SHA="$(printf '%s' "$IDENT_LINE" | awk '{print $2}')"
case "$IDENT_LINE" in *"($TEAM_ID)"*) ;; *) echo "The certificate does not belong to the configured team."; exit 1;; esac

PLIST="$RUNNER_TEMP/profile.plist"
security cms -D -i "$RUNNER_TEMP/app.mobileprovision" > "$PLIST"
NAME="$($PB -c 'Print :Name' "$PLIST")"
UUID="$($PB -c 'Print :UUID' "$PLIST")"
fail() { echo "Provisioning profile check failed: $1"; exit 1; }
[ "$($PB -c 'Print :TeamIdentifier:0' "$PLIST")" = "$TEAM_ID" ] || fail "team differs from the configured team"
[ "$($PB -c 'Print :Entitlements:application-identifier' "$PLIST")" = "$TEAM_ID.$BUNDLE_ID" ] || fail "not an explicit profile for $BUNDLE_ID"
$PB -c 'Print :Entitlements:com.apple.developer.healthkit' "$PLIST" >/dev/null 2>&1 || fail "the profile does not include the HealthKit capability (enable it on the App ID, then regenerate the profile)"
if $PB -c 'Print :ProvisionedDevices' "$PLIST" >/dev/null 2>&1; then fail "has a device list: that is a development or ad hoc profile, not App Store"; fi
if $PB -c 'Print :ProvisionsAllDevices' "$PLIST" >/dev/null 2>&1; then fail "is an enterprise profile"; fi
[ "$($PB -c 'Print :Entitlements:get-task-allow' "$PLIST")" = "false" ] || fail "get-task-allow is not false (not a distribution profile)"
EXP="$(date -u -j -f '%a %b %d %T UTC %Y' "$($PB -c 'Print :ExpirationDate' "$PLIST" | sed 's/  */ /g')" +%s 2>/dev/null || echo 0)"
[ "$EXP" -gt "$(date -u +%s)" ] || fail "expired or unreadable expiry date"
# The profile must list the very certificate that was imported.
FOUND=0; N=0
while $PB -c "Print :DeveloperCertificates:$N" "$PLIST" >/dev/null 2>&1; do
  $PB -c "Print :DeveloperCertificates:$N" "$PLIST" > "$RUNNER_TEMP/c$N.der" 2>/dev/null || true
  SHA="$(openssl x509 -inform der -in "$RUNNER_TEMP/c$N.der" -noout -fingerprint -sha1 2>/dev/null | sed 's/.*=//; s/://g' | tr 'a-f' 'A-F')"
  [ "$SHA" = "$(printf '%s' "$IDENT_SHA" | tr 'a-f' 'A-F')" ] && FOUND=1
  N=$((N+1))
done
[ "$FOUND" = 1 ] || fail "does not include the imported distribution certificate"

mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$RUNNER_TEMP/app.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$UUID.mobileprovision"
{ echo "profile_name=$NAME"; echo "profile_uuid=$UUID"; } >> "$GITHUB_OUTPUT"
echo "Signing material accepted: Apple Distribution certificate for the configured team, App Store profile for $BUNDLE_ID with HealthKit."
