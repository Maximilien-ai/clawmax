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

grep -q 'remove_path_with_optional_sudo()' "$setup_file" || fail "expected privileged removal helper"
grep -q 'cleanup_orphaned_podman_machine_files()' "$setup_file" || fail "expected podman orphan cleanup helper"
grep -q 'podman machine list --format json' "$setup_file" || fail "expected podman machine list inspection"
grep -q "efi-bl-" "$setup_file" || fail "expected efi-bl orphan cleanup pattern"
grep -q -- '-ignition.sock' "$setup_file" || fail "expected ignition.sock orphan cleanup pattern"
grep -q '/Applications/ClawMax.app' "$setup_file" || fail "expected ClawMax.app uninstall path"
grep -q '/usr/local/bin/clawmax' "$setup_file" || fail "expected clawmax launcher uninstall path"
grep -q 'sudo rm -rf "\$target"' "$setup_file" || fail "expected sudo removal path for privileged artifacts"
grep -q 'print_header "Cleaning Podman Residue"' "$setup_file" || fail "expected podman cleanup section"
grep -q 'print_header "Removing Packaged App Artifacts"' "$setup_file" || fail "expected packaged artifact cleanup section"

pass "setup.sh uninstall covers podman orphan cleanup and privileged packaged-app removal"
