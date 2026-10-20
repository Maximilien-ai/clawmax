#!/usr/bin/env bash
set -euo pipefail
system_dir="$(cd "$(dirname "$0")" && pwd)"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/clawmax-cache-guard.XXXXXX")"
cleanup() { rm -rf "$fixture"; }
trap cleanup EXIT
mkdir -p "$fixture/cache" "$fixture/bin"
# Controlled lsof fixture; never inspect or stop the owner's real gateway.
cat > "$fixture/bin/lsof" <<'EOF'
#!/usr/bin/env bash
[ "${GUARD_LSOF_FAILURE:-}" != 1 ] || exit 1
printf '%s\n' "${GUARD_LSOF_OUTPUT:-n/unrelated}"
EOF
chmod +x "$fixture/bin/lsof"
export PATH="$fixture/bin:$PATH"
(
  . "$system_dir/openclaw-cache-guard.sh"
  clawmax_cache_lock "$fixture/cache"
  (clawmax_cache_unlock)
  [ -d "$fixture/cache/.runtime-gate" ]
  if (clawmax_cache_lock "$fixture/cache"); then exit 1; fi
  clawmax_cache_assert_idle "$fixture/cache"
  clawmax_cache_register_runtime "$fixture/cache"
  if clawmax_cache_assert_idle "$fixture/cache"; then exit 1; fi
  rm "$fixture/cache/.runtime-leases/$$"
  export GUARD_LSOF_OUTPUT="n$fixture/cache/src"
  if clawmax_cache_assert_idle "$fixture/cache"; then exit 1; fi
  export GUARD_LSOF_OUTPUT="n$fixture/cache/src/node_modules"
  if clawmax_cache_assert_idle "$fixture/cache"; then exit 1; fi
  export GUARD_LSOF_OUTPUT="n$fixture/cache/src-other"
  clawmax_cache_assert_idle "$fixture/cache"
  export GUARD_LSOF_FAILURE=1
  if clawmax_cache_assert_idle "$fixture/cache"; then exit 1; fi
  unset GUARD_LSOF_FAILURE
  clawmax_cache_unlock
  [ ! -d "$fixture/cache/.runtime-gate" ]

  # Two simultaneous CLI wrappers should serialize registration, while an
  # interrupted preparer still fails closed without deleting its gate.
  mkdir "$fixture/cache/.runtime-gate"
  recovery_now=0
  release_gate=true
  date() { echo "$recovery_now"; }
  sleep() {
    recovery_now=$((recovery_now + 1))
    if [ "$release_gate" = true ] && [ "$recovery_now" -eq 1 ]; then
      rmdir "$fixture/cache/.runtime-gate"
    fi
  }
  clawmax_cache_lock_wait "$fixture/cache" 3
  [ "$recovery_now" -eq 1 ]
  clawmax_cache_unlock
  [ ! -d "$fixture/cache/.runtime-gate" ]

  mkdir "$fixture/cache/.runtime-gate"
  recovery_now=0
  release_gate=false
  if clawmax_cache_lock_wait "$fixture/cache" 2; then exit 1; fi
  [ "$recovery_now" -eq 2 ]
  [ -d "$fixture/cache/.runtime-gate" ]
  rmdir "$fixture/cache/.runtime-gate"
)
grep -Fq 'cd /' "$system_dir/prepare-openclaw-target.sh"
grep -Fq 'export OPENCLAW_NO_RESPAWN=1' "$system_dir/prepare-openclaw-target.sh"
grep -Fq 'clawmax_cache_lock_wait "$work_root" 10' "$system_dir/prepare-openclaw-target.sh"
echo 'Cache guard tests passed: live leases, legacy cwd, inspection failure, serialized runtime registration, bounded stale-lock refusal and subshell ownership'
