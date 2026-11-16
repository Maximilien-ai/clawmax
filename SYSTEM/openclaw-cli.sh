#!/bin/sh

resolve_openclaw_cli() {
  if [ -n "${OPENCLAW_BIN:-}" ] && [ -x "${OPENCLAW_BIN}" ]; then
    printf '%s\n' "${OPENCLAW_BIN}"
    return 0
  fi

  # Source callers load the branch target before resolving. Reuse only a
  # completed preparation; this path never downloads or rebuilds a runtime.
  if [ -n "${CLAWMAX_OPENCLAW_TARGET:-}" ]; then
    clawmax_cli_target="$(printf '%s' "$CLAWMAX_OPENCLAW_TARGET" | tr '/:@' '---')"
    clawmax_cli_cache="${CLAWMAX_OPENCLAW_CACHE_DIR:-${TMPDIR:-/tmp}/clawmax-openclaw-targets}/${clawmax_cli_target}"
    if [ -f "$clawmax_cli_cache/.prepared-commit" ] && [ -x "$clawmax_cli_cache/bin/openclaw" ]; then
      printf '%s\n' "$clawmax_cli_cache/bin/openclaw"
      return 0
    fi
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
