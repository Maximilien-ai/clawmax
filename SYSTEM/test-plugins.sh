#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
DASHBOARD_ROOT="$ROOT_DIR/SYSTEM/dashboard"

usage() {
  echo "Usage: ./SYSTEM/test-plugins.sh --plugins <external-plugin-repository>" >&2
}

if [ "$#" -ne 2 ] || [ "$1" != "--plugins" ]; then
  usage
  exit 2
fi

if [ ! -d "$2" ]; then
  echo "External plugin repository not found: $2" >&2
  exit 2
fi

PLUGIN_REPOSITORY="$(cd "$2" && pwd -P)"
if [ "$PLUGIN_REPOSITORY" = "$ROOT_DIR" ]; then
  echo "--plugins must identify a separate external plugin repository" >&2
  exit 2
fi

PLUGIN_PACKAGE="$PLUGIN_REPOSITORY/package.json"
if [ ! -f "$PLUGIN_PACKAGE" ]; then
  echo "External plugin repository must contain package.json: $PLUGIN_REPOSITORY" >&2
  exit 2
fi

if ! node -e '
  const pkg = require(process.argv[1])
  if (!pkg?.scripts?.["test:clawmax-host"]) process.exit(1)
' "$PLUGIN_PACKAGE"; then
  echo "External plugin repository must declare the test:clawmax-host script" >&2
  exit 2
fi

if [ "${CLAWMAX_PLUGIN_TEST_SKIP_BUILD:-}" != "true" ]; then
  echo "Building the generic Dashboard host contract..."
  (
    cd "$DASHBOARD_ROOT"
    npx tsc -p tsconfig.server.json
  )
fi

echo "Running external plugin acceptance from $PLUGIN_REPOSITORY"
CLAWMAX_DASHBOARD_ROOT="$DASHBOARD_ROOT" npm --prefix "$PLUGIN_REPOSITORY" run test:clawmax-host
