#!/bin/bash
# Bounded API requests for the local release harness. Never retry mutations:
# a timed-out request may already have committed on the server.
apicurl() {
  local timeout_seconds="${CLAWMAX_TEST_API_TIMEOUT_SECONDS:-60}"
  if ! [[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || [ "${#timeout_seconds}" -gt 3 ] || [ "$timeout_seconds" -gt 600 ]; then
    echo 'CLAWMAX_TEST_API_TIMEOUT_SECONDS must be an integer from 1 to 600' >&2
    return 2
  fi
  local args=(--silent --show-error --connect-timeout 5 --max-time "$timeout_seconds")
  if [ -n "${DASHBOARD_AUTH:-}" ]; then
    args+=(-H "Authorization: Bearer $DASHBOARD_AUTH")
  fi
  curl "${args[@]}" "$@"
}
