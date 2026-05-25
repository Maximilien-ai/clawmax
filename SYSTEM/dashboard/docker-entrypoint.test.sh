#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT_DIR/dashboard/docker-entrypoint.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BIN_DIR="$TMP_DIR/bin"
NODE_ONLY_BIN_DIR="$TMP_DIR/node-only-bin"
LOG_FILE="$TMP_DIR/openclaw.log"
mkdir -p "$BIN_DIR" "$NODE_ONLY_BIN_DIR" "$TMP_DIR/home" "$TMP_DIR/workspace" "$TMP_DIR/fake-node"
printf '{\n  "name": "clawmax-dashboard",\n  "version": "1.5.8"\n}\n' > "$TMP_DIR/package.json"
printf '{\n  "name": "clawmax-dashboard",\n  "version": "1.5.4"\n}\n' > "$TMP_DIR/package-old.json"

cat > "$BIN_DIR/openclaw" <<'EOF'
#!/bin/sh
set -eu
echo "$*" >> "$OPENCLAW_LOG"
case "$1 ${2:-} ${3:-}" in
  "--version  ")
    echo "openclaw-test"
    ;;
  "config get gateway.port")
    echo "18789"
    ;;
  "config get gateway.mode")
    echo "local"
    ;;
  "config set gateway.mode")
    exit 0
    ;;
  "gateway run --port")
    sleep 5
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod +x "$BIN_DIR/openclaw"
cp "$BIN_DIR/openclaw" "$NODE_ONLY_BIN_DIR/openclaw"
chmod +x "$NODE_ONLY_BIN_DIR/openclaw"

cat > "$BIN_DIR/ss" <<'EOF'
#!/bin/sh
set -eu
printf '%s\n' "${SS_OUTPUT:-}"
EOF
chmod +x "$BIN_DIR/ss"

cat > "$TMP_DIR/fake-node/node" <<'EOF'
#!/bin/sh
set -eu
exit "${NODE_EXIT_CODE:-1}"
EOF
chmod +x "$TMP_DIR/fake-node/node"
cp "$TMP_DIR/fake-node/node" "$NODE_ONLY_BIN_DIR/node"
chmod +x "$NODE_ONLY_BIN_DIR/node"

assert_contains() {
  needle="$1"
  file="$2"
  if ! grep -F "$needle" "$file" >/dev/null 2>&1; then
    echo "Expected to find '$needle' in $file" >&2
    exit 1
  fi
}

assert_not_contains() {
  needle="$1"
  file="$2"
  if grep -F "$needle" "$file" >/dev/null 2>&1; then
    echo "Did not expect to find '$needle' in $file" >&2
    exit 1
  fi
}

export PATH="$BIN_DIR:$PATH"
export OPENCLAW_LOG="$LOG_FILE"
export HOME="$TMP_DIR/home"
export OPENCLAW_WORKSPACE="$TMP_DIR/workspace"
export CLAWMAX_ENTRYPOINT_TEST_MODE=true
export CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package.json"
export CLAWMAX_VERSION="v1.5.8"

. "$SCRIPT"

: > "$LOG_FILE"
export SS_OUTPUT=""
ensure_gateway_running "18789"
assert_contains "gateway run --port 18789" "$LOG_FILE"
assert_not_contains "gateway restart" "$LOG_FILE"

: > "$LOG_FILE"
export SS_OUTPUT="LISTEN 0      128          0.0.0.0:18789      0.0.0.0:*"
ensure_gateway_running "18789"
assert_not_contains "gateway run --port 18789" "$LOG_FILE"

: > "$LOG_FILE"
export SS_OUTPUT=""
gateway_watchdog_tick "18789"
assert_contains "gateway run --port 18789" "$LOG_FILE"

: > "$LOG_FILE"
if ! PATH="$NODE_ONLY_BIN_DIR:/bin" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true OPENCLAW_LOG="$LOG_FILE" NODE_EXIT_CODE=0 sh -c '. "$1"; gateway_port_listening "18789"' _ "$SCRIPT"; then
  echo "Expected node-based gateway probe to succeed when NODE_EXIT_CODE=0" >&2
  exit 1
fi

if PATH="$NODE_ONLY_BIN_DIR:/bin" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true OPENCLAW_LOG="$LOG_FILE" NODE_EXIT_CODE=1 sh -c '. "$1"; gateway_port_listening "18789"' _ "$SCRIPT"; then
  echo "Expected node-based gateway probe to fail when NODE_EXIT_CODE=1" >&2
  exit 1
fi

if ! CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package.json" CLAWMAX_VERSION="v1.5.8" sh -c '. "$1"; verify_runtime_version_matches_image' _ "$SCRIPT"; then
  echo "Expected matching runtime package version to pass verification" >&2
  exit 1
fi

if CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package-old.json" CLAWMAX_VERSION="v1.5.8" sh -c '. "$1"; verify_runtime_version_matches_image' _ "$SCRIPT"; then
  echo "Expected mismatched runtime package version to fail verification" >&2
  exit 1
fi

echo "docker-entrypoint gateway tests passed"
