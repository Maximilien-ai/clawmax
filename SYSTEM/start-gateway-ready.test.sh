#!/bin/bash
# start.sh's ensure_local_gateway_ready against a stub `openclaw` that replays
# `gateway status --json` answers and records every command it receives.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
START_SCRIPT="$ROOT_DIR/SYSTEM/start.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FUNCTIONS="$(sed -n '/^gateway_status_state() {$/,/^}$/p;/^redact_cli_output() {$/,/^}$/p;/^ensure_local_gateway_ready() {$/,/^}$/p' "$START_SCRIPT")"
[ -n "$FUNCTIONS" ] || { echo "FAIL: start.sh gateway functions not found"; exit 1; }

mkdir -p "$WORK/bin"
cat > "$WORK/bin/openclaw" <<'STUB'
#!/bin/bash
echo "$*" >> "$STUB_DIR/calls"
if [ "$1 $2" = "gateway status" ]; then
  n=$(( $(cat "$STUB_DIR/n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB_DIR/n"
  if [ -f "$STUB_DIR/status.$n" ]; then cat "$STUB_DIR/status.$n"; else cat "$STUB_DIR/status.last"; fi
  exit 0
fi
if [ -f "$STUB_DIR/$2.fail" ]; then cat "$STUB_DIR/$2.fail"; exit 1; fi
echo "ok"
STUB
printf '#!/bin/sh\necho Darwin\n' > "$WORK/bin/uname"
chmod +x "$WORK/bin/openclaw" "$WORK/bin/uname"

# Trimmed from `openclaw gateway status --json` (OpenClaw 2026.9.7) on a machine whose gateway
# LaunchAgent was never installed: no unit, nothing on the port, probe refused.
MISSING='{"service":{"label":"LaunchAgent","loaded":false,"runtime":{"status":"unknown","missingUnit":true}},"port":{"port":18789,"status":"free","listeners":[]},"rpc":{"ok":false,"kind":"connect","connectFailure":{"kind":"unreachable"},"error":"connect ECONNREFUSED 127.0.0.1:18789"}}'
STOPPED='{"service":{"label":"LaunchAgent","loaded":false,"runtime":{"status":"stopped","missingUnit":false}},"port":{"port":18789,"status":"free","listeners":[]},"rpc":{"ok":false,"connectFailure":{"kind":"unreachable"},"error":"connect ECONNREFUSED 127.0.0.1:18789"}}'
READY='{"service":{"label":"LaunchAgent","loaded":true,"runtime":{"status":"running","missingUnit":false}},"port":{"port":18789,"status":"busy","listeners":[{"pid":4242}]},"rpc":{"ok":true}}'
FOREIGN='{"service":{"label":"LaunchAgent","loaded":false,"runtime":{"status":"unknown","missingUnit":true}},"port":{"port":18789,"status":"busy","listeners":[{"pid":4242}]},"rpc":{"ok":false,"connectFailure":{"kind":"auth"},"error":"gateway closed (1008): unauthorized: gateway token mismatch"}}'

passed=0
# scenario NAME STATUS_1 STATUS_LAST [FAIL_ACTION] -> runs the real function, leaves $out and $calls
scenario() {
  local name="$1"
  STUB_DIR="$WORK/$name"; mkdir -p "$STUB_DIR"; : > "$STUB_DIR/calls"
  printf '%s' "$2" > "$STUB_DIR/status.1"
  printf '%s' "$3" > "$STUB_DIR/status.last"
  if [ -n "${4:-}" ]; then printf 'Error: launchctl bootstrap failed: 5\ntoken %s\ngateway.auth.token=short-Secret1\n' "$(printf 'x%.0s' {1..40})" > "$STUB_DIR/$4.fail"; fi
  out="$(STUB_DIR="$STUB_DIR" PATH="$WORK/bin:$PATH" OPENCLAW_BIN="$WORK/bin/openclaw" CLAWMAX_SKIP_GATEWAY_BOOTSTRAP='' bash -c "
    . '$ROOT_DIR/SYSTEM/openclaw-cli.sh'
    sleep() { :; }
    $FUNCTIONS
    ensure_local_gateway_ready" 2>&1)"
  calls="$(grep -v '^gateway status --json$' "$STUB_DIR/calls" || true)"
}
expect() {
  if ! eval "$2"; then
    echo "FAIL: $1"; echo "  output: $out"; echo "  mutating calls: ${calls:-none}"; exit 1
  fi
  passed=$((passed + 1))
}

scenario healthy "$READY" "$READY"
expect "a healthy gateway is left alone" '[ -z "$calls" ] && [ -z "$out" ]'

scenario missing-unit "$MISSING" "$READY"
expect "a missing LaunchAgent (OpenClaw 2026.9 wording) is installed, which starts it" '[ "$calls" = "gateway install" ]'
expect "readiness is confirmed after install" '[[ "$out" == *"OpenClaw gateway is ready"* ]]'

scenario stopped "$STOPPED" "$READY"
expect "an installed but stopped gateway is restarted, not reinstalled" '[ "$calls" = "gateway restart" ]'

scenario foreign-owner "$FOREIGN" "$FOREIGN"
expect "a port held by a gateway that rejects us is never installed over or restarted" '[ -z "$calls" ]'
expect "the rejection is reported" '[[ "$out" == *"auth: gateway closed (1008): unauthorized: gateway token mismatch"* ]]'

scenario install-fails "$MISSING" "$MISSING" install
expect "a failed install is reported, not swallowed" '[[ "$out" == *"openclaw gateway install'"'"' failed"* ]] && [[ "$out" == *"launchctl bootstrap failed: 5"* ]]'
expect "secrets in the failure output are redacted" '[[ "$out" != *xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx* ]] && [[ "$out" != *short-Secret1* ]] && [[ "$out" == *"token=<redacted>"* ]]'
expect "nothing else runs after a failed install" '[ "$calls" = "gateway install" ]'

scenario unreadable "Usage: openclaw gateway status" "Usage: openclaw gateway status"
expect "an unreadable status changes nothing" '[ -z "$calls" ] && [[ "$out" == *"Could not read the OpenClaw gateway status"* ]]'

scenario never-ready "$MISSING" "$MISSING"
expect "waiting for readiness is bounded" '[ "$(cat "$WORK/never-ready/n")" -le 12 ] && [[ "$out" == *"not answering yet (unreachable: connect ECONNREFUSED 127.0.0.1:18789)"* ]]'

echo "start-gateway-ready.test.sh: $passed tests passed"
