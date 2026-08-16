#!/bin/bash

set -u

SYSTEM_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_ROOT="$(mktemp -d /tmp/clawmax-test-run-lock-XXXXXX)"
export CLAWMAX_TEST_LOCK_ROOT="$TEST_ROOT"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

. "$SYSTEM_DIR/test-run-lock.sh"

passed=0

assert() {
  local description="$1"
  shift
  if "$@"; then
    echo "PASS: $description"
    passed=$((passed + 1))
  else
    echo "FAIL: $description"
    exit 1
  fi
}

acquire_clawmax_test_lock 3991 5991 >/dev/null
lock_dir="$(clawmax_test_lock_dir 3991)"
assert "lock records the owner PID" test "$(cat "$lock_dir/pid")" = "$$"
release_clawmax_test_lock
assert "owner releases its lock" test ! -d "$lock_dir"

mkdir -p "$lock_dir"
printf '%s\n' "999999" > "$lock_dir/pid"
stale_output="$(acquire_clawmax_test_lock 3991 5991)"
assert "stale locks are recovered" test -d "$lock_dir"
assert "stale recovery is explained" grep -q "Recovered stale dashboard test lock" <<< "$stale_output"
release_clawmax_test_lock

bash -c '
  . "$1/test-run-lock.sh"
  export CLAWMAX_TEST_LOCK_ROOT="$2"
  acquire_clawmax_test_lock 3992 5992 >/dev/null
  sleep 10
' bash "$SYSTEM_DIR" "$TEST_ROOT" &
holder_pid=$!
active_lock="$(clawmax_test_lock_dir 3992)"
for _ in 1 2 3 4 5; do
  [ -f "$active_lock/pid" ] && break
  sleep 1
done

set +e
active_output="$(acquire_clawmax_test_lock 3992 5992 2>&1)"
active_status=$?
set -e
assert "active concurrent locks are rejected" test "$active_status" -ne 0
assert "active rejection identifies the owning run" grep -q "Another dashboard test run owns backend port 3992" <<< "$active_output"

CLAWMAX_ACTIVE_TEST_LOCK_DIR="$active_lock"
release_clawmax_test_lock
assert "non-owner cleanup preserves the active lock" test -d "$active_lock"
kill "$holder_pid" >/dev/null 2>&1 || true
wait "$holder_pid" >/dev/null 2>&1 || true
rm -rf "$active_lock"

health_definition_line="$(grep -n '^require_dashboard_health()' "$SYSTEM_DIR/test.sh" | cut -d: -f1)"
health_gate_line="$(grep -n '^if ! require_dashboard_health; then' "$SYSTEM_DIR/test.sh" | cut -d: -f1)"
api_section_line="$(grep -n '^# Section 1: Health & System APIs' "$SYSTEM_DIR/test.sh" | cut -d: -f1)"
assert "live API health helper is defined" test -n "$health_definition_line"
assert "health gate runs before live API sections" test "$health_gate_line" -lt "$api_section_line"

assert "skills validation uses the active runtime catalog" \
  grep -Fq 'valid_test_skills=$(apicurl "$API_BASE/api/skills"' "$SYSTEM_DIR/test.sh"
assert "skills validation does not require a fixed product catalog" \
  bash -c '! grep -Fq '\''{"skills":["github","slack","notion"]}'\'' "$1/test.sh"' bash "$SYSTEM_DIR"
assert "workflow detail checks URL-encode runtime workflow IDs" \
  grep -Fq 'first_workflow_path_id=$(jq -rn --arg value "$first_workflow_id"' "$SYSTEM_DIR/test.sh"
assert "workflow path encoding uses jq URI escaping" \
  grep -Fq '@uri' "$SYSTEM_DIR/test.sh"

echo "test-run-lock.test.sh: $passed tests passed"
