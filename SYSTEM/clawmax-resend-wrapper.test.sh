#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT_DIR/SYSTEM/dashboard/clawmax-resend-send"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts"

cat > "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts/clawmax-resend-send.js" <<'EOF'
#!/usr/bin/env node
console.log("wrapper-ok")
EOF
chmod +x "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts/clawmax-resend-send.js"

OUTPUT="$(CLAWMAX_REPO_ROOT="$TMP_ROOT/app" "$WRAPPER" 2>/dev/null)"

if [ "$OUTPUT" != "wrapper-ok" ]; then
  echo "Expected wrapper to execute dist script via CLAWMAX_REPO_ROOT, got: $OUTPUT" >&2
  exit 1
fi

echo "clawmax resend wrapper tests passed"
