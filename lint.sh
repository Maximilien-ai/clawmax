#!/bin/bash
# Correctness lint and server type-check; does not modify source files.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) echo 'Usage: ./lint.sh (ESLint, server TypeScript, root shell syntax)'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
fi
cd "$ROOT_DIR/SYSTEM/dashboard"
if [ ! -x node_modules/.bin/eslint ]; then
  echo 'Missing lint dependencies. Run: npm --prefix SYSTEM/dashboard ci' >&2
  exit 1
fi
npm run lint
./node_modules/.bin/tsc --noEmit -p tsconfig.server.json
node --test scripts/developer-commands.test.cjs
bash -n "$ROOT_DIR/lint.sh" "$ROOT_DIR/build.sh" "$ROOT_DIR/test.sh"
