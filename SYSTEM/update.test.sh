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

mkdir -p "$fake_repo/.git" "$tmp_dir/bin"
cat > "$tmp_dir/bin/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  'status --porcelain') [ "$CLAWMAX_UPDATE_GIT_MODE" != dirty ] || printf ' M setup.sh\n' ;;
  'symbolic-ref --quiet --short HEAD')
    [ "$CLAWMAX_UPDATE_GIT_MODE" != detached ] || exit 1
    printf 'integration/rc94-daniyar\n' ;;
  'rev-parse --abbrev-ref --symbolic-full-name @{upstream}')
    [ "$CLAWMAX_UPDATE_GIT_MODE" != no-upstream ] || exit 1
    printf 'origin/integration/rc94-daniyar\n' ;;
  'pull --ff-only') printf '%s\n' "$*" >> "$CLAWMAX_UPDATE_GIT_LOG" ;;
  *) printf 'Unexpected git operation: %s\n' "$*" >&2; exit 42 ;;
esac
EOF
chmod +x "$tmp_dir/bin/git"
for git_mode in clean dirty detached no-upstream; do
  git_log="$tmp_dir/git-$git_mode.log"
  : > "$git_log"
  PATH="$tmp_dir/bin:$PATH" CLAWMAX_UPDATE_GIT_MODE="$git_mode" CLAWMAX_UPDATE_GIT_LOG="$git_log" \
    "$fake_repo/update.sh" > "$tmp_dir/update-$git_mode.out"
  if [ "$git_mode" = clean ]; then
    grep -Fxq 'pull --ff-only' "$git_log" || fail 'expected current tracking branch pull'
    grep -q 'origin/integration/rc94-daniyar' "$tmp_dir/update-$git_mode.out" || fail 'expected actual upstream label'
  else
    [ ! -s "$git_log" ] || fail 'dirty/detached/untracked checkout must not be pulled'
  fi
done
pass "update.sh preserves the chosen branch and safely skips dirty, detached and untracked checkouts"
pass "update.sh delegates to install.sh for pinned target refs"
