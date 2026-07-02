#!/bin/bash
# Start the dashboard if needed, run SYSTEM/test.sh, then stop only processes
# this wrapper started on the selected ports.
#
# Usage:
#   ./SYSTEM/test-with-server.sh [--with-validation] [integration] [--coverage]
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
RUN_INTEGRATION=false
RUN_COVERAGE=false
FORWARDED_ARGS=()

for arg in "$@"; do
  if [ "$arg" = "integration" ]; then
    RUN_INTEGRATION=true
    FORWARDED_ARGS+=("$arg")
  elif [ "$arg" = "--coverage" ]; then
    RUN_COVERAGE=true
  else
    FORWARDED_ARGS+=("$arg")
  fi
done

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

print_coverage_summary() {
  local summary_file="$ROOT_DIR/SYSTEM/dashboard/coverage/coverage-summary.json"

  if [ ! -f "$summary_file" ]; then
    echo "Coverage requested, but no summary was generated at $summary_file"
    return 1
  fi

  echo ""
  echo "Coverage summary"
  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const summary = JSON.parse(fs.readFileSync(path, "utf8")).total || {};
    const format = (label, key) => {
      const item = summary[key] || {};
      const pct = typeof item.pct === "number" ? item.pct.toFixed(2) : "0.00";
      const covered = item.covered ?? 0;
      const total = item.total ?? 0;
      console.log(`  ${label}: ${pct}% (${covered}/${total})`);
    };
    format("Statements", "statements");
    format("Branches", "branches");
    format("Functions", "functions");
    format("Lines", "lines");
  ' "$summary_file"
  echo "Coverage artifacts:"
  echo "  $ROOT_DIR/SYSTEM/dashboard/coverage/coverage-summary.json"
  echo "  $ROOT_DIR/SYSTEM/dashboard/coverage/"
}

print_perf_summary() {
  local summary_file="$ROOT_DIR/SYSTEM/dashboard/perf/perf-summary.json"
  local history_file="$ROOT_DIR/SYSTEM/dashboard/perf/perf-history.json"

  if [ ! -f "$summary_file" ]; then
    return 1
  fi

  echo ""
  echo "Performance summary"
  node -e '
    const fs = require("fs");
    const summaryPath = process.argv[1];
    const historyPath = process.argv[2];
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    const metrics = summary.metrics || {};
    const notes = summary.notes || {};
    const history = fs.existsSync(historyPath)
      ? JSON.parse(fs.readFileSync(historyPath, "utf8"))
      : { runs: [] };
    const runs = Array.isArray(history.runs) ? history.runs : [];
    const format = (label, key) => {
      const value = metrics[key];
      const rendered = typeof value === "number" ? `${value}ms` : "n/a";
      console.log(`  ${label}: ${rendered}`);
    };
    const numeric = (key) => runs
      .map((run) => run?.metrics?.[key])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    const average = (values) => values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
    const median = (values) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 1) return sorted[mid];
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };
    format("Workflow list", "workflowListMs");
    format("Agent chat round-trip", "agentChatRoundTripMs");
    format("Workflow trigger", "workflowTriggerMs");
    format("Workflow first visible progress", "workflowFirstProgressMs");
    format("Workflow kickoff complete", "workflowKickoffCompleteMs");
    console.log(`  History samples: ${runs.length}`);
    const summaryStats = [
      ["Workflow list avg", "workflowListMs"],
      ["Agent chat avg", "agentChatRoundTripMs"],
      ["Workflow trigger avg", "workflowTriggerMs"],
      ["Workflow first progress avg", "workflowFirstProgressMs"],
      ["Workflow kickoff complete avg", "workflowKickoffCompleteMs"],
    ];
    for (const [label, key] of summaryStats) {
      const values = numeric(key);
      const avg = average(values);
      const med = median(values);
      const renderedAvg = typeof avg === "number" ? `${avg}ms` : "n/a";
      const renderedMed = typeof med === "number" ? `${med}ms` : "n/a";
      console.log(`  ${label}: ${renderedAvg} (median ${renderedMed}, n=${values.length})`);
    }
    if (notes.agentChat) console.log(`  Agent chat note: ${notes.agentChat}`);
    if (notes.workflowProgress) console.log(`  Workflow progress note: ${notes.workflowProgress}`);
  ' "$summary_file" "$history_file"
  echo "Performance artifact:"
  echo "  $ROOT_DIR/SYSTEM/dashboard/perf/perf-summary.json"
  echo "  $ROOT_DIR/SYSTEM/dashboard/perf/perf-history.json"
}

INITIAL_BACKEND_PIDS="$(port_pids "$BACKEND_PORT")"
INITIAL_FRONTEND_PIDS="$(port_pids "$FRONTEND_PORT")"
STARTED_SERVER=false
START_WITH_RESTART=false

echo "Dashboard test wrapper"
echo "API: $API_BASE"
echo "Frontend: $FRONTEND_URL"
echo ""

if ! health_ready; then
  echo "Dashboard health check is not ready; starting dashboard..."
  if [ -n "$INITIAL_BACKEND_PIDS$INITIAL_FRONTEND_PIDS" ]; then
    echo "Ports are occupied but health is failing; restarting dashboard ports before testing."
    START_WITH_RESTART=true
  fi
  STARTED_SERVER=true
  if [ "$START_WITH_RESTART" = true ]; then
    CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true "$SCRIPT_DIR/start.sh" --restart
  else
    CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true "$SCRIPT_DIR/start.sh"
  fi

  if ! wait_for_health 60; then
    echo "Dashboard did not become healthy on $API_BASE"
    echo "Logs: tail -f /tmp/dashboard.log"
    cleanup_started_processes
    exit 1
  fi
elif [ "$RUN_INTEGRATION" = true ] && [ "${CLAWMAX_TEST_REUSE_SERVER:-}" != "true" ]; then
  echo "Integration mode detected; restarting dashboard to test the current source tree."
  STARTED_SERVER=true
  CLAWMAX_SKIP_GATEWAY_BOOTSTRAP=true "$SCRIPT_DIR/start.sh" --restart
  if ! wait_for_health 60; then
    echo "Dashboard did not become healthy on $API_BASE after restart"
    echo "Logs: tail -f /tmp/dashboard.log"
    cleanup_started_processes
    exit 1
  fi
else
  echo "Dashboard is already healthy; running tests against existing server."
fi

TEST_STATUS=0
if [ "$RUN_COVERAGE" = true ]; then
  if [ "${#FORWARDED_ARGS[@]}" -gt 0 ]; then
    (
      cd "$ROOT_DIR/SYSTEM/dashboard" || exit 1
      rm -rf coverage
      npx c8 \
        --reporter=text-summary \
        --reporter=json-summary \
        --reporter=html \
        --report-dir coverage \
        bash ../test.sh "${FORWARDED_ARGS[@]}"
    ) || TEST_STATUS=$?
  else
    (
      cd "$ROOT_DIR/SYSTEM/dashboard" || exit 1
      rm -rf coverage
      npx c8 \
        --reporter=text-summary \
        --reporter=json-summary \
        --reporter=html \
        --report-dir coverage \
        bash ../test.sh
    ) || TEST_STATUS=$?
  fi
  print_coverage_summary || true
  print_perf_summary || true
else
  if [ "${#FORWARDED_ARGS[@]}" -gt 0 ]; then
    "$SCRIPT_DIR/test.sh" "${FORWARDED_ARGS[@]}" || TEST_STATUS=$?
  else
    "$SCRIPT_DIR/test.sh" || TEST_STATUS=$?
  fi
fi

if [ "$STARTED_SERVER" = true ]; then
  cleanup_started_processes
fi

exit "$TEST_STATUS"
