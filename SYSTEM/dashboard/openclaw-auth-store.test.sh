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
  fs.writeFileSync(`${agentDir}/openclaw-agent.sqlite`, 'fixture')
}
EOF
legacy_write_result="$(printf '{"version":1,"profiles":{"openai:test":{"type":"api_key","provider":"openai","key":"fixture"}},"usageStats":{}}' \
  | OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-auth-store.mjs" "$TMP_DIR/agent")"

grep -F '"openai:test"' "$TMP_DIR/agent/saved.json" >/dev/null
grep -F '"key":"fixture"' "$TMP_DIR/agent/saved.json" >/dev/null
printf '%s' "$legacy_write_result" | grep -F '"native":false' >/dev/null
OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-auth-store.mjs" "$TMP_DIR/agent" read \
  | grep -F '"supported":false' >/dev/null

cat > "$TMP_DIR/openclaw/dist/store-fixture.js" <<'EOF'
import fs from 'node:fs'
export function y(store, agentDir) {
  fs.writeFileSync(`${agentDir}/saved.json`, JSON.stringify(store))
  fs.writeFileSync(`${agentDir}/openclaw-agent.sqlite`, 'fixture-v2')
}
// Bundle marker: saveAuthProfileStore as y
EOF
cat > "$TMP_DIR/openclaw/dist/persisted-fixture.js" <<'EOF'
import fs from 'node:fs'
export function m(agentDir) {
  return JSON.parse(fs.readFileSync(`${agentDir}/saved.json`, 'utf8'))
}
// Bundle marker: loadPersistedAuthProfileStore as m
EOF
printf '{"version":1,"profiles":{},"usageStats":{}}' \
  | OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-auth-store.mjs" "$TMP_DIR/agent" \
  | grep -F '"native":true' >/dev/null
grep -F 'fixture-v2' "$TMP_DIR/agent/openclaw-agent.sqlite" >/dev/null
OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-auth-store.mjs" "$TMP_DIR/agent" read \
  | grep -F '"profiles":{}' >/dev/null

echo "OpenClaw auth store bridge tests passed"
