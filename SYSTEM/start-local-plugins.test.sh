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
  'if [ -z "${CLAWMAX_ENABLED_PLUGINS+x}" ] && ! dotenv_defines_nonempty "CLAWMAX_ENABLED_PLUGINS"; then' \
  "local defaults must not override shell or ignored .env plugin selections"
require_text "$START_SCRIPT" \
  'dotenv_defines_nonempty()' \
  "local startup must recognize non-empty ignored .env values"
if grep -Fq 'export CLAWMAX_PLUGIN_PATHS=""' "$START_SCRIPT"; then
  echo "FAIL: local startup must not mask external plugin paths loaded from .env"
  exit 1
fi
require_text "$DOCKERFILE" \
  'ARG CLAWMAX_ENABLED_PLUGINS=' \
  "production image plugin enablement must remain empty by default"

echo "start-local-plugins.test.sh: 5 tests passed"
