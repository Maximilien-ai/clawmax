#!/bin/bash

clawmax_test_lock_dir() {
  local backend_port="$1"
  printf '%s/clawmax-test-with-server-%s.lock' "${CLAWMAX_TEST_LOCK_ROOT:-${TMPDIR:-/tmp}}" "$backend_port"
}

acquire_clawmax_test_lock() {
  local backend_port="$1"
  local frontend_port="$2"
  local lock_dir
  lock_dir="$(clawmax_test_lock_dir "$backend_port")"

  if ! mkdir "$lock_dir" 2>/dev/null; then
    local owner_pid=""
    if [ -f "$lock_dir/pid" ]; then
      owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
    fi

    if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null; then
      echo "Another dashboard test run owns backend port $backend_port (PID $owner_pid)."
      echo "Wait for it to finish or use different DASHBOARD_PORT and DASHBOARD_CLIENT_PORT values."
      return 1
    fi

    rm -rf "$lock_dir"
    if ! mkdir "$lock_dir" 2>/dev/null; then
      echo "Could not acquire dashboard test lock at $lock_dir."
      return 1
    fi
    echo "Recovered stale dashboard test lock for backend port $backend_port."
  fi

  printf '%s\n' "$$" > "$lock_dir/pid"
  printf '%s\n' "$backend_port" > "$lock_dir/backend-port"
  printf '%s\n' "$frontend_port" > "$lock_dir/frontend-port"
  CLAWMAX_ACTIVE_TEST_LOCK_DIR="$lock_dir"
  export CLAWMAX_ACTIVE_TEST_LOCK_DIR
}

release_clawmax_test_lock() {
  local lock_dir="${CLAWMAX_ACTIVE_TEST_LOCK_DIR:-}"
  [ -n "$lock_dir" ] || return 0
  [ -d "$lock_dir" ] || return 0

  local owner_pid=""
  if [ -f "$lock_dir/pid" ]; then
    owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  fi
  if [ "$owner_pid" = "$$" ]; then
    rm -rf "$lock_dir"
  fi
  CLAWMAX_ACTIVE_TEST_LOCK_DIR=""
  export CLAWMAX_ACTIVE_TEST_LOCK_DIR
}
