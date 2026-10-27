#!/usr/bin/env bash
# Dedicated, disposable Podman VM. Its workspace clones GitHub and runs setup;
# no host checkout, credentials or existing on-prem Podman VM is reused.
set -euo pipefail
system_dir="$(cd "$(dirname "$0")" && pwd)"
operation="${1:-start}"
machine="${CLAWMAX_TEST_MACHINE:-clawmax-test}"
state_root="${CLAWMAX_TEST_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/clawmax-source-test}"
owned_dir="$state_root/$machine"
marker="$owned_dir/owner"
[[ "$machine" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Invalid test VM name' >&2; exit 1; }
case "$operation" in start|status|logs|stop|remove) ;; *) echo 'Usage: ./SYSTEM/test-clean-install.sh [start|status|logs|stop|remove]' >&2; exit 1 ;; esac
command -v podman >/dev/null || { echo 'Install Podman with machine support first.' >&2; exit 1; }
exists() { podman machine inspect "$machine" >/dev/null 2>&1; }
owned() { [ -f "$marker" ] && [ "$(cat "$marker")" = clawmax-clean-source-v1 ]; }
require_owned() { owned || { echo "Refusing to manage $machine: this helper did not create it." >&2; exit 1; }; }
active_machines() { podman machine list --format '{{.Name}} {{.Running}}' | awk '$2 == "true" { sub(/\*$/, "", $1); print $1 }'; }
running() { active_machines | grep -Fxq "$machine"; }
export CLAWMAX_TEST_CONNECTION="$machine"
export CLAWMAX_TEST_CONTAINER="${CLAWMAX_TEST_CONTAINER:-clawmax-test}"
inner="$system_dir/containers/source-test/container.sh"
case "$operation" in
  stop)
    require_owned
    if exists && running; then
      if podman --connection "$machine" container exists "$CLAWMAX_TEST_CONTAINER"; then "$inner" stop; fi
      podman machine stop "$machine"
    else echo "Test VM $machine is already stopped."; fi
    exit 0 ;;
  remove)
    require_owned
    if exists; then podman machine rm --force "$machine"; fi
    rm -f "$marker"
    rmdir "$owned_dir/share" "$owned_dir" 2>/dev/null || true
    echo "Removed test VM $machine and all of its test data."
    exit 0 ;;
  status|logs)
    require_owned
    if ! exists || ! running; then echo "Test VM $machine is stopped. Start it with $0"; exit 0; fi
    if [ "$operation" = status ]; then echo "$machine: running"; fi
    exec "$inner" "$operation" ;;
esac
command -v curl >/dev/null || { echo 'curl is required for readiness checks.' >&2; exit 1; }
for port in "${CLAWMAX_TEST_API_PORT:-3008}" "${CLAWMAX_TEST_UI_PORT:-5181}"; do
  case "$port" in ''|*[!0-9]*) echo 'Ports must be integers' >&2; exit 1 ;; esac
  if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then echo 'Use ports 1024–65535' >&2; exit 1; fi
done
other_active="$(active_machines | awk -v selected="$machine" '$0 != selected')"
if [ -n "$other_active" ]; then
  echo "Cannot start $machine while another Podman VM is active: $other_active" >&2
  echo 'Podman supports one active managed VM. Stop that VM explicitly only when its workloads can be interrupted; this helper will not stop it.' >&2
  exit 1
fi
previous_default="$(podman system connection list --format '{{if .Default}}{{.Name}}{{end}}' | sed '/^$/d')"
restore_default() { [ -z "$previous_default" ] || podman system connection default "$previous_default" >/dev/null; }
if exists; then
  require_owned
else
  if [ -e "$owned_dir" ] && ! owned; then echo "Unowned test-state directory: $owned_dir" >&2; exit 1; fi
  mkdir -p "$owned_dir/share"
  chmod 700 "$owned_dir"
  printf '%s\n' clawmax-clean-source-v1 > "$marker"
  echo 'Creating dedicated test VM (2 CPUs, 10 GiB RAM, 30 GiB disk). First source setup may take 20–30 minutes including downloads.'
  # Explicit mount replaces Podman's broad default host-directory shares with
  # one empty, read-only task directory. Product code is cloned inside the VM.
  if ! podman machine init --cpus 2 --memory 10240 --disk-size 30 \
    --volume "$owned_dir/share:/mnt/clawmax-test:ro" "$machine"; then
    restore_default
    echo 'Test VM creation failed. No existing VM was stopped.' >&2; exit 1
  fi
  restore_default
fi
if ! running; then
  if ! podman machine start "$machine"; then restore_default; exit 1; fi
  restore_default
fi
echo "Dedicated VM: $machine (all container commands use its explicit connection)."
echo "Shutdown VM: $0 stop"
echo "Delete VM and ALL test data: $0 remove"
exec "$inner" start
