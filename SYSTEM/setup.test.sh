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

pass "setup.sh defaults non-interactive auth to bypass and only advertises bypass/email otp"
