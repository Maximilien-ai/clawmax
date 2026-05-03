#!/bin/sh
set -eu

export HOME="${HOME:-/app}"
export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/app/WORKSPACES/default}"
export CLAWMAX_AUTO_START_GATEWAY="${CLAWMAX_AUTO_START_GATEWAY:-true}"
export CLAWMAX_GATEWAY_WATCHDOG="${CLAWMAX_GATEWAY_WATCHDOG:-true}"
export CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC="${CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC:-30}"
export CLAWMAX_HOST_OPENCLAW_CONFIG="${CLAWMAX_HOST_OPENCLAW_CONFIG:-/root/.openclaw/openclaw.json}"

mkdir -p \
  "$HOME/.openclaw" \
  "$HOME/.openclaw/agents" \
  "$OPENCLAW_WORKSPACE" \
  "$OPENCLAW_WORKSPACE/AGENTS" \
  "$OPENCLAW_WORKSPACE/WORKFLOWS" \
  "$OPENCLAW_WORKSPACE/GROUPS" \
  "$OPENCLAW_WORKSPACE/COMMUNITIES" \
  "$OPENCLAW_WORKSPACE/ORG"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "[entrypoint] ERROR: openclaw CLI is missing from the runtime image" >&2
  exit 1
fi

echo "[entrypoint] openclaw: $(openclaw --version 2>/dev/null || echo unavailable)"

if ! openclaw config get gateway.mode >/dev/null 2>&1; then
  echo "[entrypoint] initializing openclaw gateway.mode=local"
  openclaw config set gateway.mode local >/dev/null 2>&1 || true
fi

sync_gateway_config() {
  HOST_CONFIG="$CLAWMAX_HOST_OPENCLAW_CONFIG" WORKING_CONFIG="$HOME/.openclaw/openclaw.json" node <<'NODE'
const fs = require('fs')

const hostPath = process.env.HOST_CONFIG
const workingPath = process.env.WORKING_CONFIG

const tryReadJson = (targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) return null
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'))
  } catch {
    return null
  }
}

const host = tryReadJson(hostPath)
if (!host?.gateway) process.exit(0)

const token = host.gateway?.auth?.token || host.gateway?.remote?.token || ''
const port = host.gateway?.port
const mode = host.gateway?.auth?.mode || 'token'
if (!token && !port) process.exit(0)

const working = tryReadJson(workingPath) || {}
working.gateway = working.gateway || {}
working.gateway.auth = working.gateway.auth || {}
working.gateway.remote = working.gateway.remote || {}

if (port) {
  working.gateway.port = port
}
if (token) {
  working.gateway.auth.token = token
  working.gateway.remote.token = token
}
working.gateway.auth.mode = mode

fs.writeFileSync(workingPath, JSON.stringify(working, null, 2))
NODE
}

sync_gateway_config

restart_gateway() {
  echo "[entrypoint] attempting to start openclaw gateway"
  openclaw gateway restart >/tmp/openclaw-gateway.log 2>&1 || true
}

if [ "$CLAWMAX_AUTO_START_GATEWAY" = "true" ]; then
  if openclaw gateway status >/dev/null 2>&1; then
    echo "[entrypoint] gateway already running"
  else
    restart_gateway
  fi
fi

if [ "$CLAWMAX_GATEWAY_WATCHDOG" = "true" ]; then
  (
    while true; do
      sleep "$CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC"
      if ! openclaw gateway status >/dev/null 2>&1; then
        echo "[entrypoint] gateway watchdog detected gateway down"
        restart_gateway
      fi
    done
  ) &
fi

exec "$@"
