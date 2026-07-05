#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
version_file="$repo_root/SYSTEM/openclaw-version.sh"
dockerfile="$repo_root/Dockerfile"
ci_workflow="$repo_root/.github/workflows/ci.yml"

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

helper_ref="$(sed -n 's/^export CLAWMAX_OPENCLAW_TARGET="${CLAWMAX_OPENCLAW_TARGET:-\(v[^"]*\)}"$/\1/p' "$version_file")"
[ -n "$helper_ref" ] || fail "expected openclaw-version.sh to export a default CLAWMAX_OPENCLAW_TARGET"

docker_ref="$(sed -n 's/^ARG OPENCLAW_GIT_REF=\(v.*\)$/\1/p' "$dockerfile")"
[ -n "$docker_ref" ] || fail "expected Dockerfile to declare ARG OPENCLAW_GIT_REF"

ci_ref="$(sed -n 's/^[[:space:]]*CLAWMAX_OPENCLAW_TARGET:[[:space:]]*\(v[^[:space:]]*\)$/\1/p' "$ci_workflow")"
[ -n "$ci_ref" ] || fail "expected CI workflow to export CLAWMAX_OPENCLAW_TARGET"

[ "$helper_ref" = "$docker_ref" ] || fail "expected Dockerfile OpenClaw ref ($docker_ref) to match helper ref ($helper_ref)"
[ "$helper_ref" = "$ci_ref" ] || fail "expected CI OpenClaw ref ($ci_ref) to match helper ref ($helper_ref)"

pass "OpenClaw target is aligned across helper, Dockerfile, and CI"
