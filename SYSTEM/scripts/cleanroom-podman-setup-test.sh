#!/usr/bin/env bash
# Compatibility entrypoint for source install testing with the current Node CLI.
set -euo pipefail
system_dir="$(cd "$(dirname "$0")/.." && pwd)"
export CLAWMAX_TEST_CONTAINER="${CLAWMAX_TEST_CONTAINER:-${CLEANROOM_PODMAN_CONTAINER_NAME:-clawmax-test}}"
export CLAWMAX_TEST_API_PORT="${CLAWMAX_TEST_API_PORT:-${CLEANROOM_DASHBOARD_PORT:-3008}}"
export CLAWMAX_TEST_UI_PORT="${CLAWMAX_TEST_UI_PORT:-${CLEANROOM_DASHBOARD_CLIENT_PORT:-5181}}"
exec "$system_dir/test-clean-install.sh" "$@"
