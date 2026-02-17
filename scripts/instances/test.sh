#!/usr/bin/env bash
# test.sh — Smoke tests for setup.sh and its lib helpers.
#
# Usage:
#   ./scripts/instances/test.sh          # run all tests
#   ./scripts/instances/test.sh -v       # verbose (show output of each test)
#
# Exit code: 0 if all tests pass, 1 if any fail.

set -uo pipefail
# Note: no `set -e` — test functions must handle non-zero exits themselves

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup.sh"
LIB_DIR="$SCRIPT_DIR/lib"

# ---------------------------------------------------------------------------
# Minimal test framework
# ---------------------------------------------------------------------------
PASS=0; FAIL=0; VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[0;33m"; RESET="\033[0m"

pass() { PASS=$((PASS+1)); printf "${GREEN}PASS${RESET}  %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); printf "${RED}FAIL${RESET}  %s\n" "$1"; [ "$VERBOSE" = "1" ] && printf "       %s\n" "$2"; }

# assert_exit <expected_code> <description> <command...>
assert_exit() {
  local expected="$1" desc="$2"; shift 2
  local actual rc
  actual=$("$@" 2>&1) && rc=$? || rc=$?
  if [ "$rc" = "$expected" ]; then
    pass "$desc"
  else
    fail "$desc" "expected exit $expected, got $rc — output: ${actual:0:200}"
  fi
}

# assert_output_contains <pattern> <description> <command...>
assert_output_contains() {
  local pattern="$1" desc="$2"; shift 2
  local out
  out=$("$@" 2>&1) && true || true
  if echo "$out" | grep -q "$pattern"; then
    pass "$desc"
  else
    fail "$desc" "expected pattern '$pattern' in: ${out:0:300}"
  fi
}

# assert_output_not_contains <pattern> <description> <command...>
assert_output_not_contains() {
  local pattern="$1" desc="$2"; shift 2
  local out
  out=$("$@" 2>&1) && true || true
  if echo "$out" | grep -q "$pattern"; then
    fail "$desc" "unexpected pattern '$pattern' found in: ${out:0:300}"
  else
    pass "$desc"
  fi
}

# ---------------------------------------------------------------------------
# Source lib helpers (for unit tests)
# ---------------------------------------------------------------------------
# shellcheck source=lib/colors.sh
source "$LIB_DIR/colors.sh"
# shellcheck source=lib/detect.sh
source "$LIB_DIR/detect.sh"

# ---------------------------------------------------------------------------
# Tests: argument validation
# ---------------------------------------------------------------------------
printf "\n${YELLOW}=== Argument validation ===${RESET}\n"

assert_exit 0      "--help exits 0"              "$SETUP" --help
assert_output_contains "Usage" "--help prints usage"   "$SETUP" --help
assert_exit 0      "-h exits 0"                  "$SETUP" -h
assert_output_contains "Usage" "no args shows usage"       "$SETUP"

# Invalid instance names
assert_exit 1      "numeric-only name rejected"   "$SETUP" 123 --dry-run
assert_exit 1      "name with space rejected"     "$SETUP" "my instance" --dry-run
assert_exit 1      "name starting with digit rejected" "$SETUP" 1max --dry-run
assert_exit 1      "unknown option rejected"      "$SETUP" max1 --unknown-flag --dry-run

# Valid names
assert_exit 0      "simple name accepted (dry-run)" "$SETUP" max1 --dry-run --no-gateway --no-aliases --no-desktop
assert_exit 0      "name with dash accepted"       "$SETUP" max-prod --dry-run --no-gateway --no-aliases --no-desktop
assert_exit 0      "name with underscore accepted" "$SETUP" max_a --dry-run --no-gateway --no-aliases --no-desktop

# ---------------------------------------------------------------------------
# Tests: dry-run output content
# ---------------------------------------------------------------------------
printf "\n${YELLOW}=== Dry-run output ===${RESET}\n"

assert_output_contains "DRY RUN"          "dry-run banner shown"        "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_contains "max1"             "instance name in output"     "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_contains "openai/gpt-4o"   "default model shown"         "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_contains "1/7"             "step 1 shown"                "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_contains "7/7"             "step 7 shown"                "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_contains "Done"            "done message shown"          "$SETUP" max1 --dry-run --no-gateway --no-aliases

# Custom model
assert_output_contains "claude-3-5-sonnet" "custom model passed through" \
  "$SETUP" max1 --dry-run --no-gateway --no-aliases --model claude-3-5-sonnet

# WhatsApp flag
assert_output_contains "14085551234" "whatsapp number shown" \
  "$SETUP" max1 --dry-run --no-gateway --no-aliases --whatsapp +14085551234

# --no-gateway: dry-run with gateway shows "Would install", without shows "Skipping"
assert_output_contains "Skipping gateway"    "--no-gateway skips gateway"       "$SETUP" max1 --dry-run --no-gateway --no-aliases
assert_output_not_contains "Would install gateway" "--no-gateway suppresses install" "$SETUP" max1 --dry-run --no-gateway --no-aliases

# --profile mode
assert_output_contains "same-machine"      "--profile shows profile mode" "$SETUP" max1 --dry-run --no-gateway --no-aliases --profile
assert_output_contains "openclaw-max1"     "--profile uses named state dir" "$SETUP" max1 --dry-run --no-gateway --no-aliases --profile

# Custom port
assert_output_contains "19000"             "--port sets gateway port"    "$SETUP" max1 --dry-run --no-gateway --no-aliases --port 19000

# Desktop shortcut in dry-run
assert_output_contains "Desktop/max1"      "desktop shortcut path shown" "$SETUP" max1 --dry-run --no-gateway --no-aliases

# ---------------------------------------------------------------------------
# Tests: detect.sh unit tests
# ---------------------------------------------------------------------------
printf "\n${YELLOW}=== detect.sh unit tests ===${RESET}\n"

# detect_os
os=$(detect_os)
assert_output_contains "macos\|linux\|unknown" "detect_os returns known value" echo "$os"

# detect_node_version
if command -v node >/dev/null 2>&1; then
  ver=$(detect_node_version 2>/dev/null || true)
  if [ -n "$ver" ] && [ "$ver" -ge 1 ] 2>/dev/null; then
    pass "detect_node_version returns a number (v$ver)"
  else
    fail "detect_node_version" "got: '$ver'"
  fi
else
  printf "  ${YELLOW}SKIP${RESET}  detect_node_version (node not found)\n"
fi

# find_free_port
port=$(find_free_port 19700)
if [ "$port" -ge 19700 ] 2>/dev/null; then
  pass "find_free_port returns port >= start ($port)"
else
  fail "find_free_port" "got: '$port'"
fi

# openclaw_state_dir — profile_mode=0
dir0=$(openclaw_state_dir "testinst" 0)
if echo "$dir0" | grep -q "\.openclaw$"; then
  pass "openclaw_state_dir mode=0 returns ~/.openclaw"
else
  fail "openclaw_state_dir mode=0" "got: $dir0"
fi

# openclaw_state_dir — profile_mode=1
dir1=$(openclaw_state_dir "testinst" 1)
if echo "$dir1" | grep -q "\.openclaw-testinst$"; then
  pass "openclaw_state_dir mode=1 returns ~/.openclaw-testinst"
else
  fail "openclaw_state_dir mode=1" "got: $dir1"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n${YELLOW}=== Results ===${RESET}\n"
TOTAL=$((PASS + FAIL))
printf "  Passed : ${GREEN}%d${RESET} / %d\n" "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf "  Failed : ${RED}%d${RESET}\n" "$FAIL"
  exit 1
else
  printf "  ${GREEN}All tests passed!${RESET}\n"
fi
