#!/bin/sh

resolve_openclaw_cli() {
  if [ -n "${OPENCLAW_BIN:-}" ] && [ -x "${OPENCLAW_BIN}" ]; then
    printf '%s\n' "${OPENCLAW_BIN}"
    return 0
  fi

  if command -v openclaw >/dev/null 2>&1; then
    command -v openclaw
    return 0
  fi

  return 1
}

openclaw_cli_available() {
  resolve_openclaw_cli >/dev/null 2>&1
}

openclaw_cli_run() {
  cli="$(resolve_openclaw_cli)" || return 127
  "$cli" "$@"
}
