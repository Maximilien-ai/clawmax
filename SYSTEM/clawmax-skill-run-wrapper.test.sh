#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT_DIR/SYSTEM/dashboard/clawmax-skill-run"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts"
cat > "$TMP_ROOT/app/SYSTEM/dashboard/dist/server/scripts/clawmax-skill-run.js" <<'EOF'
console.log(`broker-wrapper:${process.argv.slice(2).join(':')}`)
EOF

output="$(CLAWMAX_REPO_ROOT="$TMP_ROOT/app" "$WRAPPER" clawmax-secret-test check)"
[ "$output" = "broker-wrapper:clawmax-secret-test:check" ]

echo "clawmax-skill-run wrapper tests passed"
