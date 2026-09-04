#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
version_file="$repo_root/SYSTEM/openclaw-version.sh"
dockerfile="$repo_root/Dockerfile"
ci_workflow="$repo_root/.github/workflows/ci.yml"
test_wrapper="$repo_root/SYSTEM/test-with-server.sh"
test_suite="$repo_root/SYSTEM/test.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

[ -f "$version_file" ] || fail "expected SYSTEM/openclaw-version.sh to exist"
[ -f "$dockerfile" ] || fail "expected Dockerfile to exist"
[ -f "$ci_workflow" ] || fail "expected CI workflow to exist"
[ -f "$test_wrapper" ] || fail "expected dashboard test wrapper to exist"
[ -f "$test_suite" ] || fail "expected dashboard test suite to exist"

helper_ref="$(sed -n 's/^export CLAWMAX_OPENCLAW_TARGET="${CLAWMAX_OPENCLAW_TARGET:-\(v[^"]*\)}"$/\1/p' "$version_file")"
[ -n "$helper_ref" ] || fail "expected openclaw-version.sh to export a default CLAWMAX_OPENCLAW_TARGET"

docker_ref="$(sed -n 's/^ARG OPENCLAW_GIT_REF=\(v.*\)$/\1/p' "$dockerfile")"
[ -n "$docker_ref" ] || fail "expected Dockerfile to declare ARG OPENCLAW_GIT_REF"

ci_ref="$(sed -n 's/^[[:space:]]*CLAWMAX_OPENCLAW_TARGET:[[:space:]]*\(v[^[:space:]]*\)$/\1/p' "$ci_workflow")"
[ -n "$ci_ref" ] || fail "expected CI workflow to export CLAWMAX_OPENCLAW_TARGET"

[ "$helper_ref" = "$docker_ref" ] || fail "expected Dockerfile OpenClaw ref ($docker_ref) to match helper ref ($helper_ref)"
[ "$helper_ref" = "$ci_ref" ] || fail "expected CI OpenClaw ref ($ci_ref) to match helper ref ($helper_ref)"

grep -Fq '. "$SCRIPT_DIR/openclaw-version.sh"' "$test_wrapper" \
  || fail "expected integration wrapper to source the branch OpenClaw target"
grep -Fq 'prepare-openclaw-target.sh" --print-bin' "$test_wrapper" \
  || fail "expected integration wrapper to prepare the branch OpenClaw target"
grep -Fq 'Integration tests require OpenClaw' "$test_wrapper" \
  || fail "expected integration wrapper to reject a mismatched OpenClaw binary"
grep -Fq '"$OPENCLAW_BIN" gateway restart' "$test_wrapper" \
  || fail "expected integration wrapper to restart the targeted OpenClaw gateway"
grep -Fq 'Gateway version: $expected_version' "$test_wrapper" \
  || fail "expected integration wrapper to verify the targeted OpenClaw gateway version"
grep -Fq 'Connectivity probe: ok' "$test_wrapper" \
  || fail "expected integration wrapper to require a responsive targeted OpenClaw gateway"
grep -Fq 'Waiting for targeted OpenClaw gateway readiness' "$test_wrapper" \
  || fail "expected integration wrapper to tolerate bounded OpenClaw cold-start latency"
grep -Fq 'fail "Agent chat failed:' "$test_suite" \
  || fail "expected live agent chat failures to fail the gate"
grep -Fq 'fail "Agent chat returned diagnostics or an unexpected response:' "$test_suite" \
  || fail "expected the live chat gate to reject diagnostic output and unexpected replies"
grep -Fq 'fail "Kickoff did not complete in 120s' "$test_suite" \
  || fail "expected blocked workflow timeouts to fail the gate"

pass "OpenClaw target and live-gate contracts are aligned"
