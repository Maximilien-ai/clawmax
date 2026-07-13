#!/bin/sh
set -eu

export HOME="${HOME:-/app}"
export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/app/WORKSPACES/default}"
export CLAWMAX_AUTO_START_GATEWAY="${CLAWMAX_AUTO_START_GATEWAY:-true}"
export CLAWMAX_GATEWAY_WATCHDOG="${CLAWMAX_GATEWAY_WATCHDOG:-true}"
export CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC="${CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC:-30}"
export CLAWMAX_HOST_OPENCLAW_CONFIG="${CLAWMAX_HOST_OPENCLAW_CONFIG:-/root/.openclaw/openclaw.json}"
export CLAWMAX_RUNTIME_PACKAGE_JSON="${CLAWMAX_RUNTIME_PACKAGE_JSON:-/app/SYSTEM/dashboard/package.json}"
export CLAWMAX_STRICT_OPENCLAW_PLUGIN_POLICY="${CLAWMAX_STRICT_OPENCLAW_PLUGIN_POLICY:-true}"

sync_gateway_config() {
  HOST_CONFIG="$CLAWMAX_HOST_OPENCLAW_CONFIG" WORKING_CONFIG="$HOME/.openclaw/openclaw.json" STRICT_PLUGIN_POLICY="$CLAWMAX_STRICT_OPENCLAW_PLUGIN_POLICY" node <<'NODE'
const fs = require('fs')
const path = require('path')

const hostPath = process.env.HOST_CONFIG
const workingPath = process.env.WORKING_CONFIG
const strictPluginPolicy = !/^false$/i.test(String(process.env.STRICT_PLUGIN_POLICY || 'true').trim())
const DEFAULT_DENIED_NON_BUNDLED_PLUGINS = ['cognee-openclaw']
const DEPRECATED_ALLOW_SENTINELS = new Set([
  '__clawmax_no_non_bundled_plugins__',
  'clawmax_no_non_bundled_plugins'
])

const tryReadJson = (targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) return null
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'))
  } catch {
    return null
  }
}

const host = tryReadJson(hostPath)
const working = tryReadJson(workingPath) || {}

if (host?.gateway) {
  const token = host.gateway?.auth?.token || host.gateway?.remote?.token || ''
  const port = host.gateway?.port
  const mode = host.gateway?.auth?.mode || 'token'

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
}

if (host?.plugins && typeof host.plugins === 'object') {
  working.plugins = JSON.parse(JSON.stringify(host.plugins))
}

if (strictPluginPolicy) {
  working.plugins = working.plugins || {}
  const explicitAllow = Array.isArray(working.plugins.allow)
    ? working.plugins.allow
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter((value) => value && !DEPRECATED_ALLOW_SENTINELS.has(value))
    : []
  const explicitDeny = Array.isArray(working.plugins.deny)
    ? working.plugins.deny.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
    : []

  if (explicitAllow.length === 0) {
    delete working.plugins.allow
    const deny = new Set(explicitDeny)
    for (const pluginId of DEFAULT_DENIED_NON_BUNDLED_PLUGINS) deny.add(pluginId)
    working.plugins.deny = Array.from(deny)
  } else {
    working.plugins.allow = explicitAllow
    if (explicitDeny.length > 0) {
      working.plugins.deny = explicitDeny
    } else {
      delete working.plugins.deny
    }
  }
}

fs.mkdirSync(path.dirname(workingPath), { recursive: true })
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

claude_cli_present() {
  if [ -n "${CLAUDE_BIN:-}" ] && [ -x "${CLAUDE_BIN}" ]; then
    return 0
  fi
  command -v claude >/dev/null 2>&1
}

droid_cli_present() {
  if [ -n "${DROID_BIN:-}" ] && [ -x "${DROID_BIN}" ]; then
    return 0
  fi
  command -v droid >/dev/null 2>&1
}

ensure_openclaw_cli() {
  if command -v openclaw >/dev/null 2>&1; then
    echo "[entrypoint] openclaw: $(openclaw --version 2>/dev/null || echo unavailable)"

    if ! openclaw config get gateway.mode >/dev/null 2>&1; then
      echo "[entrypoint] initializing openclaw gateway.mode=local"
      openclaw config set gateway.mode local >/dev/null 2>&1 || true
    fi
    return 0
  fi

  # openclaw is optional as long as another agent runtime CLI is present. The
  # workspace's active runtime (and any per-agent pin) lives in a workspace
  # data file, not an env var, so this entrypoint can't know in advance which
  # CLI a given agent actually needs — the rule is: only hard-fail when NO
  # runtime CLI exists at all. Gateway startup and openclaw-cron registration
  # are skipped below when openclaw itself is unavailable.
  if claude_cli_present || droid_cli_present; then
    echo "[entrypoint] WARNING: openclaw CLI is missing from the runtime image — the gateway and any agents pinned to the openclaw runtime will not work" >&2
    echo "[entrypoint] Other agent runtime CLI(s) detected — agents pinned to claude/droid can still run" >&2
    return 0
  fi

  echo "[entrypoint] ERROR: no agent runtime CLI (openclaw, claude, or droid) is available in the runtime image" >&2
  exit 1
}

get_gateway_auth_token() {
  openclaw config get gateway.auth.token 2>/dev/null | tr -d '[:space:]' || true
}

generate_gateway_auth_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 2>/dev/null && return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null && return 0
  fi
  return 1
}

ensure_gateway_auth_token() {
  gateway_token="$(get_gateway_auth_token)"
  if [ -n "$gateway_token" ] && [ "$gateway_token" != "unset" ] && [ "$gateway_token" != "undefined" ]; then
    echo "[entrypoint] gateway auth token already configured"
    return 0
  fi

  gateway_token="$(generate_gateway_auth_token || true)"
  if [ -z "$gateway_token" ]; then
    echo "[entrypoint] ERROR: unable to generate gateway auth token" >&2
    exit 1
  fi

  echo "[entrypoint] generating gateway auth token"
  openclaw config set gateway.auth.token "$gateway_token" >/dev/null 2>&1 || true
}

normalize_version() {
  printf '%s' "$1" | sed 's/^v//'
}

get_runtime_dashboard_version() {
  package_json="$CLAWMAX_RUNTIME_PACKAGE_JSON"
  if [ ! -f "$package_json" ]; then
    return 1
  fi

  PACKAGE_JSON="$package_json" node <<'NODE'
const fs = require('fs')
const pkgPath = process.env.PACKAGE_JSON
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const version = typeof pkg.version === 'string' ? pkg.version.trim() : ''
  if (!version) process.exit(1)
  process.stdout.write(version)
} catch {
  process.exit(1)
}
NODE
}

log_runtime_version_diagnostics() {
  actual="$(get_runtime_dashboard_version || true)"
  expected="$(normalize_version "${CLAWMAX_VERSION:-}")"

  if [ -n "$actual" ]; then
    echo "[entrypoint] packaged dashboard version: ${actual}"
  else
    echo "[entrypoint] packaged dashboard version: unavailable"
  fi

  if [ -n "$expected" ]; then
    echo "[entrypoint] image CLAWMAX_VERSION: ${expected}"
  else
    echo "[entrypoint] image CLAWMAX_VERSION: unset"
  fi

  echo "[entrypoint] HOME=${HOME}"
  echo "[entrypoint] OPENCLAW_WORKSPACE=${OPENCLAW_WORKSPACE}"
}

verify_runtime_version_matches_image() {
  expected="$(normalize_version "${CLAWMAX_VERSION:-}")"
  [ -n "$expected" ] || return 0

  actual="$(get_runtime_dashboard_version || true)"
  [ -n "$actual" ] || return 0

  actual="$(normalize_version "$actual")"
  actual_core="${actual%%-*}"
  expected_core="${expected%%-*}"
  if [ "$actual_core" != "$expected_core" ]; then
    echo "[entrypoint] ERROR: runtime dashboard files report version ${actual}, but image expects ${expected}" >&2
    echo "[entrypoint] This usually means a host mount or stack override replaced /app/SYSTEM/dashboard with older files." >&2
    echo "[entrypoint] Check stack volume mounts and ensure the runtime is not overlaying bundled dashboard contents from another version." >&2
    return 1
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
  log_runtime_version_diagnostics
  verify_runtime_version_matches_image
  ensure_openclaw_cli
  sync_gateway_config
  ensure_gateway_auth_token

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
