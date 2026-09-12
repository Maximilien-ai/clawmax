#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$script_dir/container-agent-lifecycle-smoke.sh"
assertions=0

bash -n "$smoke"
assertions=$((assertions + 1))

grep -Fq 'dashboard health endpoint did not become ready within 40 seconds' "$smoke"
assertions=$((assertions + 1))

grep -Fq 'gateway authenticated readiness verified' "$smoke"
grep -Fq 'gateway did not pass authenticated readiness within ${gateway_timeout} seconds' "$smoke"
assertions=$((assertions + 1))

if grep -Fq '[ -n "$gateway_ready_elapsed" ] || gateway_ready_elapsed="$elapsed"' "$smoke"; then
  echo 'Gateway readiness must not be inferred from Dashboard health.' >&2
  exit 1
fi
assertions=$((assertions + 1))

echo "container-agent-lifecycle-smoke.test.sh: ${assertions} assertions passed"
