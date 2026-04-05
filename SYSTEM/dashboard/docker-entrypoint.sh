#!/bin/sh
set -eu

export HOME="${HOME:-/app}"
export OPENCLAW_WORKSPACE="${OPENCLAW_WORKSPACE:-/app/WORKSPACES/default}"
export CLAWMAX_AUTO_START_GATEWAY="${CLAWMAX_AUTO_START_GATEWAY:-true}"

mkdir -p \
  "$HOME/.openclaw" \
  "$HOME/.openclaw/agents" \
  "$OPENCLAW_WORKSPACE" \
  "$OPENCLAW_WORKSPACE/AGENTS" \
  "$OPENCLAW_WORKSPACE/WORKFLOWS" \
  "$OPENCLAW_WORKSPACE/GROUPS" \
  "$OPENCLAW_WORKSPACE/COMMUNITIES" \
  "$OPENCLAW_WORKSPACE/ORG"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "[entrypoint] ERROR: openclaw CLI is missing from the runtime image" >&2
  exit 1
fi

echo "[entrypoint] openclaw: $(openclaw --version 2>/dev/null || echo unavailable)"

if ! openclaw config get gateway.mode >/dev/null 2>&1; then
  echo "[entrypoint] initializing openclaw gateway.mode=local"
  openclaw config set gateway.mode local >/dev/null 2>&1 || true
fi

if [ "$CLAWMAX_AUTO_START_GATEWAY" = "true" ]; then
  if openclaw gateway status >/dev/null 2>&1; then
    echo "[entrypoint] gateway already running"
  else
    echo "[entrypoint] attempting to start openclaw gateway"
    openclaw gateway restart >/tmp/openclaw-gateway.log 2>&1 || true
  fi
fi

exec "$@"
