#!/usr/bin/env bash
# The live fixture belongs to the server, not to unit tests' private fixtures.
clawmax_enter_unit_environment() {
  if [ "${CLAWMAX_UNIT_ENV_ACTIVE:-}" = true ]; then
    echo 'Unit environment is already active' >&2
    return 1
  fi
  CLAWMAX_UNIT_ENV_ACTIVE=true
  CLAWMAX_UNIT_ENV_KEYS=(CLAWMAX_TEST_WORKSPACE CLAWMAX_WORKSPACE_REGISTRY_PATH OPENCLAW_CONFIG_PATH OPENCLAW_STATE_DIR OPENCLAW_GATEWAY_TOKEN OPENCLAW_GATEWAY_PORT HOME OPENCLAW_WORKSPACE)
  CLAWMAX_UNIT_ENV_VALUES=()
  CLAWMAX_UNIT_ENV_PRESENT=()
  local key
  for key in "${CLAWMAX_UNIT_ENV_KEYS[@]}"; do
    if declare -p "$key" >/dev/null 2>&1; then
      CLAWMAX_UNIT_ENV_PRESENT+=(1)
      CLAWMAX_UNIT_ENV_VALUES+=("${!key}")
    else
      CLAWMAX_UNIT_ENV_PRESENT+=(0)
      CLAWMAX_UNIT_ENV_VALUES+=("")
    fi
    unset "$key"
  done
  local fixture_base="${TMPDIR:-/tmp}"
  if ! CLAWMAX_UNIT_FIXTURE_ROOT="$(mktemp -d "${fixture_base%/}/clawmax-unit-home.XXXXXX")"; then
    clawmax_leave_unit_environment
    return 1
  fi
  if ! mkdir -p "$CLAWMAX_UNIT_FIXTURE_ROOT/workspace"; then
    clawmax_leave_unit_environment
    return 1
  fi
  # Defaults must resolve to unit-owned state, never the caller's registry or
  # the live integration workspace. Restore the caller environment on exit.
  export HOME="$CLAWMAX_UNIT_FIXTURE_ROOT"
  export OPENCLAW_WORKSPACE="$CLAWMAX_UNIT_FIXTURE_ROOT/workspace"
}

clawmax_leave_unit_environment() {
  [ "${CLAWMAX_UNIT_ENV_ACTIVE:-}" = true ] || return 0
  local fixture_root="${CLAWMAX_UNIT_FIXTURE_ROOT:-}"
  local index key
  for index in "${!CLAWMAX_UNIT_ENV_KEYS[@]}"; do
    key="${CLAWMAX_UNIT_ENV_KEYS[$index]}"
    if [ "${CLAWMAX_UNIT_ENV_PRESENT[$index]}" = 1 ]; then
      export "$key=${CLAWMAX_UNIT_ENV_VALUES[$index]}"
    else
      unset "$key"
    fi
  done
  unset CLAWMAX_UNIT_ENV_KEYS CLAWMAX_UNIT_ENV_VALUES CLAWMAX_UNIT_ENV_PRESENT
  unset CLAWMAX_UNIT_ENV_ACTIVE CLAWMAX_UNIT_FIXTURE_ROOT
  if [ -n "$fixture_root" ]; then rm -rf -- "$fixture_root"; fi
}
