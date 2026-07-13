#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/openclaw/dist" "$TMP_DIR/agent"
cat > "$TMP_DIR/openclaw/dist/store-fixture.js" <<'EOF'
import fs from 'node:fs'
// Bundle marker: saveAuthProfileStore as p
export function p(store, agentDir) {
  fs.writeFileSync(`${agentDir}/saved.json`, JSON.stringify(store))
}
EOF
printf '{"version":1,"profiles":{"openai:test":{"type":"api_key","provider":"openai","key":"fixture"}},"usageStats":{}}' \
  | OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-auth-store.mjs" "$TMP_DIR/agent"

grep -F '"openai:test"' "$TMP_DIR/agent/saved.json" >/dev/null
grep -F '"key":"fixture"' "$TMP_DIR/agent/saved.json" >/dev/null

echo "OpenClaw auth store bridge tests passed"
