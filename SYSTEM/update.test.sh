#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-update-test.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fake_repo="$tmp_dir/repo"
mkdir -p "$fake_repo/SYSTEM/dashboard"
cp "$ROOT_DIR/update.sh" "$fake_repo/update.sh"

cat >"$fake_repo/setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > /tmp/clawmax-update-setup-args.txt
[ "${CLAWMAX_UPDATE_TEST_FAIL:-}" != true ] || exit 13
EOF
chmod +x "$fake_repo/setup.sh"

cat >"$fake_repo/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > /tmp/clawmax-update-install-args.txt
EOF
chmod +x "$fake_repo/install.sh"

rm -f /tmp/clawmax-update-setup-args.txt /tmp/clawmax-update-install-args.txt

(
  cd "$fake_repo"
  ./update.sh > "$tmp_dir/update-output"
)

[[ -f /tmp/clawmax-update-setup-args.txt ]] || fail "expected update.sh to invoke setup.sh"
[[ "$(cat /tmp/clawmax-update-setup-args.txt)" == "--non-interactive" ]] || fail "expected update.sh to call setup.sh --non-interactive"
grep -q './SYSTEM/start.sh' "$tmp_dir/update-output" || fail 'expected update start guidance'
grep -q './SYSTEM/stop.sh' "$tmp_dir/update-output" || fail 'expected update stop guidance'
if CLAWMAX_UPDATE_TEST_FAIL=true "$fake_repo/update.sh" > "$tmp_dir/failed-output" 2>&1; then
  fail 'setup failure must fail the update'
fi
if grep -q 'Update prepared\|Update complete' "$tmp_dir/failed-output"; then
  fail 'failed setup must not report a completed update'
fi
pass "update.sh reruns setup in non-interactive mode"

rm -f /tmp/clawmax-update-setup-args.txt /tmp/clawmax-update-install-args.txt

(
  cd "$fake_repo"
  ./update.sh v1.6.4
)

[[ -f /tmp/clawmax-update-install-args.txt ]] || fail "expected update.sh to delegate to install.sh when a target ref is provided"
[[ "$(cat /tmp/clawmax-update-install-args.txt)" == "v1.6.4" ]] || fail "expected update.sh to pass the target ref to install.sh"
pass "update.sh delegates to install.sh for pinned target refs"
