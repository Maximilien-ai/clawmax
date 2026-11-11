#!/usr/bin/env bash
set -euo pipefail
system_dir="$(cd "$(dirname "$0")" && pwd)"
. "$system_dir/openclaw-dev-runtime.sh"
for version in 24.16.0 24.19.0 26.1.0 26.12.1 27.0.0; do
  ensure_supported_source_node "$version" || { echo "FAIL: supported Node $version rejected"; exit 1; }
done
for version in 18.20.0 20.19.0 22.19.0 24.15.9 25.9.0 26.0.9 27.-1.0 24.16.-1 invalid; do
  if ensure_supported_source_node "$version" >/dev/null 2>&1; then echo "FAIL: unsupported Node $version admitted"; exit 1; fi
done
ensure_supported_source_node
echo 'PASS: shared source Node engine boundaries'
