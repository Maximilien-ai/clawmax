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
  'PRIVATE_DEV_PLUGIN_ROOT="$(cd "$REPO_ROOT/../clawmax-plugins/plugins"' \
  "local start must discover a sibling private plugin checkout"
require_text "$START_SCRIPT" \
  '"optimize:clawmax-optimize"' \
  "local start must include Optimize in the complete private product suite"
require_text "$START_SCRIPT" \
  'LOCAL_PLUGIN_PATHS="$(append_delimited_value "$LOCAL_PLUGIN_PATHS" "$plugin_path" ":")"' \
  "local start must merge every installed private product plugin path"
require_text "$START_SCRIPT" \
  'CLAWMAX_DISABLE_LOCAL_PRIVATE_PLUGINS' \
  "local startup must provide an explicit private-plugin opt-out"
require_text "$START_SCRIPT" \
  'if [ -z "$CLAWMAX_SKIP_GATEWAY_BOOTSTRAP" ] && openclaw_cli_available; then' \
  "test startup must skip the optional gateway control-UI lookup"
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

echo "start-local-plugins.test.sh: 9 tests passed"
