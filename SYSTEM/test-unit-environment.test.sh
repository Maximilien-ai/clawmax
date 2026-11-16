#!/usr/bin/env bash
set -eu
. "$(dirname "$0")/test-unit-environment.sh"
export CLAWMAX_TEST_WORKSPACE='/test/live workspace'
export CLAWMAX_WORKSPACE_REGISTRY_PATH='/test/registry.json'
export OPENCLAW_CONFIG_PATH='/test/config.json'
export OPENCLAW_STATE_DIR='/test/state'
export OPENCLAW_GATEWAY_TOKEN='synthetic-token'
export OPENCLAW_GATEWAY_PORT='54321'
export OPENCLAW_PACKAGE_ROOT='/test/pinned-runtime'
previous_unit_test_home="${HOME-}"
previous_unit_test_home_present="${HOME+x}"
export OPENCLAW_WORKSPACE='/test/live workspace root'
clawmax_enter_unit_environment
unit_fixture_home="$HOME"
[ "$HOME" != "$previous_unit_test_home" ]
[ -d "$HOME/workspace" ]
[ "$OPENCLAW_WORKSPACE" = "$HOME/workspace" ]
if clawmax_enter_unit_environment >/dev/null 2>&1; then exit 1; fi
for key in CLAWMAX_TEST_WORKSPACE CLAWMAX_WORKSPACE_REGISTRY_PATH OPENCLAW_CONFIG_PATH OPENCLAW_STATE_DIR OPENCLAW_GATEWAY_TOKEN OPENCLAW_GATEWAY_PORT; do
  if declare -p "$key" >/dev/null 2>&1; then exit 1; fi
done
[ "$OPENCLAW_PACKAGE_ROOT" = '/test/pinned-runtime' ]
clawmax_leave_unit_environment
[ ! -d "$unit_fixture_home" ]
[ "${HOME+x}" = "$previous_unit_test_home_present" ]
[ "${HOME-}" = "$previous_unit_test_home" ]
[ "$OPENCLAW_WORKSPACE" = '/test/live workspace root' ]
[ "$CLAWMAX_TEST_WORKSPACE" = '/test/live workspace' ]
[ "$OPENCLAW_GATEWAY_TOKEN" = synthetic-token ]
[ "$OPENCLAW_GATEWAY_PORT" = 54321 ]
unset OPENCLAW_GATEWAY_TOKEN
export OPENCLAW_GATEWAY_PORT=''
clawmax_enter_unit_environment
clawmax_leave_unit_environment
[ -z "${OPENCLAW_GATEWAY_TOKEN+x}" ]
[ "${OPENCLAW_GATEWAY_PORT+x}" = x ]
[ -z "$OPENCLAW_GATEWAY_PORT" ]
mktemp() { return 1; }
if clawmax_enter_unit_environment; then exit 1; fi
unset -f mktemp
[ "${HOME-}" = "$previous_unit_test_home" ]
[ "$OPENCLAW_WORKSPACE" = '/test/live workspace root' ]
[ -z "${CLAWMAX_UNIT_ENV_ACTIVE+x}" ]
echo 'Unit/live environment separation tests passed'
