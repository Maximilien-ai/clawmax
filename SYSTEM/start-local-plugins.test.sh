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
  'PUBLIC_DEV_PLUGIN_IDS="clawmax-lifecycle,plugin-review-notes"' \
  "local start must always enable the public product plugins"
require_text "$START_SCRIPT" \
  'PRIVATE_DEV_PLUGIN_ROOT="$REPO_ROOT/../clawmax-plugins/plugins"' \
  "local start must discover a sibling private plugin checkout"
require_text "$START_SCRIPT" \
  'LOCAL_DEV_PLUGIN_IDS="clawmax-evals-plugin,clawmax-guardrails-plugin,clawmax-optimize,$PUBLIC_DEV_PLUGIN_IDS"' \
  "local start must enable every product plugin when the private checkout is available"
require_text "$START_SCRIPT" \
  'export CLAWMAX_PLUGIN_PATHS="$PRIVATE_DEV_PLUGIN_ROOT/evals:$PRIVATE_DEV_PLUGIN_ROOT/guardrails:$PRIVATE_DEV_PLUGIN_ROOT/optimize"' \
  "local start must mount all private product plugin paths"
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

echo "start-local-plugins.test.sh: 8 tests passed"
