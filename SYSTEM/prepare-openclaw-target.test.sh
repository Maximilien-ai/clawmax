#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
script_file="$repo_root/SYSTEM/prepare-openclaw-target.sh"
. "$repo_root/SYSTEM/openclaw-version.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

[ -f "$script_file" ] || fail "expected prepare-openclaw-target.sh to exist"

grep -q 'openclaw-version.sh' "$script_file" || fail "expected script to source openclaw-version.sh"
grep -q 'Node.js 22.22.3+, 24.15.0+, or 25.9.0+' "$script_file" || fail "expected script to enforce the OpenClaw 2 Node ranges"
grep -q 'pnpm install --frozen-lockfile --ignore-scripts' "$script_file" || fail "expected pnpm install command"
grep -q 'npm run build:docker' "$script_file" || fail "expected docker-oriented OpenClaw build path"
grep -q 'patch-openclaw-fs-safe.mjs' "$script_file" || fail "expected OpenClaw fs-safe compatibility patch"
grep -q 'postinstall-bundled-plugins.mjs' "$script_file" || fail "expected bundled plugin postinstall repair step"
for channel in whatsapp discord telegram slack; do
  grep -q "\\\"$channel\\\"" "$script_file" || fail "expected $channel startup metadata smoke check"
done
grep -q -- '--print-bin' "$script_file" || fail "expected print-bin option"
grep -q -- '--print-skills-dir' "$script_file" || fail "expected print-skills-dir option"
grep -q 'openclaw.mjs' "$script_file" || fail "expected wrapper to launch openclaw.mjs"

failure_root="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-openclaw-prep-failure.XXXXXX")"
trap 'rm -rf "$failure_root"' EXIT
mkdir -p "$failure_root/bin"
cat > "$failure_root/bin/git" <<'EOF'
#!/usr/bin/env bash
exit 23
EOF
chmod +x "$failure_root/bin/git"

if PATH="$failure_root/bin:$PATH" \
  CLAWMAX_OPENCLAW_CACHE_DIR="$failure_root/cache" \
  bash "$script_file" > "$failure_root/output" 2>&1; then
  fail "expected target preparation to fail when the OpenClaw clone fails"
fi

if grep -q 'Prepared OpenClaw' "$failure_root/output"; then
  fail "target preparation must not report success after a failed clone"
fi

corepack_root="$failure_root/corepack-only"
cache_root="$corepack_root/cache"
target_dir="$(printf '%s' "$CLAWMAX_OPENCLAW_TARGET" | tr '/:@' '---')"
source_root="$cache_root/$target_dir/src"
mkdir -p "$corepack_root/bin" "$source_root/.git"
printf '{}\n' > "$source_root/package.json"

cat > "$corepack_root/bin/git" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  describe)
    printf '%s\n' "${CLAWMAX_OPENCLAW_TARGET:?}"
    ;;
  rev-parse)
    printf 'test-openclaw-commit\n'
    ;;
esac
EOF

cat > "$corepack_root/bin/node" <<'EOF'
#!/usr/bin/env bash
if [ "$#" -eq 0 ]; then
  cat > /dev/null
fi
EOF

cat > "$corepack_root/bin/corepack" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ "${1:-}" = "pnpm" ] || exit 31
shift
case "${1:-}" in
  install)
    exit 0
    ;;
  run)
    [ "${2:-}" = "build:docker" ] || exit 32
    command -v pnpm > /dev/null
    pnpm nested-build-smoke
    ;;
  nested-build-smoke)
    mkdir -p dist
    printf 'export {};\n' > dist/index.js
    printf '{"channelOptions":["whatsapp","discord","telegram","slack"]}\n' > dist/cli-startup-metadata.json
    ;;
  *)
    exit 33
    ;;
esac
EOF

chmod +x "$corepack_root/bin/git" "$corepack_root/bin/node" "$corepack_root/bin/corepack"

if ! PATH="$corepack_root/bin:/usr/bin:/bin" \
  CLAWMAX_OPENCLAW_CACHE_DIR="$cache_root" \
  bash "$script_file" --print-bin > "$corepack_root/output" 2>&1; then
  cat "$corepack_root/output" >&2
  fail "expected corepack-only target preparation to support nested pnpm build steps"
fi

[ -x "$cache_root/$target_dir/bin/pnpm" ] || fail "expected a scoped pnpm shim for corepack-only builds"
[ -x "$cache_root/$target_dir/bin/openclaw" ] || fail "expected OpenClaw wrapper after corepack-only build"

pass "prepare-openclaw-target.sh uses the branch target Node/PNPM OpenClaw build flow"
