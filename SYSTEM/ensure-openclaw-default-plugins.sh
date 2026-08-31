#!/usr/bin/env bash

set -euo pipefail

OPENCLAW_COMMAND=${OPENCLAW_BIN:-openclaw}
OPENCLAW_PLUGIN_VERSION=${CLAWMAX_OPENCLAW_PLUGIN_VERSION:-}

if [ -z "$OPENCLAW_PLUGIN_VERSION" ]; then
  OPENCLAW_PLUGIN_VERSION="$("$OPENCLAW_COMMAND" --version 2>/dev/null | sed -n 's/.*\([0-9][0-9][0-9][0-9]\.[0-9][0-9]*\.[0-9][0-9]*\(-[0-9A-Za-z.-][0-9A-Za-z.-]*\)\{0,1\}\).*/\1/p' | head -n 1)"
fi

official_plugin_spec() {
  local plugin_id=$1
  if [ -n "$OPENCLAW_PLUGIN_VERSION" ]; then
    printf 'npm:@openclaw/%s@%s\n' "$plugin_id" "$OPENCLAW_PLUGIN_VERSION"
  else
    printf 'npm:@openclaw/%s\n' "$plugin_id"
  fi
}

ensure_plugin() {
  local plugin_id=$1
  local install_spec=$2

  if ! "$OPENCLAW_COMMAND" plugins inspect "$plugin_id" --json >/dev/null 2>&1; then
    "$OPENCLAW_COMMAND" plugins install "$install_spec"
  fi
  "$OPENCLAW_COMMAND" plugins enable "$plugin_id" >/dev/null
}

# Keep external channel plugins on the exact OpenClaw runtime version whenever
# the CLI exposes one, preventing setup and image builds from drifting across
# incompatible plugin APIs.
ensure_plugin whatsapp "$(official_plugin_spec whatsapp)"
ensure_plugin discord "$(official_plugin_spec discord)"
ensure_plugin slack "$(official_plugin_spec slack)"

echo "OpenClaw default plugins are ready."
