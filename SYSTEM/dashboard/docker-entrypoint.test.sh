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
  "config get gateway.auth.token")
    if [ -f "${GATEWAY_AUTH_TOKEN_FILE:-}" ]; then
      cat "${GATEWAY_AUTH_TOKEN_FILE}"
    fi
    ;;
  "config set gateway.mode")
    exit 0
    ;;
  "config set gateway.auth.token")
    printf '%s' "${4:-}" > "${GATEWAY_AUTH_TOKEN_FILE:?}"
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

CLAUDE_ONLY_BIN_DIR="$TMP_DIR/claude-only-bin"
EMPTY_BIN_DIR="$TMP_DIR/empty-bin"
mkdir -p "$CLAUDE_ONLY_BIN_DIR" "$EMPTY_BIN_DIR"
cat > "$CLAUDE_ONLY_BIN_DIR/claude" <<'EOF'
#!/bin/sh
echo "claude-test"
EOF
chmod +x "$CLAUDE_ONLY_BIN_DIR/claude"

DROID_BIN_OVERRIDE="$TMP_DIR/droid-override/droid"
mkdir -p "$(dirname "$DROID_BIN_OVERRIDE")"
cat > "$DROID_BIN_OVERRIDE" <<'EOF'
#!/bin/sh
echo "droid-test"
EOF
chmod +x "$DROID_BIN_OVERRIDE"

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
export GATEWAY_AUTH_TOKEN_FILE="$TMP_DIR/gateway.token"
export CLAWMAX_HOST_OPENCLAW_CONFIG="$TMP_DIR/host-openclaw.json"

. "$SCRIPT"

ensure_gateway_auth_token
[ -s "$GATEWAY_AUTH_TOKEN_FILE" ] || {
  echo "Expected missing gateway auth token to be generated" >&2
  exit 1
}
generated_gateway_token="$(cat "$GATEWAY_AUTH_TOKEN_FILE")"

ensure_gateway_auth_token
[ "$(cat "$GATEWAY_AUTH_TOKEN_FILE")" = "$generated_gateway_token" ] || {
  echo "Expected existing gateway auth token to be preserved" >&2
  exit 1
}

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
if ! PATH="$NODE_ONLY_BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true OPENCLAW_LOG="$LOG_FILE" NODE_EXIT_CODE=0 /bin/sh -c '. "$1"; gateway_port_listening "18789"' _ "$SCRIPT"; then
  echo "Expected node-based gateway probe to succeed when NODE_EXIT_CODE=0" >&2
  exit 1
fi

if PATH="$NODE_ONLY_BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true OPENCLAW_LOG="$LOG_FILE" NODE_EXIT_CODE=1 /bin/sh -c '. "$1"; gateway_port_listening "18789"' _ "$SCRIPT"; then
  echo "Expected node-based gateway probe to fail when NODE_EXIT_CODE=1" >&2
  exit 1
fi

if ! CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package.json" CLAWMAX_VERSION="v1.5.8" sh -c '. "$1"; verify_runtime_version_matches_image' _ "$SCRIPT"; then
  echo "Expected matching runtime package version to pass verification" >&2
  exit 1
fi

if ! CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package.json" CLAWMAX_VERSION="1.5.8-test-rc15" sh -c '. "$1"; verify_runtime_version_matches_image' _ "$SCRIPT"; then
  echo "Expected matching RC release line to pass verification" >&2
  exit 1
fi

if CLAWMAX_RUNTIME_PACKAGE_JSON="$TMP_DIR/package-old.json" CLAWMAX_VERSION="v1.5.8" sh -c '. "$1"; verify_runtime_version_matches_image' _ "$SCRIPT"; then
  echo "Expected mismatched runtime package version to fail verification" >&2
  exit 1
fi

# ensure_openclaw_cli: openclaw is optional as long as another agent runtime
# CLI (claude/droid, on PATH or via CLAUDE_BIN/DROID_BIN) is available — warn,
# don't hard-fail.
WARN_LOG="$TMP_DIR/ensure-openclaw-warn.log"
if ! PATH="$CLAUDE_ONLY_BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true /bin/sh -c '. "$1"; ensure_openclaw_cli' _ "$SCRIPT" 2>"$WARN_LOG"; then
  echo "Expected ensure_openclaw_cli to succeed (not exit) when a claude CLI is on PATH" >&2
  cat "$WARN_LOG" >&2
  exit 1
fi
assert_contains "WARNING" "$WARN_LOG"

: > "$WARN_LOG"
if ! PATH="$EMPTY_BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true DROID_BIN="$DROID_BIN_OVERRIDE" /bin/sh -c '. "$1"; ensure_openclaw_cli' _ "$SCRIPT" 2>"$WARN_LOG"; then
  echo "Expected ensure_openclaw_cli to succeed (not exit) when DROID_BIN points at an executable" >&2
  cat "$WARN_LOG" >&2
  exit 1
fi
assert_contains "WARNING" "$WARN_LOG"

# ensure_openclaw_cli: hard-fail when no runtime CLI is available at all.
if PATH="$EMPTY_BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true /bin/sh -c '. "$1"; ensure_openclaw_cli' _ "$SCRIPT" >/dev/null 2>&1; then
  echo "Expected ensure_openclaw_cli to exit non-zero when no runtime CLI is available" >&2
  exit 1
fi

# ensure_openclaw_cli: unaffected when openclaw itself is present.
: > "$LOG_FILE"
PATH="$BIN_DIR" HOME="$TMP_DIR/home" OPENCLAW_WORKSPACE="$TMP_DIR/workspace" CLAWMAX_ENTRYPOINT_TEST_MODE=true OPENCLAW_LOG="$LOG_FILE" /bin/sh -c '. "$1"; ensure_openclaw_cli' _ "$SCRIPT"
assert_contains "--version" "$LOG_FILE"

cat > "$TMP_DIR/host-openclaw.json" <<'EOF'
{
  "gateway": {
    "port": 19999,
    "auth": {
      "mode": "token",
      "token": "host-token"
    }
  }
}
EOF
rm -f "$HOME/.openclaw/openclaw.json"
sync_gateway_config
assert_contains '"port": 19999' "$HOME/.openclaw/openclaw.json"
assert_contains '"token": "host-token"' "$HOME/.openclaw/openclaw.json"
assert_contains '"deny": [' "$HOME/.openclaw/openclaw.json"
assert_contains '"cognee-openclaw"' "$HOME/.openclaw/openclaw.json"
assert_not_contains '"allow": [' "$HOME/.openclaw/openclaw.json"
assert_not_contains '__clawmax_no_non_bundled_plugins__' "$HOME/.openclaw/openclaw.json"

cat > "$TMP_DIR/host-openclaw.json" <<'EOF'
{}
EOF
cat > "$HOME/.openclaw/openclaw.json" <<'EOF'
{
  "plugins": {
    "allow": ["__clawmax_no_non_bundled_plugins__"]
  }
}
EOF
sync_gateway_config
assert_contains '"deny": [' "$HOME/.openclaw/openclaw.json"
assert_contains '"cognee-openclaw"' "$HOME/.openclaw/openclaw.json"
assert_not_contains '"allow": [' "$HOME/.openclaw/openclaw.json"
assert_not_contains '__clawmax_no_non_bundled_plugins__' "$HOME/.openclaw/openclaw.json"

cat > "$TMP_DIR/host-openclaw.json" <<'EOF'
{
  "plugins": {
    "deny": ["custom-plugin"]
  }
}
EOF
rm -f "$HOME/.openclaw/openclaw.json"
sync_gateway_config
assert_contains '"deny": [' "$HOME/.openclaw/openclaw.json"
assert_contains '"custom-plugin"' "$HOME/.openclaw/openclaw.json"
assert_contains '"cognee-openclaw"' "$HOME/.openclaw/openclaw.json"
assert_not_contains '__clawmax_no_non_bundled_plugins__' "$HOME/.openclaw/openclaw.json"

cat > "$TMP_DIR/host-openclaw.json" <<'EOF'
{
  "plugins": {
    "allow": ["cognee-openclaw"],
    "entries": {
      "cognee-openclaw": {
        "hooks": {
          "allowConversationAccess": true
        }
      }
    }
  }
}
EOF
rm -f "$HOME/.openclaw/openclaw.json"
sync_gateway_config
assert_contains '"allow": [' "$HOME/.openclaw/openclaw.json"
assert_contains '"cognee-openclaw"' "$HOME/.openclaw/openclaw.json"
assert_contains '"allowConversationAccess": true' "$HOME/.openclaw/openclaw.json"
assert_not_contains '"deny": [' "$HOME/.openclaw/openclaw.json"
assert_not_contains '__clawmax_no_non_bundled_plugins__' "$HOME/.openclaw/openclaw.json"

echo "docker-entrypoint gateway tests passed"
