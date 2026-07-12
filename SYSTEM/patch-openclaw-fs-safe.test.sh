#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/openclaw/dist"
cat > "$TMP_DIR/openclaw/dist/secret-file-fixture.js" <<'EOF'
async function enforcePrivatePathMode(resolvedPath, expectedMode, kind) {
	if (process.platform === "win32") return;
	await fs$1.chmod(resolvedPath, expectedMode);
	const actualMode = (await fs$1.stat(resolvedPath)).mode & 511;
	if (actualMode !== expectedMode) throw new Error(`Private secret ${kind} ${resolvedPath} has insecure permissions ${actualMode.toString(8)}.`);
}
EOF

node "$ROOT_DIR/SYSTEM/patch-openclaw-fs-safe.mjs" "$TMP_DIR/openclaw" >/dev/null

grep -F 'let actualMode = (await fs$1.stat(resolvedPath)).mode & 511;' "$TMP_DIR/openclaw/dist/secret-file-fixture.js" >/dev/null
grep -F 'if (actualMode === expectedMode) return;' "$TMP_DIR/openclaw/dist/secret-file-fixture.js" >/dev/null
node "$ROOT_DIR/SYSTEM/patch-openclaw-fs-safe.mjs" "$TMP_DIR/openclaw" >/dev/null

echo "OpenClaw fs-safe compatibility patch tests passed"
