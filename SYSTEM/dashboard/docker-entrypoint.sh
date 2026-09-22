#!/bin/sh
set -eu

export HOME="${HOME:-/app}"
# Runtime plugin installs can be hundreds of megabytes. Keep npm's disposable
# download cache off the persistent workspace volume; installed OpenClaw state
# remains under HOME, while cached tarballs can be recreated after a restart.
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/clawmax-npm-cache}"
export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/app/WORKSPACES/default}"
export CLAWMAX_AUTO_START_GATEWAY="${CLAWMAX_AUTO_START_GATEWAY:-true}"
export CLAWMAX_GATEWAY_WATCHDOG="${CLAWMAX_GATEWAY_WATCHDOG:-true}"
export CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC="${CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC:-30}"
export CLAWMAX_GATEWAY_READY_TIMEOUT_SEC="${CLAWMAX_GATEWAY_READY_TIMEOUT_SEC:-25}"
export CLAWMAX_GATEWAY_LEASE_RECOVERY_TIMEOUT_SEC="${CLAWMAX_GATEWAY_LEASE_RECOVERY_TIMEOUT_SEC:-330}"
export CLAWMAX_GATEWAY_LOG="${CLAWMAX_GATEWAY_LOG:-/tmp/openclaw-gateway.log}"
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

working.agents = working.agents && typeof working.agents === 'object' && !Array.isArray(working.agents)
  ? working.agents
  : {}
if (Array.isArray(working.agents.list)) {
  const entries = {}
  for (const agent of working.agents.list) {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) continue
    const id = typeof agent.id === 'string' ? agent.id.trim() : ''
    if (!id) continue
    const { id: _id, backupModel: _backupModel, ...entry } = agent
    entries[id] = entry
  }
  delete working.agents.list
  working.agents.entries = entries
}
const agentCount = working.agents.entries && typeof working.agents.entries === 'object' && !Array.isArray(working.agents.entries)
  ? Object.keys(working.agents.entries).length
  : 0
if (agentCount > 1) working.agents.ownership = 'explicit'
if (working.commands && typeof working.commands === 'object' && !Array.isArray(working.commands)) {
  delete working.commands.ownerDisplay
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

migrate_openclaw_2_state() {
  legacy_state="$(find "$HOME/.openclaw/agents" -type f \( -name auth-profiles.json -o -path '*/sessions/sessions.json' \) -print -quit 2>/dev/null || true)"
  [ -n "$legacy_state" ] || return 0

  echo "[entrypoint] migrating legacy OpenClaw auth/session state to SQLite"
  if ! openclaw doctor --fix --non-interactive --yes; then
    echo "[entrypoint] ERROR: OpenClaw state migration failed; legacy state was preserved for recovery" >&2
    return 1
  fi

  legacy_state="$(find "$HOME/.openclaw/agents" -type f \( -name auth-profiles.json -o -path '*/sessions/sessions.json' \) -print -quit 2>/dev/null || true)"
  if [ -n "$legacy_state" ]; then
    echo "[entrypoint] ERROR: OpenClaw reported success but legacy state remains at ${legacy_state}" >&2
    return 1
  fi
  echo "[entrypoint] OpenClaw auth/session migration complete"
}

get_gateway_auth_token() {
  OPENCLAW_CONFIG_FILE="$HOME/.openclaw/openclaw.json" node <<'NODE'
const fs = require('fs')

try {
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_FILE, 'utf8'))
  const token = config?.gateway?.auth?.token || config?.gateway?.remote?.token || ''
  if (typeof token === 'string') process.stdout.write(token.trim())
} catch {}
NODE
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
  if ! openclaw config set gateway.auth.token "$gateway_token" >/dev/null 2>&1; then
    echo "[entrypoint] ERROR: unable to persist gateway auth token" >&2
    exit 1
  fi
  persisted_gateway_token="$(get_gateway_auth_token)"
  if [ "$persisted_gateway_token" != "$gateway_token" ]; then
    echo "[entrypoint] ERROR: persisted gateway auth token could not be resolved" >&2
    exit 1
  fi
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

gateway_authenticated_ready() {
  port="$1"
  gateway_token="$(get_gateway_auth_token)"
  [ -n "$gateway_token" ] || return 1
  openclaw gateway call health \
    --json \
    --timeout 3000 \
    --url "ws://127.0.0.1:${port}" \
    --token "$gateway_token" >/dev/null 2>&1
}

wait_for_gateway_ready() {
  port="$1"
  timeout_sec="$CLAWMAX_GATEWAY_READY_TIMEOUT_SEC"
  case "$timeout_sec" in
    ''|*[!0-9]*) timeout_sec=25 ;;
  esac
  [ "$timeout_sec" -gt 0 ] || timeout_sec=1
  deadline=$(( $(date +%s) + timeout_sec ))

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if gateway_authenticated_ready "$port"; then
      echo "[entrypoint] gateway authenticated readiness verified on port ${port}"
      return 0
    fi
    if [ -n "${gateway_pid:-}" ] && ! kill -0 "$gateway_pid" 2>/dev/null; then
      echo "[entrypoint] ERROR: gateway exited before authenticated readiness" >&2
      tail -n 40 "$CLAWMAX_GATEWAY_LOG" >&2 2>/dev/null || true
      return 1
    fi
    sleep 1
  done

  echo "[entrypoint] ERROR: gateway did not pass authenticated readiness within ${timeout_sec}s on port ${port}" >&2
  tail -n 40 "$CLAWMAX_GATEWAY_LOG" >&2 2>/dev/null || true
  return 1
}

start_gateway_run() {
  port="$1"
  echo "[entrypoint] starting gateway on port ${port}"
  openclaw gateway run --port "$port" >>"$CLAWMAX_GATEWAY_LOG" 2>&1 &
  gateway_pid=$!
  gateway_owned=true
  sleep 2
  if kill -0 "$gateway_pid" 2>/dev/null; then
    echo "[entrypoint] gateway started (pid ${gateway_pid})"
  else
    echo "[entrypoint] gateway failed to start — check /tmp/openclaw-gateway.log" >&2
    tail -n 40 "$CLAWMAX_GATEWAY_LOG" >&2 2>/dev/null || true
    return 1
  fi
}

start_gateway_with_lease_recovery() {
  lease_port="$1"
  lease_budget="$CLAWMAX_GATEWAY_LEASE_RECOVERY_TIMEOUT_SEC"
  case "$lease_budget" in ''|*[!0-9]*) lease_budget=330 ;; esac
  [ "$lease_budget" -le 330 ] || lease_budget=330
  lease_deadline=$(( $(date +%s) + lease_budget ))
  while true; do
    # Classify only this attempt, never an old failure left in an appended log.
    lease_log_offset=0
    if [ -f "$CLAWMAX_GATEWAY_LOG" ]; then
      lease_log_offset=$(wc -c < "$CLAWMAX_GATEWAY_LOG")
    fi
    if start_gateway_run "$lease_port" && wait_for_gateway_ready "$lease_port"; then
      return 0
    fi
    # Never abandon a live child or retry unrelated configuration/auth failures.
    if [ -n "${gateway_pid:-}" ] && kill -0 "$gateway_pid" 2>/dev/null; then
      return 1
    fi
    if [ -n "${gateway_pid:-}" ]; then wait "$gateway_pid" 2>/dev/null || true; fi
    if ! tail -c "+$((lease_log_offset + 1))" "$CLAWMAX_GATEWAY_LOG" 2>/dev/null \
      | grep -F 'Gateway failed to start: Another Gateway owner lease is still active for this state directory.' >/dev/null; then
      return 1
    fi
    if [ "$(date +%s)" -ge "$lease_deadline" ]; then
      echo '[entrypoint] ERROR: gateway owner lease recovery deadline exceeded; refusing to clear another owner' >&2
      return 1
    fi
    echo '[entrypoint] waiting for gateway owner lease expiry; readiness remains unavailable'
    sleep 5
    # Another gateway may have appeared while we waited. Do not compete with it.
    if gateway_port_listening "$lease_port"; then
      gateway_authenticated_ready "$lease_port"
      return $?
    fi
  done
}

ensure_gateway_running() {
  port="$1"
  if gateway_authenticated_ready "$port"; then
    echo "[entrypoint] gateway already running and authenticated on port ${port}"
    return 0
  fi
  if gateway_port_listening "$port"; then
    echo "[entrypoint] ERROR: port ${port} is listening but the gateway failed authenticated readiness" >&2
    return 1
  fi
  start_gateway_with_lease_recovery "$port"
}

gateway_watchdog_tick() {
  port="$1"
  gateway_authenticated_ready "$port" && return 0

  echo "[entrypoint] gateway watchdog detected an unhealthy gateway"
  if [ -n "${gateway_pid:-}" ] && kill -0 "$gateway_pid" 2>/dev/null; then
    kill "$gateway_pid" 2>/dev/null || true
    wait "$gateway_pid" 2>/dev/null || true
  elif gateway_port_listening "$port"; then
    echo "[entrypoint] ERROR: unhealthy gateway on port ${port} is not managed by this container" >&2
    return 1
  fi
  start_gateway_with_lease_recovery "$port"
}

start_gateway_watchdog() {
  port="$1"
  (
    # The initial gateway belongs to the parent supervisor. Only forward to a
    # replacement that this watchdog actually spawned, avoiding double TERM.
    gateway_owned=false
    trap 'if [ -n "${watchdog_sleep_pid:-}" ]; then kill "$watchdog_sleep_pid" 2>/dev/null || true; wait "$watchdog_sleep_pid" 2>/dev/null || true; fi; if [ "${gateway_owned:-false}" = true ] && [ -n "${gateway_pid:-}" ]; then kill "$gateway_pid" 2>/dev/null || true; wait "$gateway_pid" 2>/dev/null || true; fi; exit 0' TERM INT
    while true; do
      sleep "$CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC" &
      watchdog_sleep_pid=$!
      wait "$watchdog_sleep_pid" || true
      watchdog_sleep_pid=''
      # A failed recovery must not terminate this supervisor under set -e.
      # Keep retrying on subsequent ticks, without overlapping attempts.
      if ! gateway_watchdog_tick "$port"; then
        echo "[entrypoint] WARNING: gateway recovery failed; retrying next watchdog interval" >&2
      fi
    done
  ) &
  watchdog_pid=$!
}

shutdown_children() {
  # Do not let the init process exit (and the kernel kill remaining children)
  # before OpenClaw has released its persisted owner lease.
  trap '' TERM INT
  for managed_pid in "${watchdog_pid:-}" "${dashboard_pid:-}" "${gateway_pid:-}"; do
    if [ -n "$managed_pid" ]; then kill "$managed_pid" 2>/dev/null || true; fi
  done
  for managed_pid in "${watchdog_pid:-}" "${dashboard_pid:-}" "${gateway_pid:-}"; do
    if [ -n "$managed_pid" ]; then wait "$managed_pid" 2>/dev/null || true; fi
  done
}

main() {
  # Keep an init for adopted children and a supervisor that waits for every
  # owned service's graceful shutdown, including gateway lease release.
  if [ "$$" -eq 1 ]; then
    exec /usr/bin/tini -- "$0" "$@"
  fi
  trap 'shutdown_children; exit 143' TERM
  trap 'shutdown_children; exit 130' INT
  ensure_runtime_dirs
  log_runtime_version_diagnostics
  verify_runtime_version_matches_image
  ensure_openclaw_cli
  sync_gateway_config
  migrate_openclaw_2_state
  ensure_gateway_auth_token

  gateway_port="$(get_gateway_port)"

  if [ "$CLAWMAX_AUTO_START_GATEWAY" = "true" ]; then
    # Dashboard startup healing/agent registration can write openclaw.json.
    # Do not launch those writers while the gateway is validating/migrating
    # that file: OpenClaw aborts startup if its selected config changes.
    # Fail closed instead of serving green storage health with no gateway.
    ensure_gateway_running "$gateway_port"
  fi

  if [ "$CLAWMAX_GATEWAY_WATCHDOG" = "true" ]; then
    start_gateway_watchdog "$gateway_port"
  fi

  "$@" &
  dashboard_pid=$!
  dashboard_status=0
  wait "$dashboard_pid" || dashboard_status=$?
  shutdown_children
  return "$dashboard_status"
}

if [ "${CLAWMAX_ENTRYPOINT_TEST_MODE:-false}" = "true" ]; then
  return 0 2>/dev/null || exit 0
fi

main "$@"
