#!/bin/bash
# Start/reuse the local dashboard and preserve the existing test suite's flags.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
for arg in "$@"; do
  case "$arg" in
    --coverage|integration|--with-validation) ;;
    -h|--help)
      echo 'Usage: ./test.sh [--coverage] [integration] [--with-validation]'
      echo 'Default: local unit/contract/API suite; starts a dashboard if needed.'
      echo 'integration: real model calls (requires keys; may incur costs).'
      echo '--with-validation: opt in to tests that modify local data.'
      echo 'DASHBOARD_PORT, DASHBOARD_CLIENT_PORT, DASHBOARD_APP_URL are forwarded.'
      exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
exec "$ROOT_DIR/SYSTEM/test-with-server.sh" "$@"
