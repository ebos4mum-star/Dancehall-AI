#!/usr/bin/env bash
# Always runs at the end of a signing job: removes the throwaway keychain, the certificate and profile files and any API key file.
set -u
security delete-keychain "${RUNNER_TEMP:-/tmp}/release-signing.keychain-db" 2>/dev/null || true
rm -f "${RUNNER_TEMP:-/tmp}"/distribution.p12 "${RUNNER_TEMP:-/tmp}"/app.mobileprovision "${RUNNER_TEMP:-/tmp}"/profile.plist "${RUNNER_TEMP:-/tmp}"/c*.der
rm -rf "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/.appstoreconnect/private_keys" 2>/dev/null || true
echo "Signing material removed from the runner."
