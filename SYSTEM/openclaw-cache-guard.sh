#!/usr/bin/env bash
# Shared by the local preparer and wrapper. Lock conflicts fail closed; never
# delete another process's lock or stop an active runtime to rebuild its files.
CLAWMAX_CACHE_GATE=""
CLAWMAX_CACHE_GATE_OWNER=""
clawmax_cache_unlock() {
  if [ -n "$CLAWMAX_CACHE_GATE" ] && [ "$CLAWMAX_CACHE_GATE_OWNER" = "${BASHPID:-$$}:${BASH_SUBSHELL:-0}" ]; then
    rmdir "$CLAWMAX_CACHE_GATE" 2>/dev/null || true
    CLAWMAX_CACHE_GATE=""
  fi
}
clawmax_cache_lock() {
  local root="$1"
  if ! mkdir "$root/.runtime-gate" 2>/dev/null; then
    echo 'OpenClaw cache is busy or has an interrupted preparation lock. Retry after its owner exits; inspect stale locks manually.' >&2
    return 1
  fi
  CLAWMAX_CACHE_GATE="$root/.runtime-gate"
  CLAWMAX_CACHE_GATE_OWNER="${BASHPID:-$$}:${BASH_SUBSHELL:-0}"
  trap clawmax_cache_unlock EXIT
}
clawmax_cache_assert_idle() {
  local root="$1" lease pid listing
  for lease in "$root"/.runtime-leases/*; do
    [ -e "$lease" ] || continue
    pid="${lease##*/}"
    case "$pid" in ''|*[!0-9]*) echo 'Invalid OpenClaw runtime lease; manual review required.' >&2; return 1 ;; esac
    if kill -0 "$pid" 2>/dev/null; then
      echo 'OpenClaw runtime cache is in use. Stop its runtime gracefully before rebuilding; no files were changed.' >&2
      return 1
    fi
  done
  # Compatibility with gateways started by the previous, unleased wrapper.
  # lsof lists the old cwd name even when that directory has been replaced.
  if ! command -v lsof >/dev/null 2>&1; then
    echo 'lsof is required to rule out legacy runtime users before cache mutation.' >&2
    return 1
  fi
  listing="$(lsof -nP -d cwd -Fn 2>/dev/null)" || {
    echo 'Cannot inspect runtime working directories; refusing cache mutation.' >&2
    return 1
  }
  if printf '%s\n' "$listing" | awk -v root="$root/src" '
    substr($0,1,1)=="n" { p=substr($0,2); if(p==root || index(p,root "/")==1) found=1 }
    END { exit !found }'; then
    echo 'A legacy process holds this OpenClaw source directory. Stop it gracefully before rebuilding.' >&2
    return 1
  fi
}
clawmax_cache_register_runtime() {
  local root="$1"
  mkdir -p -m 700 "$root/.runtime-leases"
  # exec retains this PID; dead entries are harmless and PID reuse fails closed.
  : > "$root/.runtime-leases/$$"
}
