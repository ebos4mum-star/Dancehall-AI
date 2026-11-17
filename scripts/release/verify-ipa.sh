#!/usr/bin/env bash
# Inspects a finished IPA before it is kept or uploaded. macOS only.
# Usage: verify-ipa.sh <file.ipa> <version> <build>   (environment: BUNDLE_ID, EXPECT_REF = the designated staging project reference)
set -euo pipefail
IPA="${1:?ipa}"; VERSION="${2:?version}"; BUILD="${3:?build}"
: "${BUNDLE_ID:?}" "${EXPECT_REF:?}" "${RUNNER_TEMP:?}"
PB=/usr/libexec/PlistBuddy
W="$(mktemp -d "$RUNNER_TEMP/ipa.XXXXXX")"
trap 'rm -rf "$W"' EXIT
unzip -q "$IPA" -d "$W"
APP="$(ls -d "$W"/Payload/*.app | head -n 1)"
fail() { echo "IPA check failed: $1"; exit 1; }
[ "$($PB -c 'Print :CFBundleIdentifier' "$APP/Info.plist")" = "$BUNDLE_ID" ] || fail "bundle identifier"
[ "$($PB -c 'Print :CFBundleShortVersionString' "$APP/Info.plist")" = "$VERSION" ] || fail "version is not $VERSION"
[ "$($PB -c 'Print :CFBundleVersion' "$APP/Info.plist")" = "$BUILD" ] || fail "build number is not $BUILD"
[ "$($PB -c 'Print :ITSAppUsesNonExemptEncryption' "$APP/Info.plist")" = "false" ] || fail "export compliance flag"
$PB -c 'Print :NSHealthShareUsageDescription' "$APP/Info.plist" >/dev/null || fail "Health read text missing"
if $PB -c 'Print :NSHealthUpdateUsageDescription' "$APP/Info.plist" >/dev/null 2>&1; then fail "Health write text present"; fi
[ -f "$APP/PrivacyInfo.xcprivacy" ] || fail "PrivacyInfo.xcprivacy is not in the app bundle"
[ -f "$APP/embedded.mobileprovision" ] || fail "no embedded provisioning profile"
security cms -D -i "$APP/embedded.mobileprovision" > "$W/p.plist"
if $PB -c 'Print :ProvisionedDevices' "$W/p.plist" >/dev/null 2>&1; then fail "profile has a device list (not App Store)"; fi
codesign --verify --strict --deep "$APP" || fail "code signature does not verify"
codesign -d --entitlements :- "$APP" > "$W/ent.plist" 2>/dev/null || fail "cannot read entitlements"
$PB -c 'Print :com.apple.developer.healthkit' "$W/ent.plist" >/dev/null 2>&1 || fail "HealthKit entitlement missing from the signed app"
[ "$($PB -c 'Print :get-task-allow' "$W/ent.plist" 2>/dev/null || echo false)" = "false" ] || fail "get-task-allow is true (debuggable build)"
# The JavaScript bundle must point at the designated staging project only: nothing else, no placeholder, no development project.
BUNDLE="$(find "$APP" -maxdepth 1 \( -name 'main.jsbundle' -o -name '*.hbc' \) | head -n 1)"
[ -n "$BUNDLE" ] || fail "JavaScript bundle not found"
grep -a -q "$EXPECT_REF" "$BUNDLE" || fail "staging project reference not found in the bundle"
for BAD in placeholder.invalid; do
  if grep -a -q "$BAD" "$BUNDLE"; then fail "the bundle contains a forbidden string ($BAD)"; fi
done
OTHER="$(grep -a -o '[a-z]\{20\}\.supabase\.co' "$BUNDLE" | sort -u | grep -v "^$EXPECT_REF" || true)"
[ -z "$OTHER" ] || fail "the bundle references another Supabase project"
echo "IPA OK: $BUNDLE_ID $VERSION ($BUILD), signed, App Store profile, HealthKit entitlement, privacy manifest, staging project only."
