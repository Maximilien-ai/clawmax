#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$script_dir/container-agent-lifecycle-smoke.sh"
acceptance_workflow="$script_dir/../.github/workflows/container-image-lifecycle-acceptance.yml"
image_workflow="$script_dir/../.github/workflows/test-container-image.yml"
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

grep -Fq 'SELECT 1 FROM session_nodes LIMIT 1' "$smoke"
grep -Fq 'recreated agent native session state is missing' "$smoke"
assertions=$((assertions + 1))

grep -Fq 'recreated agent legacy session state is missing' "$smoke"
assertions=$((assertions + 1))

grep -Fq 'runner: ubuntu-24.04' "$acceptance_workflow"
grep -Fq 'runner: ubuntu-24.04-arm' "$acceptance_workflow"
grep -Fq 'runs-on: ${{ matrix.runner }}' "$acceptance_workflow"
assertions=$((assertions + 1))

grep -Fq 'container-image-lifecycle-acceptance.yml' "$image_workflow"
if grep -Fq 'for arch in amd64 arm64' "$image_workflow"; then
  echo 'Lifecycle acceptance must not measure ARM64 startup through x86 QEMU.' >&2
  exit 1
fi
assertions=$((assertions + 1))

echo "container-agent-lifecycle-smoke.test.sh: ${assertions} assertions passed"
