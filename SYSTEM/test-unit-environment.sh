#!/usr/bin/env bash
# The live fixture belongs to the server, not to unit tests' private fixtures.
clawmax_enter_unit_environment() {
  CLAWMAX_UNIT_ENV_KEYS=(CLAWMAX_TEST_WORKSPACE CLAWMAX_WORKSPACE_REGISTRY_PATH OPENCLAW_CONFIG_PATH OPENCLAW_STATE_DIR OPENCLAW_GATEWAY_TOKEN OPENCLAW_GATEWAY_PORT)
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
}

clawmax_leave_unit_environment() {
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
}
