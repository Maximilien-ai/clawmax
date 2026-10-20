#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/openclaw/dist" "$TMP_DIR/workspace"
printf '{"type":"module"}\n' > "$TMP_DIR/openclaw/package.json"
printf '{"setupExists":true,"attestation":{"attestedAtMs":1}}\n' > "$TMP_DIR/state.json"

cat > "$TMP_DIR/openclaw/dist/workspace-state-store-fixture.js" <<'EOF'
import fs from 'node:fs'
function prepare(workspaceDir) { return { workspaceDir } }
async function clear() {
  await new Promise(resolve => setTimeout(resolve, 20))
  if (process.env.OPENCLAW_TEST_DELETE_FAILURE) throw new Error('deletion failed')
  if (!process.env.OPENCLAW_TEST_RETAIN_STATE) fs.writeFileSync(process.env.OPENCLAW_TEST_WORKSPACE_STATE, '{"setupExists":false}\n')
}
async function read() {
  await new Promise(resolve => setTimeout(resolve, 20))
  return JSON.parse(fs.readFileSync(process.env.OPENCLAW_TEST_WORKSPACE_STATE, 'utf8'))
}
export { prepare as s, clear as i, read as c }
// prepareWorkspaceStateDeletion as s
// deleteWorkspaceState as i
// readWorkspaceStateSnapshot as c
EOF

result="$(OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" \
  OPENCLAW_TEST_WORKSPACE_STATE="$TMP_DIR/state.json" \
  node "$ROOT_DIR/SYSTEM/dashboard/openclaw-workspace-state.mjs" "$TMP_DIR/workspace")"

node -e '
const result = JSON.parse(process.argv[1])
if (result.cleared !== true || result.workspaceDir !== process.argv[2]) process.exit(1)
' "$result" "$TMP_DIR/workspace"

node -e '
const fs = require("fs")
const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
if (state.setupExists !== false || state.attestation) process.exit(1)
' "$TMP_DIR/state.json"

mv "$TMP_DIR/openclaw/dist/workspace-state-store-fixture.js" "$TMP_DIR/openclaw/dist/workspace-state-store-fixture.mjs"
printf '{"setupExists":true,"attestation":{"attestedAtMs":2}}\n' > "$TMP_DIR/state.json"
OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" OPENCLAW_TEST_WORKSPACE_STATE="$TMP_DIR/state.json" \
  node "$ROOT_DIR/SYSTEM/dashboard/openclaw-workspace-state.mjs" "$TMP_DIR/workspace" \
  | grep -F '"cleared":true' >/dev/null
grep -F '"setupExists":false' "$TMP_DIR/state.json" >/dev/null

if OPENCLAW_PACKAGE_ROOT="$TMP_DIR/missing" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-workspace-state.mjs" "$TMP_DIR/workspace" >/dev/null 2>&1; then
  echo "Expected missing pinned module to fail" >&2
  exit 1
fi

printf '{"setupExists":true}\n' > "$TMP_DIR/state.json"
for failure in OPENCLAW_TEST_DELETE_FAILURE OPENCLAW_TEST_RETAIN_STATE; do
  if env "$failure=1" OPENCLAW_PACKAGE_ROOT="$TMP_DIR/openclaw" OPENCLAW_TEST_WORKSPACE_STATE="$TMP_DIR/state.json" \
    node "$ROOT_DIR/SYSTEM/dashboard/openclaw-workspace-state.mjs" "$TMP_DIR/workspace" > "$TMP_DIR/result" 2> "$TMP_DIR/error"; then
    echo "Expected async cleanup failure for $failure" >&2
    exit 1
  fi
  if grep -F '"cleared":true' "$TMP_DIR/result"; then
    echo "Cleanup reported success before async verification" >&2
    exit 1
  fi
done

echo "openclaw-workspace-state.test.sh: asynchronous cleanup and failure checks passed"
