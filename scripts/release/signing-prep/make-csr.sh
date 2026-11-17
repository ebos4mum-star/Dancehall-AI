#!/usr/bin/env bash
# Run this ON YOUR MAC (Terminal). It never prints a key or password and never touches the Git repository.
#
#   bash scripts/release/signing-prep/make-csr.sh check     # 1. look for an Apple Distribution identity you could reuse (read only)
#   bash scripts/release/signing-prep/make-csr.sh create    # 2. create a new private key and a CSR to upload to Apple
#
# What `create` does:
#   - private key:  ~/.dancehall-signing/distribution.key   (RSA 2048, folder mode 700, file mode 600, outside any repository)
#   - CSR:          ~/Downloads/DanceHallFitAI_Distribution.csr   (this is the ONLY file you upload to Apple; it holds no secret)
#   - refuses to overwrite an existing key or CSR, so it can never replace something you already have.
set -euo pipefail
TEAM_ID="${TEAM_ID:-9RA6G4GC6Q}"
ORG="${ORG:-FlexApp software Inc.}"
DIR="${SIGNING_DIR:-$HOME/.dancehall-signing}"
KEY="$DIR/distribution.key"
CSR="${CSR_OUT:-$HOME/Downloads/DanceHallFitAI_Distribution.csr}"

cmd="${1:-}"
case "$cmd" in
  check)
    command -v security >/dev/null || { echo "This check needs macOS (the 'security' tool)."; exit 2; }
    echo "Valid code-signing identities in your keychains whose private key is on THIS Mac (names and Team IDs only):"
    IDS="$(security find-identity -v -p codesigning 2>/dev/null | grep -E 'Apple Distribution|iPhone Distribution' || true)"
    if [ -z "$IDS" ]; then
      echo "  none found -> there is nothing to reuse on this Mac. Use:  make-csr.sh create"
    else
      printf '%s\n' "$IDS" | sed -E 's/^[[:space:]]*[0-9]+\)[[:space:]]+[0-9A-F]{40}[[:space:]]+/  /'
      if printf '%s\n' "$IDS" | grep -q "($TEAM_ID)"; then
        echo
        echo "A distribution identity for team $TEAM_ID with its private key IS on this Mac."
        echo "You can REUSE it instead of creating a new certificate (Apple limits how many a team can hold):"
        echo "  Keychain Access > My Certificates > expand 'Apple Distribution: ...' > right-click the certificate > Export > .p12."
        echo "Nothing was changed, revoked or exported by this check."
      else
        echo "  (none of these is for team $TEAM_ID)"
      fi
    fi
    ;;
  create)
    command -v openssl >/dev/null || { echo "openssl not found."; exit 2; }
    [ ! -e "$KEY" ] || { echo "Refusing: $KEY already exists (not overwritten). If it is the key of a certificate Apple already issued, keep it and use make-p12.sh."; exit 1; }
    [ ! -e "$CSR" ] || { echo "Refusing: $CSR already exists (not overwritten). Move it away or set CSR_OUT."; exit 1; }
    mkdir -p "$DIR" "$(dirname "$CSR")"
    chmod 700 "$DIR"
    umask 077
    openssl genrsa -out "$KEY" 2048 2>/dev/null
    chmod 600 "$KEY"
    # Apple only needs a valid CSR with an RSA 2048 key; the subject is informational.
    openssl req -new -key "$KEY" -out "$CSR" -subj "/CN=DanceHall Fit AI Distribution/O=$ORG/C=US" 2>/dev/null
    chmod 644 "$CSR"
    openssl req -in "$CSR" -noout -verify >/dev/null 2>&1 || { echo "The CSR did not verify."; exit 1; }
    FP="$(openssl req -in "$CSR" -noout -pubkey | openssl pkey -pubin -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{print $NF}')"
    echo "Private key kept at:  $KEY   (mode 600; never share it, never commit it; back it up in your password manager or an encrypted drive)"
    echo "CSR to upload:        $CSR"
    echo "CSR public-key fingerprint (safe to share, for your records): ${FP:0:32}"
    echo
    echo "Next: on Apple's page choose 'Apple Distribution', Continue, 'Choose File', select the .csr above, Continue, Download the .cer."
    echo "Then run:  bash scripts/release/signing-prep/make-p12.sh ~/Downloads/<the downloaded>.cer"
    ;;
  *)
    echo "usage: make-csr.sh check | create" >&2; exit 2 ;;
esac
