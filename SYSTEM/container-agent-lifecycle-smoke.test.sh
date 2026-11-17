#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
smoke="$script_dir/container-agent-lifecycle-smoke.sh"
acceptance_workflow="$script_dir/../.github/workflows/container-image-lifecycle-acceptance.yml"
image_workflow="$script_dir/../.github/workflows/test-container-image.yml"
assertions=0

bash -n "$smoke"
test -x "$script_dir/dashboard/docker-entrypoint.sh"
assertions=$((assertions + 1))

grep -Fq 'local health_timeout="${1:-40}"' "$smoke"
grep -Fq 'dashboard health endpoint did not become ready within ${health_timeout} seconds' "$smoke"
grep -Fq '"$container_cli" stop --time 30 "$container_name"' "$smoke"
grep -Fq 'Graceful-stop exit={{.State.ExitCode}}' "$smoke"
grep -Fq '"$container_name:/tmp/openclaw-gateway.log"' "$smoke"
grep -Fq 'start_dashboard 360' "$smoke"
grep -Fq 'report_gateway_lease before_forced_replacement' "$smoke"
grep -Fq 'report_gateway_lease after_forced_replacement' "$smoke"
grep -Fq 'report_gateway_lease failure' "$smoke"
grep -Fq 'Lifecycle failure state running=' "$smoke"
grep -Fq 'Gateway failure log (last 60 lines):' "$smoke"
grep -Fq 'readOnly: true' "$smoke"
grep -Fq 'CLAWMAX_LIFECYCLE_SOURCE_ENTRYPOINT:-false' "$smoke"
grep -Fq 'target=/app/SYSTEM/dashboard/docker-entrypoint.sh,readonly' "$smoke"
grep -Fq 'Diagnostic only - mount source entrypoint' "$acceptance_workflow"
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

# Execute the real scheduler assertions against missing/duplicate/legacy fixtures.
python3 - "$smoke" <<'PYTEST'
import pathlib, subprocess, sys
source = pathlib.Path(sys.argv[1]).read_text()
start = source.index('  # Dashboard owns scheduling;')
end = source.index('\n  "$container_cli" exec "$container_name" test -s', start)
checks = source[start:end]
morning = '[Scheduler] Scheduled rc65-morning: 30 9 * * * (UTC)'
two_hour = '[Scheduler] Scheduled rc65-two-hour: 0 */2 * * * (UTC)'
cases = [
    ('local schedules', [morning, two_hour], '[]', True),
    ('missing morning', [two_hour], '[]', False),
    ('duplicate morning', [morning, morning, two_hour], '[]', False),
    ('missing two-hour', [morning], '[]', False),
    ('duplicate two-hour', [morning, two_hour, two_hour], '[]', False),
    ('legacy gateway job', [morning, two_hour], '[{"name":"clawmax-rc65-morning-rc-image-reuse-probe"}]', False),
    ('invalid canary', [morning, two_hour, '[Scheduler] Scheduled rc65-invalid-canary: invalid'], '[]', False),
]
import os
for name, logs, jobs, expected in cases:
    env = dict(os.environ, FIXTURE_LOGS='\n'.join(logs), FIXTURE_JOBS='{"jobs":' + jobs + '}')
    harness = 'set -euo pipefail\nfail() { exit 1; }\nfixture_cli() { printf "%s\\n" "$FIXTURE_LOGS"; }\ncontainer_cli=fixture_cli\ncontainer_name=fixture\ncron_jobs="$FIXTURE_JOBS"\n'
    result = subprocess.run(['bash', '-c', harness + checks], env=env, capture_output=True)
    assert (result.returncode == 0) == expected, (name, result.stderr.decode())
print('Scheduler lifecycle assertions: 7 behavior cases passed')
PYTEST

echo "container-agent-lifecycle-smoke.test.sh: ${assertions} assertions passed"
