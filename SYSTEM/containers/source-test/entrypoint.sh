#!/usr/bin/env bash
set -euo pipefail

export HOME=/home/node
export TMPDIR="$HOME/tmp"
export CLAWMAX_OPENCLAW_CACHE_DIR="$HOME/openclaw-cache"
export CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true
export OPENCLAW_STATE_DIR="$HOME/.openclaw"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_STATE_DIR/openclaw.json"
export OPENCLAW_NO_RESPAWN=1 OPENCLAW_DISABLE_BONJOUR=1
export CI=true DASHBOARD_AUTH_MODE=bypass BYPASS_OAUTH=true
# Both published ports are restricted to host loopback by the host launcher.
export DASHBOARD_HOST=0.0.0.0 DASHBOARD_ALLOW_UNAUTHENTICATED_NETWORK_BIND=true
export DASHBOARD_APP_URL="http://127.0.0.1:${DASHBOARD_CLIENT_PORT}"
export DASHBOARD_PUBLIC_URL="http://127.0.0.1:${DASHBOARD_PORT}"
export CORS_ORIGIN="$DASHBOARD_APP_URL"
checkout="$HOME/clawmax"
mkdir -p "$TMPDIR"
rm -f "$HOME/ready"
gateway_pid= dashboard_pid= stopping=false
stage() { printf '%s\n' "$1" > "$HOME/stage"; echo "[clean source test] $1"; }
cleanup() {
  local result=$?
  trap - EXIT
  [ "$result" -eq 0 ] || stage failed
  rm -f "$HOME/ready"
  for pid in "$dashboard_pid" "$gateway_pid"; do
    [ -z "$pid" ] || kill -TERM -- "-$pid" 2>/dev/null || true
  done
  exit "$result"
}
trap cleanup EXIT
trap 'stopping=true; exit 0' INT TERM

if [ ! -d "$checkout/.git" ]; then
  stage cloning
  git clone --depth 1 --single-branch --branch "${CLAWMAX_TEST_REF:-main}" -- \
    "${CLAWMAX_TEST_REPOSITORY:-https://github.com/Maximilien-ai/clawmax.git}" "$checkout"
fi
cd "$checkout"
git rev-parse HEAD > "$HOME/source-sha"
echo "Source: $(cat "$HOME/source-sha")"
export CLAWMAX_VERSION="2.0.0-dev.clean-install.$(cut -c1-8 "$HOME/source-sha")"
export OPENCLAW_WORKSPACE="$checkout/WORKSPACES/default"
export CLAWMAX_WORKSPACE_REGISTRY_PATH="$HOME/workspaces.json"
stage setup
./setup.sh --non-interactive
export OPENCLAW_BIN
OPENCLAW_BIN="$(bash SYSTEM/prepare-openclaw-target.sh --print-bin)"

# Containers have no host service manager. Configure only this fresh container's
# Gateway after the real installer has completed; retain its plugin consent.
stage gateway
node <<'NODE'
const fs = require('node:fs'), crypto = require('node:crypto');
const file = process.env.OPENCLAW_CONFIG_PATH;
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.gateway = { ...config.gateway, mode: 'local', bind: 'loopback', port: 18789,
  auth: { mode: 'token', token: config.gateway?.auth?.token || crypto.randomBytes(32).toString('hex') },
  controlUi: { enabled: false } };
config.agents ||= {}; config.agents.defaults ||= {};
config.agents.defaults.workspace = process.env.OPENCLAW_WORKSPACE;
config.agents.defaults.models = { ...config.agents.defaults.models, 'openai/*': { agentRuntime: { id: 'openclaw' } } };
fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
NODE
export OPENCLAW_GATEWAY_TOKEN
OPENCLAW_GATEWAY_TOKEN="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.env.OPENCLAW_CONFIG_PATH)).gateway.auth.token)')"
export OPENCLAW_GATEWAY_PORT=18789
setsid "$OPENCLAW_BIN" gateway run --port 18789 --bind loopback > "$HOME/gateway.log" 2>&1 &
gateway_pid=$!
export GATEWAY_PID="$gateway_pid"
node <<'NODE'
const { execFileSync } = require('node:child_process');
(async () => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    process.kill(Number(process.env.GATEWAY_PID), 0);
    try {
      const result = await fetch('http://127.0.0.1:18789/health', { signal: AbortSignal.timeout(1000) });
      if (result.ok) {
        execFileSync(process.env.OPENCLAW_BIN, ['gateway', 'call', 'health', '--json', '--timeout', '5000'], { stdio: 'pipe', timeout: 10000 });
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error('Gateway readiness timed out. Inspect /home/node/gateway.log');
})().catch(error => { console.error(error.message); process.exit(1) });
NODE
stage dashboard
setsid ./SYSTEM/start.sh --follow &
dashboard_pid=$!
node --input-type=module <<'NODE'
import { waitForDashboard } from './SYSTEM/local-dev.mjs';
await waitForDashboard({ apiUrl: process.env.DASHBOARD_PUBLIC_URL,
  uiUrl: process.env.DASHBOARD_APP_URL, version: process.env.CLAWMAX_VERSION,
  workspace: process.env.OPENCLAW_WORKSPACE });
NODE
touch "$HOME/ready"
stage ready
echo "ClawMax clean-source install ready: $DASHBOARD_APP_URL"
echo "Add an API key in Model Integration, create an agent and try chat."
set +e
wait -n "$gateway_pid" "$dashboard_pid"
result=$?
set -e
[ "$stopping" = true ] || { echo 'A supervised service exited; inspect the container logs.' >&2; [ "$result" -ne 0 ] || result=1; exit "$result"; }
