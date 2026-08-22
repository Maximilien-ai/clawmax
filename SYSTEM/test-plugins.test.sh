#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
RUNNER="$SCRIPT_DIR/test-plugins.sh"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-plugin-launcher.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

passes=0
pass() {
  passes=$((passes + 1))
  echo "✓ $1"
}

PLUGIN_REPOSITORY="$FIXTURE_ROOT/external plugin"
mkdir -p "$PLUGIN_REPOSITORY"
cat > "$PLUGIN_REPOSITORY/package.json" <<'EOF'
{
  "name": "external-plugin-contract-fixture",
  "private": true,
  "scripts": {
    "test:clawmax-host": "node verify-host.js"
  }
}
EOF
cat > "$PLUGIN_REPOSITORY/verify-host.js" <<'EOF'
const fs = require('fs')
const path = require('path')
const root = process.env.CLAWMAX_DASHBOARD_ROOT || ''
if (!path.isAbsolute(root) || !fs.existsSync(path.join(root, 'server', 'lib', 'plugin-system.ts'))) process.exit(1)
fs.writeFileSync(path.join(__dirname, 'host-test-ran'), root)
EOF

CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" --plugins "$PLUGIN_REPOSITORY" > "$FIXTURE_ROOT/success.out"
test -s "$PLUGIN_REPOSITORY/host-test-ran"
pass "explicit external repository runs its declared host acceptance script"

if CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" > "$FIXTURE_ROOT/missing-arg.out" 2>&1; then
  echo "missing --plugins argument unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq -- '--plugins <external-plugin-repository>' "$FIXTURE_ROOT/missing-arg.out"
pass "missing repository argument fails with usage"

if CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" --plugins "$FIXTURE_ROOT/missing" > "$FIXTURE_ROOT/missing-repo.out" 2>&1; then
  echo "missing repository unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq 'External plugin repository not found' "$FIXTURE_ROOT/missing-repo.out"
pass "missing external repository fails closed"

mkdir -p "$FIXTURE_ROOT/no-package"
if CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" --plugins "$FIXTURE_ROOT/no-package" > "$FIXTURE_ROOT/no-package.out" 2>&1; then
  echo "repository without package.json unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq 'must contain package.json' "$FIXTURE_ROOT/no-package.out"
pass "repository without a package contract fails closed"

mkdir -p "$FIXTURE_ROOT/no-script"
cat > "$FIXTURE_ROOT/no-script/package.json" <<'EOF'
{"name":"no-host-script","private":true,"scripts":{"test":"true"}}
EOF
if CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" --plugins "$FIXTURE_ROOT/no-script" > "$FIXTURE_ROOT/no-script.out" 2>&1; then
  echo "repository without test:clawmax-host unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq 'must declare the test:clawmax-host script' "$FIXTURE_ROOT/no-script.out"
pass "repository without the generic host script fails closed"

if CLAWMAX_PLUGIN_TEST_SKIP_BUILD=true "$RUNNER" --plugins "$ROOT_DIR" > "$FIXTURE_ROOT/public-root.out" 2>&1; then
  echo "public repository unexpectedly accepted itself as an external plugin repository" >&2
  exit 1
fi
grep -Fq 'must identify a separate external plugin repository' "$FIXTURE_ROOT/public-root.out"
pass "public source cannot be treated as external plugin content"

echo "test-plugins.test.sh: $passes tests passed"
