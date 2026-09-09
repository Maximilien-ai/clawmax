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
function clear() { fs.writeFileSync(process.env.OPENCLAW_TEST_WORKSPACE_STATE, '{"setupExists":false}\n') }
function read() { return JSON.parse(fs.readFileSync(process.env.OPENCLAW_TEST_WORKSPACE_STATE, 'utf8')) }
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

if OPENCLAW_PACKAGE_ROOT="$TMP_DIR/missing" node "$ROOT_DIR/SYSTEM/dashboard/openclaw-workspace-state.mjs" "$TMP_DIR/workspace" >/dev/null 2>&1; then
  echo "Expected missing pinned module to fail" >&2
  exit 1
fi

echo "openclaw-workspace-state.test.sh: 6 tests passed"
