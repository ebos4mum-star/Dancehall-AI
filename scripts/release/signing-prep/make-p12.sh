#!/usr/bin/env bash
# Run this ON YOUR MAC after Apple has issued the certificate and you have downloaded the .cer file.
#   bash scripts/release/signing-prep/make-p12.sh ~/Downloads/distribution.cer
#
# It checks that the certificate really is the Apple Distribution certificate for your team, is not expired, and matches the private key that
# make-csr.sh created. It then writes ~/.dancehall-signing/distribution.p12 (mode 600), protected by a password you type (twice, hidden).
# It never prints the key, the password or the file contents, and never uploads anything. Nothing here touches the Git repository.
set -euo pipefail
TEAM_ID="${TEAM_ID:-9RA6G4GC6Q}"
DIR="${SIGNING_DIR:-$HOME/.dancehall-signing}"
KEY="$DIR/distribution.key"
OUT="$DIR/distribution.p12"
CER="${1:-}"
[ -n "$CER" ] && [ -f "$CER" ] || { echo "usage: make-p12.sh <path to the downloaded .cer>" >&2; exit 2; }
[ -f "$KEY" ] || { echo "No private key at $KEY. The key must be the one created by make-csr.sh on this Mac (the certificate only works with its own key)."; exit 1; }
[ ! -e "$OUT" ] || { echo "Refusing: $OUT already exists (not overwritten). Move it away first."; exit 1; }
umask 077
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Apple delivers DER; accept PEM too.
if openssl x509 -inform DER -in "$CER" -out "$TMP/cert.pem" 2>/dev/null; then :; elif openssl x509 -inform PEM -in "$CER" -out "$TMP/cert.pem" 2>/dev/null; then :; else echo "That file is not a certificate."; exit 1; fi

SUBJ="$(openssl x509 -in "$TMP/cert.pem" -noout -subject -nameopt RFC2253)"
printf '%s\n' "$SUBJ" | grep -q "CN=Apple Distribution" || { echo "This is not an Apple Distribution certificate."; exit 1; }
printf '%s\n' "$SUBJ" | grep -q "OU=$TEAM_ID" || { echo "This certificate is not for team $TEAM_ID."; exit 1; }
openssl x509 -in "$TMP/cert.pem" -noout -checkend 0 >/dev/null || { echo "This certificate has expired."; exit 1; }

# The certificate must match the private key (same public key).
CERT_PUB="$(openssl x509 -in "$TMP/cert.pem" -noout -pubkey | openssl pkey -pubin -outform DER | openssl dgst -sha256 | awk '{print $NF}')"
KEY_PUB="$(openssl pkey -in "$KEY" -pubout -outform DER | openssl dgst -sha256 | awk '{print $NF}')"
[ "$CERT_PUB" = "$KEY_PUB" ] || { echo "This certificate does NOT match the private key in $KEY. Wrong CSR or wrong key; nothing was written."; exit 1; }

read -r -s -p "Choose a strong password for the .p12 (hidden): " P1; echo
read -r -s -p "Repeat it: " P2; echo
[ -n "$P1" ] && [ "$P1" = "$P2" ] || { echo "Passwords differ or are empty. Nothing was written."; exit 1; }
[ "${#P1}" -ge 12 ] || { echo "Use at least 12 characters. Nothing was written."; exit 1; }

# Algorithms compatible with macOS 'security import' (OpenSSL 3 defaults are not). The password goes through a private temp file, never the command line.
printf '%s' "$P1" > "$TMP/pw"
openssl pkcs12 -export -inkey "$KEY" -in "$TMP/cert.pem" -name "Apple Distribution $TEAM_ID" \
  -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 \
  -passout "file:$TMP/pw" -out "$OUT" 2>/dev/null
chmod 600 "$OUT"
# Verify it opens with the password and holds the certificate and the key.
openssl pkcs12 -in "$OUT" -passin "file:$TMP/pw" -nokeys -clcerts 2>/dev/null | grep -q "BEGIN CERTIFICATE" || { rm -f "$OUT"; echo "The .p12 did not verify; it was removed."; exit 1; }
openssl pkcs12 -in "$OUT" -passin "file:$TMP/pw" -nocerts -nodes 2>/dev/null | grep -q "PRIVATE KEY" || { rm -f "$OUT"; echo "The .p12 holds no private key; it was removed."; exit 1; }
unset P1 P2

EXP="$(openssl x509 -in "$TMP/cert.pem" -noout -enddate | cut -d= -f2)"
SHA1="$(openssl x509 -in "$TMP/cert.pem" -noout -fingerprint -sha1 | sed 's/.*=//')"
echo "Created $OUT (mode 600), password-protected, containing the certificate and its matching private key."
echo "Certificate expires: $EXP    SHA-1 fingerprint (public, for your records): $SHA1"
echo
echo "Keep the password in your password manager. Back up $KEY and $OUT somewhere encrypted. Never commit or email them, and do not paste them into chat."
echo "GitHub: nothing has been uploaded. When you decide to, the commands are in docs/TESTFLIGHT_SETUP_CHECKLIST.md step 8 (run by you, from your terminal)."
