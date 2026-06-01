#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
script_file="$repo_root/SYSTEM/prepare-openclaw-target.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

[ -f "$script_file" ] || fail "expected prepare-openclaw-target.sh to exist"

grep -q 'openclaw-version.sh' "$script_file" || fail "expected script to source openclaw-version.sh"
grep -q 'Node.js >=22.19.0' "$script_file" || fail "expected script to enforce Node 22.19+"
grep -q 'pnpm install --frozen-lockfile --ignore-scripts' "$script_file" || fail "expected pnpm install command"
grep -q 'npm run build:docker' "$script_file" || fail "expected docker-oriented OpenClaw build path"
grep -q 'postinstall-bundled-plugins.mjs' "$script_file" || fail "expected bundled plugin postinstall repair step"
grep -q 'qqbot' "$script_file" || fail "expected qqbot startup metadata smoke check"
grep -q -- '--print-bin' "$script_file" || fail "expected print-bin option"
grep -q -- '--print-skills-dir' "$script_file" || fail "expected print-skills-dir option"
grep -q 'openclaw.mjs' "$script_file" || fail "expected wrapper to launch openclaw.mjs"

pass "prepare-openclaw-target.sh uses the branch target Node/PNPM OpenClaw build flow"
