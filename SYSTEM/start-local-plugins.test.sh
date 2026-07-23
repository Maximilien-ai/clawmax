#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
START_SCRIPT="$ROOT_DIR/SYSTEM/start.sh"
DOCKERFILE="$ROOT_DIR/Dockerfile"

require_text() {
  local file="$1"
  local expected="$2"
  local message="$3"
  if ! grep -Fq "$expected" "$file"; then
    echo "FAIL: $message"
    exit 1
  fi
}

require_text "$START_SCRIPT" \
  'LOCAL_DEV_PLUGIN_IDS="plugin-lab-guardrails,plugin-lab-evals,plugin-lab-review-notes,clawmax-optimize"' \
  "local start must enable the complete first-party test plugin set"
require_text "$START_SCRIPT" \
  'if [ -z "${CLAWMAX_ENABLED_PLUGINS+x}" ]; then' \
  "local defaults must not override explicitly enabled plugins"
require_text "$START_SCRIPT" \
  'if [ -z "${CLAWMAX_PLUGIN_PATHS+x}" ]; then' \
  "local defaults must not override explicit external plugin paths"
require_text "$DOCKERFILE" \
  'ARG CLAWMAX_ENABLED_PLUGINS=' \
  "production image plugin enablement must remain empty by default"

echo "start-local-plugins.test.sh: 4 tests passed"
