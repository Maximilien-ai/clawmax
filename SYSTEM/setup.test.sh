#!/bin/bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
setup_file="$repo_root/setup.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

auth_section="$(sed -n '/print_header "3. Setup Mode"/,/print_header "4. Keys & BYOK"/p' "$setup_file")"

grep -q 'Local dev with bypass' <<<"$auth_section" || fail "expected bypass setup option"
grep -q 'Local dev with Email OTP' <<<"$auth_section" || fail "expected email otp setup option"
grep -q 'Choose auth mode \[1-2\]' <<<"$auth_section" || fail "expected two-option auth prompt"
if grep -q 'GitHub OAuth' <<<"$auth_section"; then
  fail "setup mode section should not advertise GitHub OAuth"
fi

grep -q 'if \[ -z "\$AUTH_MODE" \]; then' "$setup_file" || fail "expected non-interactive default auth guard"
grep -q 'AUTH_MODE="bypass"' "$setup_file" || fail "expected bypass default assignment"
grep -q 'Non-interactive: using local dev bypass' "$setup_file" || fail "expected non-interactive bypass message"
grep -q 'SYSTEM/openclaw-version.sh' "$setup_file" || fail "expected setup.sh to source the branch OpenClaw version helper"
grep -q 'CLAWMAX_OPENCLAW_TARGET' "$setup_file" || fail "expected setup.sh to prefer the branch OpenClaw target when present"
grep -q 'ensure-openclaw-default-plugins.sh' "$setup_file" || fail "expected setup.sh to install required external OpenClaw plugins"

fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-setup-flow.XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT
fixture_repo="$fixture_root/repo"
fixture_bin="$fixture_root/bin"
mkdir -p "$fixture_repo/SYSTEM/dashboard/node_modules" "$fixture_bin" "$fixture_root/home"
cp "$setup_file" "$fixture_repo/setup.sh"
cp "$repo_root/SYSTEM/openclaw-cli.sh" "$repo_root/SYSTEM/openclaw-version.sh" \
  "$repo_root/SYSTEM/openclaw-dev-runtime.sh" "$repo_root/SYSTEM/ensure-openclaw-default-plugins.sh" "$fixture_repo/SYSTEM/"
cat > "$fixture_bin/openclaw" <<'EOF'
#!/usr/bin/env bash
printf 'global:%s\n' "$*" >> "$SETUP_TEST_LOG"
printf 'OpenClaw 2026.3.28 (fixture)\n'
EOF
cat > "$fixture_bin/pinned-openclaw" <<'EOF'
#!/usr/bin/env bash
printf 'pinned:%s\n' "$*" >> "$SETUP_TEST_LOG"
case "$*" in
  --version) printf 'OpenClaw 2026.9.7 (fixture)\n' ;;
  'plugins install --help'|'plugins enable --help')
    [ "${SETUP_TEST_PLUGIN_FAIL:-}" != true ] || exit 2
    printf '%s\n' '--accept-capabilities' ;;
  'config get gateway.mode') printf 'local\n' ;;
  'config get gateway.auth.token') printf 'fixture-token\n' ;;
  'gateway status') printf 'Runtime: running\nRPC probe: ok\n' ;;
esac
EOF
cat > "$fixture_repo/SYSTEM/prepare-openclaw-target.sh" <<'EOF'
#!/usr/bin/env bash
printf 'prepare:%s\n' "$*" >> "$SETUP_TEST_LOG"
[ "${SETUP_TEST_PREP_FAIL:-}" != true ] || exit 23
printf '%s/pinned-openclaw\n' "$SETUP_TEST_BIN"
EOF
cat > "$fixture_repo/SYSTEM/start.sh" <<'EOF'
#!/usr/bin/env bash
printf 'start:%s\n' "$*" >> "$SETUP_TEST_LOG"
[ "${SETUP_TEST_START_FAIL:-}" != true ]
EOF
cat > "$fixture_bin/npm" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" != --version ] || printf '11.20.0\n'
EOF
cat > "$fixture_bin/uname" <<'EOF'
#!/usr/bin/env bash
printf 'Linux\n'
EOF
cat > "$fixture_bin/lsof" <<'EOF'
#!/usr/bin/env bash
printf '12345\n'
EOF
chmod +x "$fixture_bin/"* "$fixture_repo/SYSTEM/start.sh" "$fixture_repo/SYSTEM/prepare-openclaw-target.sh"
fixture_path="$fixture_bin:$(dirname "$(command -v node)"):/usr/bin:/bin"
run_setup() {
  env -i PATH="$fixture_path" HOME="$fixture_root/home" SETUP_TEST_BIN="$fixture_bin" \
    SETUP_TEST_LOG="$fixture_root/commands.log" SETUP_TEST_PREP_FAIL="${1:-false}" \
    SETUP_TEST_PLUGIN_FAIL="${2:-false}" CLAWMAX_SKIP_GATEWAY_BOOTSTRAP="${3:-}" \
    CLAWMAX_OPENCLAW_CACHE_DIR="$fixture_root/cache" /bin/bash "$fixture_repo/setup.sh" --non-interactive
}
run_setup > "$fixture_root/success.log" 2>&1 || { cat "$fixture_root/success.log"; fail 'expected setup to prepare a pinned runtime over an old global CLI'; }
grep -q 'prepare:--print-bin' "$fixture_root/commands.log" || fail 'expected pinned preparation'
grep -q 'pinned:plugins enable whatsapp --accept-capabilities' "$fixture_root/commands.log" || fail 'plugins must use the pinned runtime'
if grep -q '^global:plugins\|^global:gateway\|^global:config' "$fixture_root/commands.log"; then fail 'setup must not configure the old global CLI'; fi
grep -q './SYSTEM/start.sh' "$fixture_root/success.log" || fail 'expected explicit start path'
grep -q './SYSTEM/stop.sh' "$fixture_root/success.log" || fail 'expected explicit stop path'
for scenario in prepare plugins; do
  prep_failure=false; plugin_failure=false
  [ "$scenario" != prepare ] || prep_failure=true
  [ "$scenario" != plugins ] || plugin_failure=true
  if run_setup "$prep_failure" "$plugin_failure" > "$fixture_root/$scenario-failure.log" 2>&1; then fail 'setup must fail when required runtime preparation fails'; fi
  if grep -q 'Setup Complete\|prerequisites verified' "$fixture_root/$scenario-failure.log"; then fail 'failed setup must not report completion'; fi
done
: > "$fixture_root/commands.log"
run_setup false false true > "$fixture_root/skip-gateway.log" 2>&1
if grep -E '^pinned:(gateway|config)' "$fixture_root/commands.log" | grep -v '^pinned:config validate --json$'; then
  fail 'isolated setup must not configure or control an installed Gateway'
fi
grep -q 'Gateway service readiness not checked' "$fixture_root/skip-gateway.log" || fail 'skipped service must not be reported ready'

# Exercise both interactive choices through a real pseudo-terminal, but replace
# runtime/dependency/service commands with the fixtures above. No real user state.
python3 - "$fixture_repo" "$fixture_root" "$fixture_path" "$fixture_bin" <<'PY'
import os, pty, select, subprocess, sys, time
repo, root, path, bin_path = sys.argv[1:]
for answer, fail_start in (('n', False), ('y', False), ('y', True)):
    master, slave = pty.openpty()
    env = dict(PATH=path, HOME=root+'/home', TERM='dumb', SETUP_TEST_BIN=bin_path, SETUP_TEST_LOG=root+'/commands.log')
    env['CLAWMAX_OPENCLAW_CACHE_DIR'] = root+'/cache'
    if fail_start: env['SETUP_TEST_START_FAIL'] = 'true'
    process = subprocess.Popen(['/bin/bash', repo+'/setup.sh'], stdin=slave, stdout=slave, stderr=slave, env=env)
    os.close(slave)
    output = ''
    sent_mode = sent_launch = False
    deadline = time.monotonic()+20
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], .1)[0]:
                try: chunk = os.read(master, 65536)
                except OSError: break
                if not chunk: break
                output += chunk.decode(errors='replace')
            if 'Choose auth mode [1-2]' in output and not sent_mode:
                os.write(master, b'1\n'); sent_mode = True
            if 'Start the dashboard now?' in output and not sent_launch:
                os.write(master, answer.encode()+b'\n'); sent_launch = True
            if process.poll() is not None: break
        process.wait(timeout=2)
        assert process.returncode == (1 if fail_start else 0), output
        assert sent_mode and sent_launch, output
        assert './SYSTEM/start.sh' in output and './SYSTEM/stop.sh' in output, output
        if fail_start:
            assert 'Dashboard did not start' in output and 'Dashboard is running' not in output, output
        else:
            assert 'Stop the dashboard:' in output, output
    finally:
        if process.poll() is None: process.kill(); process.wait()
        os.close(master)
PY
bash "$repo_root/SYSTEM/openclaw-cli.test.sh"
pass "setup verifies the pinned runtime before success and prints start/stop paths for all launch choices"
pass "setup.sh defaults non-interactive auth to bypass and only advertises bypass/email otp"
