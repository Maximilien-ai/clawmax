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

bash "$repo_root/SYSTEM/openclaw-cache-guard.test.sh"

[ -f "$script_file" ] || fail "expected prepare-openclaw-target.sh to exist"

grep -q 'openclaw-version.sh' "$script_file" || fail "expected script to source openclaw-version.sh"
grep -Fq 'ensure_supported_source_node' "$script_file" || fail "expected the shared OpenClaw source Node prerequisite"
grep -q 'pnpm install --frozen-lockfile --ignore-scripts' "$script_file" || fail "expected pnpm install command"
grep -q 'npm run build:docker' "$script_file" || fail "expected docker-oriented OpenClaw build path"
grep -q 'patch-openclaw-fs-safe.mjs' "$script_file" || fail "expected OpenClaw fs-safe compatibility patch"
grep -q 'node "$SCRIPT_DIR/patch-openclaw-roster-removal.mjs" "$src_dir"' "$script_file" || fail "expected explicit roster-removal source patch"
grep -q 'cksum < "$SCRIPT_DIR/patch-openclaw-roster-removal.mjs"' "$script_file" || fail "expected patch-aware runtime cache invalidation"
grep -q 'cksum < "$SCRIPT_DIR/patch-openclaw-fs-safe.mjs"' "$script_file" || fail "expected filesystem-verifier-aware runtime cache invalidation"
grep -q 'postinstall-bundled-plugins.mjs' "$script_file" || fail "expected bundled plugin postinstall repair step"
grep -q 'scripts/build-external-plugin-local-dist.mts' "$script_file" || fail "expected standalone source plugin build"
grep -q 'source-plugins-v1:' "$script_file" || fail "expected cache invalidation for standalone plugins"
node "$repo_root/SYSTEM/verify-openclaw-plugin-entries.test.mjs"
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
[ "$(grep -c 'attempt [123]/3' "$failure_root/output")" -eq 3 ] || fail "expected exactly three bounded clone attempts"
[ -z "$(find "$failure_root/cache" -name .prepared-commit -print)" ] || fail "failed clones must not mark the cache ready"

corepack_root="$failure_root/corepack-only"
cache_root="$corepack_root/cache"
target_dir="$(printf '%s' "$CLAWMAX_OPENCLAW_TARGET" | tr '/:@' '---')"
source_root="$cache_root/$target_dir/src"
mkdir -p "$corepack_root/bin" "$source_root/.git"
printf '{}\n' > "$source_root/package.json"

cat > "$corepack_root/bin/git" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -c)
    [ "$2" = 'http.version=HTTP/1.1' ] || exit 41
    [ "$3" = 'clone' ] && [ "$4" = '--depth' ] && [ "$5" = '1' ] || exit 42
    [ "$6" = '--single-branch' ] && [ "$7" = '--branch' ] && [ "$8" = "$CLAWMAX_OPENCLAW_TARGET" ] || exit 43
    attempt=0
    [ ! -f "$CLONE_TEST_COUNTER" ] || attempt="$(cat "$CLONE_TEST_COUNTER")"
    attempt=$((attempt + 1))
    printf '%s\n' "$attempt" > "$CLONE_TEST_COUNTER"
    destination="${10}"
    mkdir -p "$destination/.git"
    printf '{}\n' > "$destination/package.json"
    if [ "$attempt" -lt 3 ]; then
      printf 'partial\n' > "$destination/partial-transfer"
      exit 23
    fi
    ;;
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
  --version)
    [ "${PREP_TEST_COREPACK_BROKEN:-}" != 'always' ] || exit 45
    if [ "${PREP_TEST_COREPACK_BROKEN:-}" = 'original' ] && [[ "$COREPACK_HOME" != */corepack-recovery.* ]]; then
      exit 45
    fi
    printf '12.4.0\n'
    ;;
  plugins:assets:copy)
    exit 0
    ;;
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

cat > "$corepack_root/bin/lsof" <<'EOF'
#!/usr/bin/env bash
printf 'n/unrelated-test-workspace\n'
EOF
chmod +x "$corepack_root/bin/git" "$corepack_root/bin/node" "$corepack_root/bin/corepack" "$corepack_root/bin/lsof"

if ! PATH="$corepack_root/bin:/usr/bin:/bin" \
  CLAWMAX_OPENCLAW_CACHE_DIR="$cache_root" \
  bash "$script_file" --print-bin > "$corepack_root/output" 2>&1; then
  cat "$corepack_root/output" >&2
  fail "expected corepack-only target preparation to support nested pnpm build steps"
fi

[ -x "$cache_root/$target_dir/bin/pnpm" ] || fail "expected a scoped pnpm shim for corepack-only builds"
[ -x "$cache_root/$target_dir/bin/openclaw" ] || fail "expected OpenClaw wrapper after corepack-only build"

retry_cache="$failure_root/retry-cache"
if ! PATH="$corepack_root/bin:/usr/bin:/bin" \
  CLONE_TEST_COUNTER="$failure_root/clone-attempts" \
  CLAWMAX_OPENCLAW_CACHE_DIR="$retry_cache" \
  bash "$script_file" --print-bin > "$failure_root/retry-output" 2>&1; then
  cat "$failure_root/retry-output" >&2
  fail "expected preparation to recover after interrupted clone transfers"
fi
[ "$(cat "$failure_root/clone-attempts")" -eq 3 ] || fail "expected recovery on third clone attempt"
[ ! -f "$retry_cache/$target_dir/src/partial-transfer" ] || fail "partial clone must not contaminate promoted source"
[ -f "$retry_cache/$target_dir/.prepared-commit" ] || fail "successful preparation must write readiness stamp"
[ -x "$retry_cache/$target_dir/bin/openclaw" ] || fail "successful preparation must provide pinned wrapper"

# Force a rebuild to exercise a corrupt Corepack cache without a live download.
rm "$source_root/dist/index.js" "$cache_root/$target_dir/.prepared-commit"
if ! PATH="$corepack_root/bin:/usr/bin:/bin" \
  PREP_TEST_COREPACK_BROKEN=original \
  CLAWMAX_OPENCLAW_CACHE_DIR="$cache_root" \
  bash "$script_file" --print-bin > "$failure_root/corepack-recovery-output" 2>&1; then
  fail "expected a broken Corepack cache to recover in an isolated cache"
fi
grep -q 'retrying with isolated Corepack cache' "$failure_root/corepack-recovery-output" || fail "expected explicit recovery diagnostic"
[ -f "$cache_root/$target_dir/.prepared-commit" ] || fail "expected prepared stamp after Corepack recovery"

rm "$source_root/dist/index.js" "$cache_root/$target_dir/.prepared-commit"
if PATH="$corepack_root/bin:/usr/bin:/bin" \
  PREP_TEST_COREPACK_BROKEN=always \
  CLAWMAX_OPENCLAW_CACHE_DIR="$cache_root" \
  bash "$script_file" --print-bin > "$failure_root/corepack-failed-output" 2>&1; then
  fail "expected persistent pnpm failure to stop preparation"
fi
[ ! -f "$cache_root/$target_dir/.prepared-commit" ] || fail "pnpm failure must not stamp cache readiness"
[ ! -f "$source_root/dist/index.js" ] || fail "pnpm failure must not proceed to build"

npm_root="$failure_root/npm-only"
mkdir -p "$npm_root/bin"
cp "$corepack_root/bin/git" "$corepack_root/bin/lsof" "$npm_root/bin/"
real_node="$(command -v node)"
cat > "$npm_root/bin/node" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = -e ]; then exec "$PREP_TEST_REAL_NODE" "$@"; fi
if [ "$#" -eq 0 ]; then cat >/dev/null; fi
EOF
cat > "$npm_root/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PREP_TEST_NPM_LOG"
[ "${PREP_TEST_NPM_FAIL:-}" != true ] || exit 47
[ "$1" = install ] && [ "$2" = --prefix ] || exit 48
canonical_cache="$(cd "$CLAWMAX_OPENCLAW_CACHE_DIR" && pwd -P)"
case "$3" in "$canonical_cache"/*/package-manager/install.*) ;; *) exit 49 ;; esac
case " $* " in *' --ignore-scripts '*) ;; *) exit 50 ;; esac
case " $* " in *' pnpm@12.5.1 '*) ;; *) exit 51 ;; esac
mkdir -p "$3/node_modules/.bin"
cp "$PREP_TEST_PNPM_FIXTURE" "$3/node_modules/.bin/pnpm"
chmod +x "$3/node_modules/.bin/pnpm"
EOF
cat > "$npm_root/pnpm-fixture" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  --version) printf '12.5.1\n' ;;
  install|plugins:assets:copy) exit 0 ;;
  run) [ "$2" = build:docker ]; pnpm nested-build-smoke ;;
  nested-build-smoke)
    mkdir -p dist
    printf 'export {};\n' > dist/index.js
    printf '{"channelOptions":["whatsapp","discord","telegram","slack"]}\n' > dist/cli-startup-metadata.json
    ;;
  *) exit 52 ;;
esac
EOF
chmod +x "$npm_root/bin/node" "$npm_root/bin/npm"
export PREP_TEST_REAL_NODE="$real_node"
export PREP_TEST_NPM_LOG="$npm_root/npm.log"
export PREP_TEST_PNPM_FIXTURE="$npm_root/pnpm-fixture"
for scenario in success failure; do
  npm_cache="$npm_root/$scenario"
  mkdir -p "$npm_cache/$target_dir/src/.git"
  printf '{"packageManager":"pnpm@12.5.1+sha512.abcdef"}\n' > "$npm_cache/$target_dir/src/package.json"
  npm_should_fail=false
  [ "$scenario" != failure ] || npm_should_fail=true
  if PATH="$npm_root/bin:/usr/bin:/bin" PREP_TEST_NPM_FAIL="$npm_should_fail" \
    CLAWMAX_OPENCLAW_CACHE_DIR="$npm_cache" bash "$script_file" --print-bin > "$npm_root/$scenario.out" 2>&1; then
    [ "$scenario" = success ] || fail "npm bootstrap failure must stop preparation"
  else
    [ "$scenario" = failure ] || { cat "$npm_root/$scenario.out"; fail "npm-only preparation must support nested pnpm builds"; }
  fi
done
[ -f "$npm_root/success/$target_dir/.prepared-commit" ] || fail "npm-only build must mark verified artifacts ready"
[ ! -f "$npm_root/failure/$target_dir/.prepared-commit" ] || fail "failed bootstrap must not mark readiness"
grep -q 'Check npm registry access and retry' "$npm_root/failure.out" || fail "expected actionable npm failure"
install_count="$(wc -l < "$PREP_TEST_NPM_LOG" | tr -d ' ')"
PATH="$npm_root/bin:/usr/bin:/bin" CLAWMAX_OPENCLAW_CACHE_DIR="$npm_root/success" \
  bash "$script_file" --print-bin > "$npm_root/reuse.out" 2>&1
[ "$(wc -l < "$PREP_TEST_NPM_LOG" | tr -d ' ')" = "$install_count" ] || fail "prepared runtime must not reinstall pnpm"
pass "npm-only preparation bootstraps exact cache-local pnpm, reuses it, and fails closed on install errors"

pass "prepare-openclaw-target.sh uses the branch target Node/PNPM OpenClaw build flow"
