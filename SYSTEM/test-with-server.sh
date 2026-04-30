#!/bin/bash
# Start the dashboard if needed, run SYSTEM/test.sh, then stop only processes
# this wrapper started on the selected ports.
#
# Usage:
#   ./SYSTEM/test-with-server.sh [--with-validation] [integration]
#
# Env overrides match SYSTEM/start.sh and SYSTEM/test.sh:
#   DASHBOARD_PORT=3002
#   DASHBOARD_CLIENT_PORT=5174
#   DASHBOARD_APP_URL=http://localhost:5174
#
# Set CLAWMAX_TEST_KEEP_SERVER=true to leave newly started servers running.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"
FRONTEND_URL="${DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"
API_BASE="http://localhost:${BACKEND_PORT}"

export DASHBOARD_PORT="$BACKEND_PORT"
export DASHBOARD_CLIENT_PORT="$FRONTEND_PORT"
export DASHBOARD_APP_URL="$FRONTEND_URL"

port_pids() {
  lsof -ti:"$1" 2>/dev/null || true
}

contains_pid() {
  local needle="$1"
  local haystack="$2"
  for pid in $haystack; do
    if [ "$pid" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

health_ready() {
  curl -s --connect-timeout 3 --max-time 5 "$API_BASE/api/health" >/dev/null 2>&1
}

wait_for_health() {
  local max_seconds="${1:-60}"
  local elapsed=0
  while [ "$elapsed" -lt "$max_seconds" ]; do
    if health_ready; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

cleanup_started_processes() {
  if [ "${CLAWMAX_TEST_KEEP_SERVER:-}" = "true" ]; then
    echo "Leaving dashboard running because CLAWMAX_TEST_KEEP_SERVER=true"
    return
  fi

  local stopped=0
  for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    local before_var="INITIAL_BACKEND_PIDS"
    if [ "$port" = "$FRONTEND_PORT" ]; then
      before_var="INITIAL_FRONTEND_PIDS"
    fi

    local before="${!before_var}"
    for pid in $(port_pids "$port"); do
      if contains_pid "$pid" "$before"; then
        continue
      fi
      kill "$pid" >/dev/null 2>&1 || true
      stopped=$((stopped + 1))
    done
  done

  if [ "$stopped" -gt 0 ]; then
    sleep 1
    for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
      local before_var="INITIAL_BACKEND_PIDS"
      if [ "$port" = "$FRONTEND_PORT" ]; then
        before_var="INITIAL_FRONTEND_PIDS"
      fi

      local before="${!before_var}"
      for pid in $(port_pids "$port"); do
        if contains_pid "$pid" "$before"; then
          continue
        fi
        kill -9 "$pid" >/dev/null 2>&1 || true
      done
    done
    echo "Stopped dashboard processes started by test wrapper"
  fi
}

INITIAL_BACKEND_PIDS="$(port_pids "$BACKEND_PORT")"
INITIAL_FRONTEND_PIDS="$(port_pids "$FRONTEND_PORT")"
STARTED_SERVER=false

echo "Dashboard test wrapper"
echo "API: $API_BASE"
echo "Frontend: $FRONTEND_URL"
echo ""

if ! health_ready; then
  echo "Dashboard health check is not ready; starting dashboard..."
  if [ -n "$INITIAL_BACKEND_PIDS$INITIAL_FRONTEND_PIDS" ]; then
    echo "Ports are occupied but health is failing; restarting dashboard ports before testing."
    START_ARGS=(--restart)
  else
    START_ARGS=()
  fi
  STARTED_SERVER=true
  CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true "$SCRIPT_DIR/start.sh" "${START_ARGS[@]}"

  if ! wait_for_health 60; then
    echo "Dashboard did not become healthy on $API_BASE"
    echo "Logs: tail -f /tmp/dashboard.log"
    cleanup_started_processes
    exit 1
  fi
else
  echo "Dashboard is already healthy; running tests against existing server."
fi

TEST_STATUS=0
"$SCRIPT_DIR/test.sh" "$@" || TEST_STATUS=$?

if [ "$STARTED_SERVER" = true ]; then
  cleanup_started_processes
fi

exit "$TEST_STATUS"
