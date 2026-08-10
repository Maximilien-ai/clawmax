#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT_DIR/SYSTEM/dashboard/clawmax-mail-run"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts"
cat > "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts/clawmax-mail-run.js" <<'EOF'
console.log(`mail-wrapper:${process.argv.slice(2).join(':')}`)
EOF

output="$(CLAWMAX_REPO_ROOT="$TMP_ROOT/app" "$WRAPPER" accounts)"
[ "$output" = "mail-wrapper:accounts" ]

echo "clawmax-mail-run wrapper tests passed"
