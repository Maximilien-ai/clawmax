#!/bin/bash
# start.sh's Gateway steps, run for real against a throwaway HOME. Fake launchctl records what would
# have been loaded; fake lsof reports both dashboard ports busy, so start.sh stops right after the
# Gateway steps ("Dashboard already running") without starting or killing anything.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-start-gateway-test.XXXXXX")"
cleanup() {
  case "$SANDBOX" in
    */clawmax-start-gateway-test.*) rm -rf -- "$SANDBOX" ;;
  esac
}
trap cleanup EXIT

mkdir -p "$SANDBOX/bin" "$SANDBOX/home"
cat > "$SANDBOX/bin/launchctl" <<EOF
#!/bin/sh
echo "launchctl \$*" >> "$SANDBOX/launchctl.log"
EOF
cat > "$SANDBOX/bin/lsof" <<'EOF'
#!/bin/sh
echo 1
EOF
cat > "$SANDBOX/bin/openclaw" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$SANDBOX/bin/launchctl" "$SANDBOX/bin/lsof" "$SANDBOX/bin/openclaw"

run_start() {
  env -i PATH="$SANDBOX/bin:$PATH" HOME="$SANDBOX/home" OPENCLAW_BIN="$SANDBOX/bin/openclaw" \
    CLAWMAX_ALLOW_UNPINNED_OPENCLAW=true DASHBOARD_PORT=59991 DASHBOARD_CLIENT_PORT=59992 "$@" \
    bash "$ROOT_DIR/SYSTEM/start.sh" 2>&1
}
fail() {
  echo "FAIL: $1"
  exit 1
}
passed=0
plist="$SANDBOX/home/Library/LaunchAgents/ai.clawmax.gateway-watchdog.plist"

output="$(run_start CLAWMAX_AUTO_START_GATEWAY=false)"
[ ! -e "$plist" ] || fail "start.sh must not install the watchdog unless CLAWMAX_GATEWAY_WATCHDOG=true"
[ ! -e "$SANDBOX/launchctl.log" ] || fail "start.sh must not call launchctl by default: $(cat "$SANDBOX/launchctl.log")"
echo "$output" | grep -q "Gateway auto-start is off" || fail "start.sh must run the local Gateway step: $output"
echo "$output" | grep -q "Dashboard already running" || fail "start.sh must reach the port checks: $output"
passed=$((passed + 1))

output="$(run_start CLAWMAX_AUTO_START_GATEWAY=false CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true)"
echo "$output" | grep -q -E "Gateway auto-start|OpenClaw Gateway|Gateway section" && fail "CLAWMAX_SKIP_GATEWAY_BOOTSTRAP must skip every Gateway step: $output"
passed=$((passed + 1))

# By default start.sh provides the Gateway itself. The fake CLI answers nothing, so the step reports
# that it cannot inspect services (or that the default port is taken) and starts nothing.
output="$(run_start)"
echo "$output" | grep -q -E "Could not check for an installed OpenClaw Gateway service|Port 18789 is in use" \
  || fail "start.sh must run the local Gateway step by default: $output"
passed=$((passed + 1))

# A configured workspace secret broker keeps CLI-only chat: brokered skills need --local runs.
output="$(run_start CLAWMAX_SECRET_MASTER_KEY=0123456789abcdef0123456789abcdef)"
echo "$output" | grep -q "secret broker is configured" || fail "start.sh must keep CLI-only chat when the secret broker is configured: $output"
passed=$((passed + 1))

if [ "$(uname -s)" = "Darwin" ]; then
  # A watchdog installed by an earlier start.sh is left exactly as it is.
  mkdir -p "$(dirname "$plist")"
  printf '<plist>installed earlier</plist>\n' > "$plist"
  run_start CLAWMAX_AUTO_START_GATEWAY=false >/dev/null
  [ "$(cat "$plist")" = "<plist>installed earlier</plist>" ] || fail "start.sh must not rewrite an installed watchdog"
  [ ! -e "$SANDBOX/launchctl.log" ] || fail "start.sh must not unload or reload an installed watchdog: $(cat "$SANDBOX/launchctl.log")"
  passed=$((passed + 1))

  run_start CLAWMAX_AUTO_START_GATEWAY=false CLAWMAX_GATEWAY_WATCHDOG=true >/dev/null
  [ -f "$plist" ] || fail "CLAWMAX_GATEWAY_WATCHDOG=true must install the watchdog LaunchAgent"
  grep -q "gateway-watchdog.sh" "$plist" || fail "the watchdog LaunchAgent must run gateway-watchdog.sh"
  grep -q "launchctl load $plist" "$SANDBOX/launchctl.log" || fail "the watchdog LaunchAgent must be loaded"
  passed=$((passed + 1))
fi

echo "start-gateway.test.sh: $passed tests passed"
