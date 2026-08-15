#!/usr/bin/env bash

set -euo pipefail

OPENCLAW_COMMAND=${OPENCLAW_BIN:-openclaw}

ensure_plugin() {
  local plugin_id=$1
  local install_spec=$2

  if ! "$OPENCLAW_COMMAND" plugins inspect "$plugin_id" --json >/dev/null 2>&1; then
    "$OPENCLAW_COMMAND" plugins install "$install_spec"
  fi
  "$OPENCLAW_COMMAND" plugins enable "$plugin_id" >/dev/null
}

# Use the npm fallback without an exact version so OpenClaw selects the newest
# official release compatible with the branch-pinned plugin API.
ensure_plugin whatsapp npm:@openclaw/whatsapp

echo "OpenClaw default plugins are ready."
