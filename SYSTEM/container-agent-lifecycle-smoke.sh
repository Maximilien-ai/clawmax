#!/usr/bin/env bash
set -euo pipefail

image="${1:?Usage: container-agent-lifecycle-smoke.sh <image> [platform]}"
platform="${2:-linux/amd64}"
run_key="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
container_name="clawmax-agent-lifecycle-${run_key}"
volume_name="clawmax-agent-lifecycle-${run_key}"
base_url=''
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mock_ollama_port="$((19000 + ($$ % 1000)))"
mock_ollama_pid=''

cleanup() {
  if [ -n "$mock_ollama_pid" ]; then
    kill "$mock_ollama_pid" >/dev/null 2>&1 || true
  fi
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "container agent lifecycle smoke failed: $*" >&2
  docker logs "$container_name" 2>&1 | tail -n 160 >&2 || true
  exit 1
}

start_dashboard() {
  docker run -d \
    --platform "$platform" \
    --name "$container_name" \
    --add-host host.docker.internal:host-gateway \
    -p 127.0.0.1::3001 \
    -e BYPASS_OAUTH=true \
    -e DASHBOARD_AUTH_MODE=bypass \
    -e DASHBOARD_DEPLOYMENT_KIND=onprem \
    -e CLAWMAX_DATA_ROOT=/app/DATA \
    -e OLLAMA_BASE_URL="http://host.docker.internal:${mock_ollama_port}" \
    -e OLLAMA_API_KEY=ollama-local \
    -e HOME=/app/DATA/.home \
    -e OPENCLAW_WORKSPACE=/app/DATA/.home/.openclaw/workspaces/acceptance \
    -v "$volume_name:/app/DATA" \
    "$image" >/dev/null

  local binding=''
  for _ in $(seq 1 30); do
    binding="$(docker port "$container_name" 3001/tcp 2>/dev/null | head -n 1 || true)"
    [ -n "$binding" ] && break
    sleep 1
  done
  [ -n "$binding" ] || fail 'dashboard port was not published'
  base_url="http://127.0.0.1:${binding##*:}"

  for _ in $(seq 1 90); do
    if curl -fsS --connect-timeout 2 --max-time 5 "$base_url/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  fail 'dashboard health endpoint did not become ready'
}

stop_dashboard() {
  docker rm -f "$container_name" >/dev/null
}

provision_agent() {
  local response
  response="$(curl -fsS --no-buffer --max-time 180 \
    -H 'Content-Type: application/json' \
    -d '{"name":"rc-image-reuse-probe","model":"ollama/qwen2.5:latest","tags":["acceptance-probe","read-only"]}' \
    "$base_url/api/agents/provision")" || fail 'agent provisioning request failed'
  printf '%s' "$response" | grep -F '"type":"error"' >/dev/null && fail "agent provisioning emitted an SSE error: $response"
  printf '%s' "$response" | grep -F '"type":"done","data":"ok"' >/dev/null || fail "agent provisioning did not finish successfully: $response"
}

assert_one_ordered_agent() {
  local response
  response="$(curl -fsS "$base_url/api/agents")" || fail 'agent list request failed'
  printf '%s' "$response" | jq -e \
    '[.agents[] | select(.id == "rc-image-reuse-probe")] as $matches
     | ($matches | length) == 1
       and $matches[0].tags == ["acceptance-probe", "read-only"]' >/dev/null \
    || fail "agent list did not contain exactly one probe with ordered tags: $response"
}

assert_gateway_chat() {
  local response logs spawn_line
  response="$(curl -fsS --no-buffer --max-time 240 \
    -H 'Content-Type: application/json' \
    -d '{"message":"Reply with the acceptance status.","sessionId":"rc-image-gateway-chat"}' \
    "$base_url/api/agents/rc-image-reuse-probe/chat")" || fail 'Dashboard gateway chat request failed'
  printf '%s' "$response" | grep -F 'RC image gateway chat completed through Ollama.' >/dev/null \
    || fail "Dashboard gateway chat did not return the mock model reply: $response"
  printf '%s' "$response" | grep -F '"type":"complete"' >/dev/null \
    || fail "Dashboard gateway chat did not complete: $response"

  logs="$(docker logs "$container_name" 2>&1)"
  spawn_line="$(printf '%s\n' "$logs" | grep -F '[Chat Route] Spawning:' | tail -n 1 || true)"
  [ -n "$spawn_line" ] || fail 'Dashboard did not log the OpenClaw chat invocation'
  if printf '%s\n' "$spawn_line" | grep -F -- ' --local' >/dev/null; then
    fail "Dashboard forced local mode while its gateway was running: $spawn_line"
  fi
}

docker volume create "$volume_name" >/dev/null
node "$script_dir/mock-ollama-server.mjs" "$mock_ollama_port" >/tmp/clawmax-mock-ollama.log 2>&1 &
mock_ollama_pid=$!
for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:${mock_ollama_port}/api/tags" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${mock_ollama_port}/api/tags" >/dev/null \
  || fail 'mock Ollama server did not become ready'
start_dashboard

provision_agent
assert_one_ordered_agent
assert_gateway_chat

delete_response="$(curl -fsS -X DELETE \
  -H 'Content-Type: application/json' \
  -d '{"removeStateDir":true}' \
  "$base_url/api/agents/rc-image-reuse-probe")" || fail 'remove-state request failed'
printf '%s' "$delete_response" | jq -e '.ok == true and (.errors | length) == 0' >/dev/null \
  || fail "remove-state did not prove complete cleanup: $delete_response"

absent_response="$(curl -fsS "$base_url/api/agents")" || fail 'post-removal agent list request failed'
printf '%s' "$absent_response" | jq -e '[.agents[] | select(.id == "rc-image-reuse-probe")] | length == 0' >/dev/null \
  || fail "removed agent remained visible: $absent_response"

provision_agent
assert_one_ordered_agent

agent_template='{"name":"RC Image Agent Persistence","type":"agent","version":"1.0.0","agents":[{"id":"persistent-agent-template","role":"image persistence probe"}]}'
org_template='{"name":"RC Image Organization Persistence","type":"organization","version":"1.0.0","agents":[{"id":"persistent-org-agent","role":"image persistence probe"}]}'

curl -fsS -X PUT -H 'Content-Type: application/json' -d "$agent_template" \
  "$base_url/api/templates/agents/rc-image-agent-persistence" \
  | jq -e '.ok == true' >/dev/null || fail 'custom agent template was not saved'
curl -fsS -X PUT -H 'Content-Type: application/json' -d "$org_template" \
  "$base_url/api/templates/organizations/rc-image-organization-persistence" \
  | jq -e '.ok == true' >/dev/null || fail 'custom organization template was not saved'

# Replace the runtime container while retaining only its mounted data volume.
stop_dashboard
start_dashboard

curl -fsS "$base_url/api/templates/agents/rc-image-agent-persistence" \
  | jq -e '.type == "agent" and .name == "RC Image Agent Persistence"' >/dev/null \
  || fail 'custom agent template did not survive image replacement'
curl -fsS "$base_url/api/templates/organizations/rc-image-organization-persistence" \
  | jq -e '.type == "organization" and .name == "RC Image Organization Persistence"' >/dev/null \
  || fail 'custom organization template did not survive image replacement'
assert_one_ordered_agent

echo 'container-agent-lifecycle-smoke.sh: lifecycle and persistence checks passed'
