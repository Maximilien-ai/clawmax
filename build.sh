#!/bin/bash
# Use the fail-fast npm build, without reinstalling or changing dependencies.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) echo 'Usage: ./build.sh (server TypeScript and production client bundle)'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
fi
cd "$ROOT_DIR/SYSTEM/dashboard"
if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vite ]; then
  echo 'Missing build dependencies. Run: npm --prefix SYSTEM/dashboard ci' >&2
  exit 1
fi
exec npm run build
