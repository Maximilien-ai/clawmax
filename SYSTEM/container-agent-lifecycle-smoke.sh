#!/usr/bin/env bash
set -euo pipefail

image="${1:?Usage: container-agent-lifecycle-smoke.sh <image> [platform]}"
platform="${2:-linux/amd64}"
container_cli="${CONTAINER_CLI:-docker}"
run_key="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
container_name="clawmax-agent-lifecycle-${run_key}"
volume_name="clawmax-agent-lifecycle-${run_key}"
base_url=''
dashboard_health_elapsed=''
gateway_ready_elapsed=''
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mock_ollama_port="$((19000 + ($$ % 1000)))"
mock_ollama_pid=''

cleanup() {
  if [ -n "$mock_ollama_pid" ]; then
    kill "$mock_ollama_pid" >/dev/null 2>&1 || true
  fi
  "$container_cli" rm -f "$container_name" >/dev/null 2>&1 || true
  "$container_cli" volume rm "$volume_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "container agent lifecycle smoke failed: $*" >&2
  "$container_cli" logs "$container_name" 2>&1 | tail -n 160 >&2 || true
  exit 1
}

start_dashboard() {
  local started_at now elapsed
  started_at="$(date +%s)"
  dashboard_health_elapsed=''
  gateway_ready_elapsed=''
  "$container_cli" run -d \
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
    binding="$("$container_cli" port "$container_name" 3001/tcp 2>/dev/null | head -n 1 || true)"
    [ -n "$binding" ] && break
    sleep 1
  done
  [ -n "$binding" ] || fail 'dashboard port was not published'
  base_url="http://127.0.0.1:${binding##*:}"

  while [ "$(( $(date +%s) - started_at ))" -le 40 ]; do
    now="$(date +%s)"
    elapsed="$((now - started_at))"
    if [ -z "$gateway_ready_elapsed" ] && "$container_cli" logs "$container_name" 2>&1 | grep -F 'gateway authenticated readiness verified' >/dev/null; then
      gateway_ready_elapsed="$elapsed"
    fi
    if curl -fsS --connect-timeout 1 --max-time 2 "$base_url/api/health" >/dev/null 2>&1; then
      dashboard_health_elapsed="$elapsed"
      [ -n "$gateway_ready_elapsed" ] || gateway_ready_elapsed="$elapsed"
      if [ "$dashboard_health_elapsed" -gt 40 ]; then
        fail "dashboard health exceeded 40 seconds (${dashboard_health_elapsed}s)"
      fi
      echo "RC startup timing platform=${platform} dashboard_health=${dashboard_health_elapsed}s gateway_ready=${gateway_ready_elapsed}s"
      return 0
    fi
    sleep 1
  done
  fail 'dashboard health endpoint did not become ready within 40 seconds'
}

stop_dashboard() {
  "$container_cli" rm -f "$container_name" >/dev/null
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

  logs="$("$container_cli" logs "$container_name" 2>&1)"
  spawn_line="$(printf '%s\n' "$logs" | grep -F '[Chat Route] Spawning:' | tail -n 1 || true)"
  [ -n "$spawn_line" ] || fail 'Dashboard did not log the OpenClaw chat invocation'
  if printf '%s\n' "$spawn_line" | grep -F -- ' --local' >/dev/null; then
    fail "Dashboard forced local mode while its gateway was running: $spawn_line"
  fi
}

assert_instance_cli_api() {
  local discovery identity before_active created replay listed unknown after_active
  discovery="$(curl -fsS "$base_url/api/cli/v1/discovery")" || fail 'instance CLI discovery failed'
  printf '%s' "$discovery" | jq -e \
    '.apiVersion == "clawmax.instance/v1"
      and .kind == "InstanceDiscovery"
      and (.instance.id | length) > 0
      and (.instance.dashboardVersion | length) > 0
      and .auth.modes == ["authorization_code_pkce"]' >/dev/null \
    || fail "instance CLI discovery contract was invalid: $discovery"

  identity="$(curl -fsS "$base_url/api/cli/v1/identity")" || fail 'instance CLI identity failed'
  printf '%s' "$identity" | jq -e \
    '.apiVersion == "clawmax.instance/v1"
      and .kind == "Identity"
      and (.actorId | length) > 0
      and (.memberships | length) == 1' >/dev/null \
    || fail "instance CLI identity contract was invalid: $identity"

  before_active="$(curl -fsS "$base_url/api/workspaces/active" | jq -r '.workspace.id')" \
    || fail 'active workspace could not be read before CLI creation'
  created="$(curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    -H 'Idempotency-Key: rc65-image-workspace-create' \
    -d '{"apiVersion":"clawmax.instance/v1","kind":"WorkspaceCreateRequest","name":"RC65 CLI Persistence","idempotencyKey":"rc65-image-workspace-create"}' \
    "$base_url/api/cli/v1/workspaces")" || fail 'instance CLI workspace creation failed'
  printf '%s' "$created" | jq -e \
    '.apiVersion == "clawmax.instance/v1"
      and .kind == "WorkspaceCreateResult"
      and .created == true
      and .workspace.id == "rc65-cli-persistence"' >/dev/null \
    || fail "instance CLI workspace creation contract was invalid: $created"

  replay="$(curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    -H 'Idempotency-Key: rc65-image-workspace-create' \
    -d '{"apiVersion":"clawmax.instance/v1","kind":"WorkspaceCreateRequest","name":"RC65 CLI Persistence","idempotencyKey":"rc65-image-workspace-create"}' \
    "$base_url/api/cli/v1/workspaces")" || fail 'instance CLI workspace replay failed'
  printf '%s' "$replay" | jq -e \
    '.created == false and .workspace.id == "rc65-cli-persistence"' >/dev/null \
    || fail "instance CLI workspace replay was not exact: $replay"

  listed="$(curl -fsS "$base_url/api/cli/v1/workspaces")" || fail 'instance CLI workspace list failed'
  printf '%s' "$listed" | jq -e \
    '[.items[] | select(.id == "rc65-cli-persistence")] | length == 1' >/dev/null \
    || fail "instance CLI workspace was not authorized in list: $listed"
  after_active="$(curl -fsS "$base_url/api/workspaces/active" | jq -r '.workspace.id')" \
    || fail 'active workspace could not be read after CLI creation'
  [ "$before_active" = "$after_active" ] || fail 'CLI workspace creation silently changed the active workspace'

  unknown="$(curl -sS -w '\n%{http_code}\n%{content_type}' "$base_url/api/cli/v1/not-a-route")" \
    || fail 'unknown instance CLI route request failed'
  printf '%s' "$unknown" | head -n 1 | jq -e \
    '.apiVersion == "clawmax.instance/v1" and .kind == "Error" and .error.code == "route_not_found"' >/dev/null \
    || fail "unknown instance CLI route did not return versioned JSON: $unknown"
  [ "$(printf '%s' "$unknown" | tail -n 2 | head -n 1)" = '404' ] \
    || fail "unknown instance CLI route did not return HTTP 404: $unknown"
  printf '%s' "$unknown" | tail -n 1 | grep -F 'application/json' >/dev/null \
    || fail "unknown instance CLI route fell through to HTML: $unknown"
}

assert_instance_cli_persistence() {
  curl -fsS "$base_url/api/cli/v1/workspaces" | jq -e \
    '[.items[] | select(.id == "rc65-cli-persistence" and .name == "RC65 CLI Persistence")] | length == 1' >/dev/null \
    || fail 'instance CLI workspace authorization did not survive restart'
  "$container_cli" exec "$container_name" test -s /app/DATA/.home/.openclaw/clawmax-cli-api.json \
    || fail 'instance CLI idempotency and audit state did not survive restart'
  curl -fsS "$base_url/api/cli/v1/workspaces/default/workflows" | jq -e \
    '.apiVersion == "clawmax.instance/v1"
      and .kind == "WorkflowList"
      and ([.items[] | select(.id == "rc65-morning")] | length) == 1' >/dev/null \
    || fail 'authenticated contextual CLI workflow read failed after restart'
}

assert_populated_fixture() {
  curl -fsS "$base_url/api/health" | jq -e \
    '.ok == true and .readiness.ready == true
      and (.readiness.stores.agents >= 1)
      and (.readiness.stores.templates >= 2)
      and (.readiness.stores.groups >= 1)
      and (.readiness.stores.workflows >= 3)' >/dev/null \
    || fail 'health did not prove populated persistent stores readable'

  curl -fsS "$base_url/api/groups" | jq -e \
    '.groups | any(.name == "RC65 Persistence Group" and .members == ["rc-image-reuse-probe"])' >/dev/null \
    || fail 'persistent group did not survive restart'

  workflows="$(curl -fsS "$base_url/api/workflows")" || fail 'workflow list request failed'
  printf '%s' "$workflows" | jq -e \
    '[.workflows[] | select(.id == "rc65-morning" and .schedule == "30 9 * * *")] | length == 1' >/dev/null \
    || fail '30 9 * * * workflow did not survive restart'
  printf '%s' "$workflows" | jq -e \
    '[.workflows[] | select(.id == "rc65-two-hour" and .schedule == "0 */2 * * *")] | length == 1' >/dev/null \
    || fail '0 */2 * * * workflow did not survive restart'
  printf '%s' "$workflows" | jq -e \
    '[.workflows[] | select(.id == "rc65-invalid-canary" and .schedule == "invalid cron")] | length == 1' >/dev/null \
    || fail 'invalid schedule canary did not remain readable'

  scheduler=''
  for _ in $(seq 1 45); do
    scheduler="$(curl -fsS "$base_url/api/system" | jq -c '.scheduler')" || true
    status="$(printf '%s' "$scheduler" | jq -r '.status // empty' 2>/dev/null || true)"
    [ "$status" != 'running' ] && [ "$status" != 'idle' ] && break
    sleep 1
  done
  printf '%s' "$scheduler" | jq -e \
    '.status == "degraded"
      and ([.failures[] | select(.workflowId == "rc65-invalid-canary")] | length == 1)
      and ([.failures[] | select(.workflowId == "rc65-morning" or .workflowId == "rc65-two-hour")] | length == 0)' >/dev/null \
    || fail "scheduler diagnostics did not isolate the invalid schedule: $scheduler"

  cron_jobs="$("$container_cli" exec "$container_name" openclaw cron list --json --all)" \
    || fail 'OpenClaw cron list failed after populated restart'
  printf '%s' "$cron_jobs" | jq -e \
    '[(.jobs // .)[] | select(.name == "clawmax-rc65-morning-rc-image-reuse-probe")] | length == 1' >/dev/null \
    || fail 'morning cron registration missing or duplicated'
  printf '%s' "$cron_jobs" | jq -e \
    '[(.jobs // .)[] | select(.name == "clawmax-rc65-two-hour-rc-image-reuse-probe")] | length == 1' >/dev/null \
    || fail 'two-hour cron registration missing or duplicated'

  "$container_cli" exec "$container_name" test -s /app/DATA/.home/.openclaw/openclaw.json \
    || fail 'OpenClaw state did not survive restart'
  "$container_cli" exec "$container_name" test -s /app/DATA/.home/.openclaw/state/openclaw.sqlite \
    || fail 'OpenClaw SQLite state did not survive restart'
  "$container_cli" exec "$container_name" sh -c 'find /app/DATA/.home/.openclaw/agents/rc-image-reuse-probe -type f -path "*/sessions/*" -size +0c | grep -q .' \
    || fail 'agent session state did not survive restart'
}

"$container_cli" volume create "$volume_name" >/dev/null
node "$script_dir/mock-ollama-server.mjs" "$mock_ollama_port" >/tmp/clawmax-mock-ollama.log 2>&1 &
mock_ollama_pid=$!
for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:${mock_ollama_port}/api/tags" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${mock_ollama_port}/api/tags" >/dev/null \
  || fail 'mock Ollama server did not become ready'
start_dashboard

assert_instance_cli_api
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

curl -fsS -X POST -H 'Content-Type: application/json' \
  -d '{"name":"RC65 Persistence Group","description":"RC65 populated-state fixture","tags":["acceptance"],"members":["rc-image-reuse-probe"],"channels":[]}' \
  "$base_url/api/groups" | jq -e '.ok == true' >/dev/null \
  || fail 'persistent group was not created'

for workflow_payload in \
  '{"id":"rc65-morning","name":"RC65 Morning","description":"RC65 cron fixture","schedule":"30 9 * * *","timezone":"UTC","enabled":true,"executionMode":"automated","targeting":{"agents":["rc-image-reuse-probe"],"groups":[],"communities":[],"tags":[]},"content":"Reply with the acceptance status."}' \
  '{"id":"rc65-two-hour","name":"RC65 Two Hour","description":"RC65 cron fixture","schedule":"0 */2 * * *","timezone":"UTC","enabled":true,"executionMode":"automated","targeting":{"agents":["rc-image-reuse-probe"],"groups":[],"communities":[],"tags":[]},"content":"Reply with the acceptance status."}' \
  '{"id":"rc65-invalid-canary","name":"RC65 Invalid Canary","description":"RC65 invalid schedule fixture","schedule":"15 3 * * *","timezone":"UTC","enabled":true,"executionMode":"automated","targeting":{"agents":["rc-image-reuse-probe"],"groups":[],"communities":[],"tags":[]},"content":"This schedule must not block startup."}'
do
  curl -fsS -X POST -H 'Content-Type: application/json' -d "$workflow_payload" \
    "$base_url/api/workflows" | jq -e '.id' >/dev/null \
    || fail "persistent workflow was not created: $workflow_payload"
done

"$container_cli" exec "$container_name" node -e \
  'const fs=require("fs");const p="/app/DATA/.home/.openclaw/workspaces/acceptance/WORKFLOWS/rc65-invalid-canary.md";const s=fs.readFileSync(p,"utf8");fs.writeFileSync(p,s.replace(/^schedule:.*$/m,"schedule: invalid cron"));' \
  || fail 'invalid schedule canary could not be staged'

execution_id="$(curl -fsS -X POST -H 'Content-Type: application/json' -d '{}' \
  "$base_url/api/workflows/rc65-morning/trigger" | jq -r '.executionId // empty')"
[ -n "$execution_id" ] || fail 'workflow execution did not start'
execution_status=''
for _ in $(seq 1 120); do
  execution_status="$(curl -fsS "$base_url/api/workflows/rc65-morning/executions/$execution_id" | jq -r '.status // empty')" || true
  [ "$execution_status" = 'completed' ] && break
  [ "$execution_status" = 'failed' ] && fail 'workflow execution failed'
  sleep 1
done
[ "$execution_status" = 'completed' ] || fail "workflow execution did not complete (status=${execution_status:-unknown})"

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
assert_populated_fixture
assert_instance_cli_persistence
assert_gateway_chat

echo "container-agent-lifecycle-smoke.sh: lifecycle, instance CLI, populated persistence, restart, cron, gateway, and <=40s health checks passed for ${platform}"
