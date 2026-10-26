#!/usr/bin/env bash
# Separate source snapshot, HOME, workspace and foreground Gateway.
set -euo pipefail
system_dir="$(cd "$(dirname "$0")" && pwd)"
exec node "$system_dir/local-dev.mjs" "$@"
