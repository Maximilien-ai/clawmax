#!/usr/bin/env bash
# Clone current GitHub sources and exercise the installer in a disposable Podman
# container. No host checkout, credentials, prepared runtime or ClawMax image.
set -euo pipefail
system_dir="$(cd "$(dirname "$0")/../.." && pwd)"
launcher="$system_dir/test-clean-install.sh"
# Always target this test VM, never the user's active/default connection.
podman() { command podman --connection "${CLAWMAX_TEST_CONNECTION:?}" "$@"; }
name="${CLAWMAX_TEST_CONTAINER:-clawmax-test}"
volume="${name}-data"
image=localhost/clawmax-source-test:node-26.12.1
api_port="${CLAWMAX_TEST_API_PORT:-3008}"
ui_port="${CLAWMAX_TEST_UI_PORT:-5181}"
operation="${1:-start}"
owner=io.clawmax.clean-source-test
for port in "$api_port" "$ui_port"; do
  case "$port" in ''|*[!0-9]*) echo 'Ports must be integers' >&2; exit 1 ;; esac
  if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then echo 'Use ports 1024–65535' >&2; exit 1; fi
done
[[ "$name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Invalid test container name' >&2; exit 1; }
[ "$api_port" != "$ui_port" ] || { echo 'API/UI ports must differ' >&2; exit 1; }
case "$operation" in start|status|logs|stop|remove) ;; *) echo 'Usage: ./SYSTEM/test-clean-install.sh [start|status|logs|stop|remove]' >&2; exit 1 ;; esac
type -P podman >/dev/null || { echo 'Install and start Podman first.' >&2; exit 1; }
podman info >/dev/null
exists() { podman container exists "$name"; }
assert_owned() {
  [ "$(podman inspect --format "{{index .Config.Labels \"$owner\"}}" "$name")" = true ] || {
    echo "Refusing to manage $name: it is not a ClawMax source-test container." >&2; exit 1;
  }
}
case "$operation" in
  logs) assert_owned; exec podman logs --follow "$name" ;;
  stop) assert_owned; exec podman stop --time 20 "$name" ;;
  remove)
    if exists; then assert_owned; podman rm --force "$name"; fi
    if podman volume exists "$volume"; then
      [ "$(podman volume inspect --format "{{index .Labels \"$owner\"}}" "$volume")" = true ] || { echo 'Refusing to remove an unowned volume' >&2; exit 1; }
      podman volume rm "$volume"
    fi
    exit 0 ;;
  status)
    assert_owned
    podman ps -a --filter "name=^${name}$" --format '{{.Names}}: {{.Status}}'
    podman exec "$name" sh -c 'printf "Stage: "; cat /home/node/stage; printf "Source: "; cat /home/node/source-sha' || true
    echo "Dashboard: http://127.0.0.1:$ui_port"
    exit 0 ;;
esac

if exists; then
  assert_owned
  echo "Resuming $name with its recorded source/data. For a fresh latest-source clone, remove it first."
  # Port bindings belong to the existing container; never silently change them.
  for mapping in "$api_port/tcp" "$ui_port/tcp"; do
    podman port "$name" "$mapping" >/dev/null || { echo 'Use the original port overrides for this container.' >&2; exit 1; }
  done
  podman start "$name" >/dev/null
else
  echo 'Building a plain Node/tools test base. First cold setup may take 10–20 minutes after pulling/building the base.'
  podman build --tag "$image" --file "$system_dir/containers/source-test/Containerfile" "$system_dir/containers/source-test"
  if podman volume exists "$volume"; then
    echo "Volume $volume already exists. Remove the old test explicitly before a fresh clone." >&2; exit 1
  fi
  podman volume create --label "$owner=true" "$volume" >/dev/null
  podman run --detach --name "$name" --label "$owner=true" \
    --cpus "${CLAWMAX_TEST_CPUS:-2}" --memory "${CLAWMAX_TEST_MEMORY:-4g}" \
    --security-opt no-new-privileges --cap-drop all \
    --publish "127.0.0.1:$api_port:$api_port" --publish "127.0.0.1:$ui_port:$ui_port" \
    --volume "$volume:/home/node:U" \
    --env "DASHBOARD_PORT=$api_port" --env "DASHBOARD_CLIENT_PORT=$ui_port" \
    --env "CLAWMAX_TEST_REF=${CLAWMAX_TEST_REF:-main}" \
    --env "CLAWMAX_TEST_REPOSITORY=${CLAWMAX_TEST_REPOSITORY:-https://github.com/Maximilien-ai/clawmax.git}" \
    --env NODE_OPTIONS=--max-old-space-size=2560 "$image" >/dev/null
fi
echo "Logs: $launcher logs"
echo "Shutdown test VM: $launcher stop"
echo "Remove test VM and ALL test data: $launcher remove"
timeout="${CLAWMAX_TEST_READY_TIMEOUT:-1800}"
case "$timeout" in ''|*[!0-9]*) echo 'Readiness timeout must be seconds' >&2; exit 1 ;; esac
deadline=$((SECONDS + timeout))
next_notice=$SECONDS
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ "$(podman inspect --format '{{.State.Running}}' "$name")" != true ]; then
    podman logs --tail 50 "$name"
    echo 'Clean-source install failed; container/data retained for diagnosis.' >&2; exit 1
  fi
  if podman exec "$name" test -f /home/node/ready >/dev/null 2>&1 \
    && curl --silent --fail --max-time 3 "http://127.0.0.1:$api_port/api/health" >/dev/null \
    && curl --silent --fail --max-time 3 "http://127.0.0.1:$ui_port/api/health" >/dev/null; then
    echo "READY: http://127.0.0.1:$ui_port — container keeps running after this command exits."
    podman exec "$name" cat /home/node/source-sha
    if [ "${CLAWMAX_TEST_OPEN_BROWSER:-true}" = true ]; then
      if command -v open >/dev/null; then open "http://127.0.0.1:$ui_port" || true
      elif command -v xdg-open >/dev/null; then xdg-open "http://127.0.0.1:$ui_port" >/dev/null 2>&1 || true; fi
    fi
    exit 0
  fi
  if [ "$SECONDS" -ge "$next_notice" ]; then
    echo 'Waiting for source clone/setup/Gateway/Dashboard; use the logs command above for progress.'
    next_notice=$((SECONDS + 30))
  fi
  sleep 2
done
echo "Readiness timed out. Inspect $launcher logs; test container/data retained." >&2
exit 1
