#!/bin/sh
set -eu

export HOME="${HOME:-/app}"
export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/app/WORKSPACES/default}"
export CLAWMAX_AUTO_START_GATEWAY="${CLAWMAX_AUTO_START_GATEWAY:-true}"
export CLAWMAX_GATEWAY_WATCHDOG="${CLAWMAX_GATEWAY_WATCHDOG:-true}"
export CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC="${CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC:-30}"
export CLAWMAX_HOST_OPENCLAW_CONFIG="${CLAWMAX_HOST_OPENCLAW_CONFIG:-/root/.openclaw/openclaw.json}"

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

ensure_runtime_dirs() {
  mkdir -p \
    "$HOME/.openclaw" \
    "$HOME/.openclaw/agents" \
    "$OPENCLAW_WORKSPACE" \
    "$OPENCLAW_WORKSPACE/AGENTS" \
    "$OPENCLAW_WORKSPACE/WORKFLOWS" \
    "$OPENCLAW_WORKSPACE/GROUPS" \
    "$OPENCLAW_WORKSPACE/COMMUNITIES" \
    "$OPENCLAW_WORKSPACE/ORG"
}

ensure_openclaw_cli() {
  if ! command -v openclaw >/dev/null 2>&1; then
    echo "[entrypoint] ERROR: openclaw CLI is missing from the runtime image" >&2
    exit 1
  fi

  echo "[entrypoint] openclaw: $(openclaw --version 2>/dev/null || echo unavailable)"

  if ! openclaw config get gateway.mode >/dev/null 2>&1; then
    echo "[entrypoint] initializing openclaw gateway.mode=local"
    openclaw config set gateway.mode local >/dev/null 2>&1 || true
  fi
}

get_gateway_port() {
  gateway_port="$(openclaw config get gateway.port 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -z "$gateway_port" ]; then
    gateway_port="18789"
  fi
  printf '%s\n' "$gateway_port"
}

gateway_port_listening() {
  port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -Eq ":${port}([[:space:]]|$)"
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -tln 2>/dev/null | grep -Eq ":${port}([[:space:]]|$)"
    return $?
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "const net=require('net');const socket=net.createConnection(${port},'127.0.0.1');socket.on('connect',()=>{socket.end();process.exit(0)});socket.on('error',()=>process.exit(1));socket.setTimeout(1000,()=>{socket.destroy();process.exit(1)});" 2>/dev/null
    return $?
  fi
  return 1
}

start_gateway_run() {
  port="$1"
  echo "[entrypoint] starting gateway on port ${port}"
  openclaw gateway run --port "$port" >>/tmp/openclaw-gateway.log 2>&1 &
  gateway_pid=$!
  sleep 2
  if kill -0 "$gateway_pid" 2>/dev/null; then
    echo "[entrypoint] gateway started (pid ${gateway_pid})"
  else
    echo "[entrypoint] gateway failed to start — check /tmp/openclaw-gateway.log" >&2
  fi
}

ensure_gateway_running() {
  port="$1"
  if gateway_port_listening "$port"; then
    echo "[entrypoint] gateway already running on port ${port}"
    return 0
  fi
  start_gateway_run "$port"
}

gateway_watchdog_tick() {
  port="$1"
  if ! gateway_port_listening "$port"; then
    echo "[entrypoint] gateway watchdog detected gateway down"
    start_gateway_run "$port"
  fi
}

start_gateway_watchdog() {
  port="$1"
  (
    while true; do
      sleep "$CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC"
      gateway_watchdog_tick "$port"
    done
  ) &
}

main() {
  ensure_runtime_dirs
  ensure_openclaw_cli
  sync_gateway_config

  gateway_port="$(get_gateway_port)"

  if [ "$CLAWMAX_AUTO_START_GATEWAY" = "true" ]; then
    ensure_gateway_running "$gateway_port"
  fi

  if [ "$CLAWMAX_GATEWAY_WATCHDOG" = "true" ]; then
    start_gateway_watchdog "$gateway_port"
  fi

  exec "$@"
}

if [ "${CLAWMAX_ENTRYPOINT_TEST_MODE:-false}" = "true" ]; then
  return 0 2>/dev/null || exit 0
fi

main "$@"
