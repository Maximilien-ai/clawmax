#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/clawmax-setup-contract.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT

BACKEND_PORT="${DASHBOARD_PORT:-3011}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5183}"
FRONTEND_URL="${DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"
PUBLIC_URL="${DASHBOARD_PUBLIC_URL:-http://localhost:${BACKEND_PORT}}"

cp -R "$ROOT_DIR" "$TMP_ROOT/repo"
cd "$TMP_ROOT/repo"

HOME="$TMP_ROOT/home" \
CI=true \
DASHBOARD_PORT="$BACKEND_PORT" \
DASHBOARD_CLIENT_PORT="$FRONTEND_PORT" \
DASHBOARD_APP_URL="$FRONTEND_URL" \
DASHBOARD_PUBLIC_URL="$PUBLIC_URL" \
./setup.sh --non-interactive >/tmp/clawmax-setup-contract.log 2>&1

ENV_FILE="$TMP_ROOT/repo/SYSTEM/dashboard/.env"
TOKEN_FILE="$TMP_ROOT/repo/SYSTEM/dashboard/.dashboard-token"
LEGACY_TOKEN_FILE="$TMP_ROOT/repo/WORKSPACES/default/.dashboard-token"

fail() {
  echo "✗ $1"
  if [ -f /tmp/clawmax-setup-contract.log ]; then
    echo ""
    echo "--- setup log ---"
    tail -n 80 /tmp/clawmax-setup-contract.log
  fi
  exit 1
}

grep -q "^DASHBOARD_PORT=$BACKEND_PORT$" "$ENV_FILE" || fail "Expected DASHBOARD_PORT override in .env"
grep -q "^DASHBOARD_APP_URL=$FRONTEND_URL$" "$ENV_FILE" || fail "Expected DASHBOARD_APP_URL override in .env"
grep -q "^DASHBOARD_PUBLIC_URL=$PUBLIC_URL$" "$ENV_FILE" || fail "Expected DASHBOARD_PUBLIC_URL override in .env"
grep -q '^OTP_EMAIL_SUBJECT="Your ClawMax login code"$' "$ENV_FILE" || fail "Expected quoted OTP_EMAIL_SUBJECT in .env"

[ -f "$TOKEN_FILE" ] || fail "Expected canonical dashboard token file"
[ -f "$LEGACY_TOKEN_FILE" ] || fail "Expected legacy workspace dashboard token file"

CANONICAL_TOKEN="$(cat "$TOKEN_FILE")"
LEGACY_TOKEN="$(cat "$LEGACY_TOKEN_FILE")"
[ -n "$CANONICAL_TOKEN" ] || fail "Expected canonical dashboard token to be non-empty"
[ "$CANONICAL_TOKEN" = "$LEGACY_TOKEN" ] || fail "Expected legacy token copy to match canonical token"

echo "✓ setup contract test passed"
