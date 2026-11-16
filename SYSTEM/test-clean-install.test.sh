#!/usr/bin/env bash
set -euo pipefail
system_dir="$(cd "$(dirname "$0")" && pwd)"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-source-test-contract.XXXXXX")"
trap 'rm -rf "$fixture"' EXIT
mkdir "$fixture/bin"
export TEST_LOG="$fixture/commands"
export TEST_VM_STATE="$fixture/machine"
mkdir "$TEST_VM_STATE"
cat > "$fixture/bin/podman" <<'SH'
#!/usr/bin/env bash
scoped=false
if [ "${1:-}" = --connection ]; then
  [ "$2" = clawmax-test ] || exit 99
  scoped=true
  shift 2
fi
case "$1" in machine|system) ;; *) [ "$scoped" = true ] || { echo 'FAIL: container command bypassed explicit connection' >&2; exit 98; } ;; esac
printf '%s\n' "$*" >> "$TEST_LOG"
case "$1 ${2:-}" in
  'machine inspect') [ -f "$TEST_VM_STATE/exists" ] ;;
  'machine list')
    if [ "${TEST_OTHER_VM:-false}" = true ]; then echo 'podman-clawmax* true';
    elif [ -f "$TEST_VM_STATE/running" ]; then echo 'clawmax-test true'; fi ;;
  'machine init') [ "${TEST_INIT_FAIL:-false}" != true ] || exit 2; touch "$TEST_VM_STATE/exists" ;;
  'machine start') touch "$TEST_VM_STATE/running" ;;
  'machine stop') rm -f "$TEST_VM_STATE/running" ;;
  'machine rm') rm -f "$TEST_VM_STATE/exists" "$TEST_VM_STATE/running" ;;
  'system connection') [ "${3:-}" != list ] || echo existing-context ;;
  'container exists') [ "${TEST_EXISTS:-false}" = true ] ;;
  'volume exists') [ "${TEST_VOLUME_EXISTS:-false}" = true ] ;;
  'inspect --format')
    if [[ "$3" == *State.Running* ]]; then printf '%s\n' "${TEST_RUNNING:-true}"
    else printf '%s\n' "${TEST_OWNER:-true}"; fi ;;
  'volume inspect') printf '%s\n' "${TEST_VOLUME_OWNER:-true}" ;;
  'exec clawmax-test')
    if [ "${3:-}" = test ]; then [ "${TEST_READY:-true}" = true ];
    elif [ "${3:-}" = cat ]; then echo fixture-source-sha; fi ;;
  *) exit 0 ;;
esac
SH
cat > "$fixture/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'curl %s\n' "$*" >> "$TEST_LOG"
exit "${TEST_CURL_EXIT:-0}"
SH
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH"
export CLAWMAX_TEST_OPEN_BROWSER=false
export CLAWMAX_TEST_CONNECTION=clawmax-test
export CLAWMAX_TEST_STATE_DIR="$fixture/state"
run() { bash "$system_dir/containers/source-test/container.sh" "$@"; }
run > "$fixture/start.log"
grep -q '^READY: http://127.0.0.1:5181' "$fixture/start.log"
grep -q 'build --tag localhost/clawmax-source-test:node-26.12.1' "$TEST_LOG"
grep -q -- '--publish 127.0.0.1:3008:3008 --publish 127.0.0.1:5181:5181' "$TEST_LOG"
grep -q -- '--env CLAWMAX_TEST_REF=main' "$TEST_LOG"
grep -q -- '--env CLAWMAX_TEST_REPOSITORY=https://github.com/Maximilien-ai/clawmax.git' "$TEST_LOG"
grep -q -- '--volume clawmax-test-data:/home/node:U' "$TEST_LOG"
grep -q -- '--env OPENCLAW_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB=4352' "$TEST_LOG"
if grep -Eq 'privileged|docker.sock|podman.sock|:/src|:/app|volume .*clawmax-codex' "$TEST_LOG"; then echo 'FAIL: inherited host code or capabilities'; exit 1; fi
grep -q '127.0.0.1:3008/api/health' "$TEST_LOG"
grep -q '127.0.0.1:5181/api/health' "$TEST_LOG"
: > "$TEST_LOG"
TEST_EXISTS=true run > "$fixture/resume.log"
grep -q 'Resuming clawmax-test with its recorded source/data' "$fixture/resume.log"
if grep -Eq '^build |^run |^volume create' "$TEST_LOG"; then echo 'FAIL: resume replaced state'; exit 1; fi
run logs >/dev/null
run stop >/dev/null
if TEST_RUNNING=false run > "$fixture/failure.log" 2>&1; then echo 'FAIL: exited container reported success'; exit 1; fi
grep -q 'failed; container/data retained' "$fixture/failure.log"
if grep -q '^READY:' "$fixture/failure.log"; then exit 1; fi
if CLAWMAX_TEST_READY_TIMEOUT=0 run > "$fixture/timeout.log" 2>&1; then echo 'FAIL: readiness timeout reported success'; exit 1; fi
grep -q 'Readiness timed out' "$fixture/timeout.log"
: > "$TEST_LOG"
if TEST_OWNER=false run stop > "$fixture/owner.log" 2>&1; then echo 'FAIL: unowned stop permitted'; exit 1; fi
if grep -q '^stop ' "$TEST_LOG"; then echo 'FAIL: unowned process stopped'; exit 1; fi
: > "$TEST_LOG"
if TEST_EXISTS=true TEST_VOLUME_EXISTS=true TEST_VOLUME_OWNER=false run remove > "$fixture/volume.log" 2>&1; then echo 'FAIL: unowned volume removal permitted'; exit 1; fi
if grep -q '^volume rm ' "$TEST_LOG"; then exit 1; fi
: > "$TEST_LOG"
TEST_EXISTS=true TEST_VOLUME_EXISTS=true run remove >/dev/null
grep -q '^rm --force clawmax-test$' "$TEST_LOG"
grep -q '^volume rm clawmax-test-data$' "$TEST_LOG"
if CLAWMAX_TEST_API_PORT=bad run >/dev/null 2>&1; then echo 'FAIL: invalid port accepted'; exit 1; fi
outer() { bash "$system_dir/test-clean-install.sh" "$@"; }
: > "$TEST_LOG"
if TEST_OTHER_VM=true outer > "$fixture/other-vm.log" 2>&1; then echo 'FAIL: other VM was not protected'; exit 1; fi
grep -q 'another Podman VM is active: podman-clawmax' "$fixture/other-vm.log"
if grep -Eq '^machine (init|start|stop|rm)' "$TEST_LOG"; then echo 'FAIL: existing VM was changed'; exit 1; fi
outer > "$fixture/vm.log"
grep -q '^machine init --cpus 2 --memory 24576 --disk-size 30' "$TEST_LOG"
grep -q '^system connection default existing-context' "$TEST_LOG"
grep -q '/share:/mnt/clawmax-test:ro clawmax-test' "$TEST_LOG"
outer stop >/dev/null
grep -q '^machine stop clawmax-test$' "$TEST_LOG"
outer remove >/dev/null
grep -q '^machine rm --force clawmax-test$' "$TEST_LOG"
: > "$TEST_LOG"
touch "$TEST_VM_STATE/exists"
if outer remove >/dev/null 2>&1; then echo 'FAIL: unowned VM removed'; exit 1; fi
if grep -q '^machine rm' "$TEST_LOG"; then exit 1; fi
rm -f "$TEST_VM_STATE/exists"
if TEST_INIT_FAIL=true outer > "$fixture/init-failure.log" 2>&1; then echo 'FAIL: failed VM creation reported success'; exit 1; fi
grep -q 'Test VM creation failed' "$fixture/init-failure.log"
test -f "$CLAWMAX_TEST_STATE_DIR/clawmax-test/owner"
outer > "$fixture/init-retry.log"
grep -q '^READY:' "$fixture/init-retry.log"
grep -q '^FROM docker.io/library/node:' "$system_dir/containers/source-test/Containerfile"
[ "$(grep -c '^COPY ' "$system_dir/containers/source-test/Containerfile")" -eq 1 ]
grep -q 'git clone --depth 1 --single-branch --branch' "$system_dir/containers/source-test/entrypoint.sh"
grep -q '^./setup.sh --non-interactive$' "$system_dir/containers/source-test/entrypoint.sh"
if grep -Eq 'go build|v0.2.16|cp -a /src' "$system_dir/scripts/cleanroom-podman-setup-test.sh"; then exit 1; fi
echo 'PASS: clean-source install lifecycle, isolation, ownership and failure contracts'
