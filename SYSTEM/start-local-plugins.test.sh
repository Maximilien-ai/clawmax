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
  'LOCAL_DEV_PLUGIN_ROOTS="${CLAWMAX_DEV_PLUGIN_ROOTS:-$(read_dotenv_var CLAWMAX_DEV_PLUGIN_ROOTS)}"' \
  "local start must accept explicit generic development plugin roots"
require_text "$START_SCRIPT" \
  'process.stdout.write(String(manifest.id || manifest.slug || "").trim())' \
  "local start must obtain external plugin identity from its manifest"
require_text "$START_SCRIPT" \
  'LOCAL_PLUGIN_PATHS="$(append_delimited_value "$LOCAL_PLUGIN_PATHS" "$plugin_path" ":")"' \
  "local start must merge every explicitly discovered external plugin path"
if grep -Eq 'clawmax-plugins|clawmax-evals-plugin|clawmax-guardrails-plugin|clawmax-optimize' "$START_SCRIPT"; then
  echo "FAIL: public local startup must not name private repositories or product plugins"
  exit 1
fi
echo "PASS: public local startup has no private repository or product identities"
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
