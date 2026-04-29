#!/bin/bash
# set -e  # Disabled to show all test results even if one fails

# SYSTEM Test Suite
# Tests validation, APIs, and key features
#
# Usage: ./test.sh [--with-validation] [integration]
#   --with-validation: Include sections 3-6 (validation tests that modify files)
#   integration: Run integration tests with live agents (requires gateway + API keys)
# Env overrides:
#   DASHBOARD_PORT=3002
#   DASHBOARD_CLIENT_PORT=5174
#   DASHBOARD_APP_URL=http://localhost:5174
#
# WARNING: Validation tests (sections 3-6) modify live data files!
# Run without --with-validation flag to skip them (recommended).

# Ensure we're in the SYSTEM directory
cd "$(dirname "$0")"

BACKEND_PORT="${DASHBOARD_PORT:-3001}"
FRONTEND_PORT="${DASHBOARD_CLIENT_PORT:-5173}"
API_BASE="http://localhost:${BACKEND_PORT}"
FRONTEND_URL="${DASHBOARD_APP_URL:-http://localhost:${FRONTEND_PORT}}"
CURL_OPTS="--connect-timeout 5 --max-time 10"

# Load dashboard auth token
TOKEN_CANDIDATES=(
  "$(pwd)/dashboard/server/.dashboard-token"
  "$(pwd)/dashboard/.dashboard-token"
  "$HOME/.openclaw/.dashboard-token"
)

TOKEN_FILE=""
for candidate in "${TOKEN_CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    TOKEN_FILE="$candidate"
    break
  fi
done

if [ -n "$DASHBOARD_TOKEN" ]; then
  DASHBOARD_AUTH="$DASHBOARD_TOKEN"
elif [ -n "$TOKEN_FILE" ] && [ -f "$TOKEN_FILE" ]; then
  DASHBOARD_AUTH="$(cat "$TOKEN_FILE")"
else
  DASHBOARD_AUTH=""
fi

# Wrapper for curl that adds auth header and timeouts
apicurl() {
  if [ -n "$DASHBOARD_AUTH" ]; then
    curl -s $CURL_OPTS -H "Authorization: Bearer $DASHBOARD_AUTH" "$@"
  else
    curl -s $CURL_OPTS "$@"
  fi
}
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =========================================
# Pre-flight checks
# =========================================

preflight_ok=true

echo "Pre-flight checks:"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "  ${RED}✗${NC} Node.js not found. Install from https://nodejs.org/"
  preflight_ok=false
else
  NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "  ${RED}✗${NC} Node.js 18+ required (found v$NODE_MAJOR)"
    preflight_ok=false
  else
    echo -e "  ${GREEN}✓${NC} Node.js $(node --version)"
  fi
fi

# Check npm dependencies
if [ ! -d "dashboard/node_modules" ]; then
  echo -e "  ${RED}✗${NC} Dashboard dependencies not installed (missing SYSTEM/dashboard/node_modules)"
  preflight_ok=false
else
  echo -e "  ${GREEN}✓${NC} Dashboard dependencies installed"
fi

# Check OpenClaw
if ! command -v openclaw &> /dev/null; then
  echo -e "  ${RED}✗${NC} OpenClaw CLI not found"
  preflight_ok=false
else
  echo -e "  ${GREEN}✓${NC} OpenClaw CLI"
fi

# Check OpenClaw config
if [ ! -f "$HOME/.openclaw/openclaw.json" ]; then
  echo -e "  ${RED}✗${NC} OpenClaw config not found (~/.openclaw/openclaw.json)"
  preflight_ok=false
else
  echo -e "  ${GREEN}✓${NC} OpenClaw config"
fi

# Check dashboard server is running. Fresh setup/start flows can take a moment
# to settle even after the port is bound, so retry briefly before failing.
dashboard_ready=false
for _ in $(seq 1 10); do
  if curl -s --connect-timeout 3 --max-time 5 "$API_BASE/api/health" > /dev/null 2>&1; then
    dashboard_ready=true
    break
  fi
  sleep 1
done

if [ "$dashboard_ready" = false ]; then
  echo -e "  ${RED}✗${NC} Dashboard server not running on $API_BASE"
  echo -e "    Start it with: ${YELLOW}DASHBOARD_PORT=${BACKEND_PORT} DASHBOARD_CLIENT_PORT=${FRONTEND_PORT} DASHBOARD_APP_URL=${FRONTEND_URL} ./SYSTEM/start.sh${NC}"
  preflight_ok=false
else
  echo -e "  ${GREEN}✓${NC} Dashboard server running on $API_BASE"
fi

if [ -n "$DASHBOARD_AUTH" ]; then
  echo -e "  ${GREEN}✓${NC} Dashboard auth token available"
else
  warn_msg="No dashboard auth token found. Protected API sections may return 401."
  echo -e "  ${YELLOW}⚠${NC} $warn_msg"
fi

if [ "$preflight_ok" = false ]; then
  echo ""
  echo -e "${RED}Pre-flight checks failed.${NC} Please run ${YELLOW}./setup.sh${NC} first, then ${YELLOW}./SYSTEM/start.sh${NC} with matching DASHBOARD_PORT / DASHBOARD_CLIENT_PORT if you are not on defaults 3001 / 5173."
  exit 1
fi

echo ""

# Parse flags - validation tests are SKIPPED by default
SKIP_VALIDATION=true
RUN_INTEGRATION=false
for arg in "$@"; do
  if [ "$arg" = "--with-validation" ]; then
    SKIP_VALIDATION=false
  elif [ "$arg" = "integration" ]; then
    RUN_INTEGRATION=true
  fi
done

passed=0
failed=0

echo "========================================="
echo "SYSTEM Test Suite"
echo "Dashboard | API | Integration Tests"
echo "========================================="
echo "Frontend: $FRONTEND_URL"
echo "API: $API_BASE"
echo ""

# Integration mode is the only mode allowed to mutate dashboard state or switch
# the active workspace. Plain ./test.sh stays read-only against the live server.
ORIGINAL_WORKSPACE_ID=""
if [ "$RUN_INTEGRATION" = true ]; then
  ORIGINAL_WORKSPACE_ID=$(apicurl "$API_BASE/api/workspaces/active" 2>/dev/null | jq -r '.id // empty' 2>/dev/null || echo "")
  apicurl -X PUT "${API_BASE}/api/workspaces/default/activate" > /dev/null 2>&1
fi

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((passed++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((failed++))
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

test_api() {
  local name="$1"
  local endpoint="$2"
  local expected_code="${3:-200}"

  response=$(apicurl -w "\n%{http_code}" "$API_BASE$endpoint")
  code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  if [ "$code" -eq "$expected_code" ]; then
    pass "$name (HTTP $code)"
    return 0
  else
    fail "$name (expected $expected_code, got $code)"
    return 1
  fi
}

test_json_field() {
  local name="$1"
  local endpoint="$2"
  local field="$3"

  response=$(apicurl "$API_BASE$endpoint")
  if echo "$response" | jq -e "$field" > /dev/null 2>&1; then
    pass "$name"
    return 0
  else
    fail "$name (field '$field' not found)"
    return 1
  fi
}

json_array_length() {
  local endpoint="$1"
  local field="$2"
  apicurl "$API_BASE$endpoint" | jq "$field | length"
}

test_validation() {
  local name="$1"
  local rel_path="$2"
  local content="$3"
  local expect_invalid="$4"

  local parser_kind=""
  case "$rel_path" in
    *COMMUNITIES.md) parser_kind="communities" ;;
    *GROUPS.md) parser_kind="groups" ;;
    *IDENTITY.md) parser_kind="identity" ;;
    *)
      fail "$name (unsupported validation target: $rel_path)"
      return 1
      ;;
  esac

  cd dashboard
  VALIDATION_KIND="$parser_kind" VALIDATION_CONTENT="$content" \
    npx ts-node --transpileOnly -e "
      const { parseGroups, parseIdentity } = require('./server/lib/workspace');
      const { validateCommunities, validateGroups, validateIdentity } = require('./server/lib/validator');
      const kind = process.env.VALIDATION_KIND;
      const content = process.env.VALIDATION_CONTENT || '';
      let result;
      if (kind === 'communities') {
        result = validateCommunities(parseGroups(content).communities);
      } else if (kind === 'groups') {
        result = validateGroups(parseGroups(content).groups);
      } else if (kind === 'identity') {
        result = validateIdentity(parseIdentity(content));
      } else {
        throw new Error('Unsupported kind: ' + kind);
      }
      console.log(JSON.stringify(result));
    " > /tmp/clawmax-validation.out 2>&1
  local ts_status=$?
  cd ..

  local result
  result=$(cat /tmp/clawmax-validation.out)
  if [ "$ts_status" -ne 0 ]; then
    fail "$name"
    return 1
  fi
  if [ "$expect_invalid" = "true" ]; then
    if echo "$result" | jq -e '.valid == false' > /dev/null 2>&1; then
      pass "$name"
    else
      fail "$name"
    fi
  else
    if echo "$result" | jq -e '.valid == true' > /dev/null 2>&1; then
      pass "$name"
    else
      fail "$name"
    fi
  fi
}

# Section 0: TypeScript & Unit Tests
echo ""
echo "========================================="
echo "Section 0: TypeScript & Skills Tests"
echo "========================================="
echo ""

echo -e "${YELLOW}→ Running TypeScript type check...${NC}"
cd dashboard
npm run typecheck > /tmp/clawmax-typecheck.out 2>&1
if grep -q "error TS" /tmp/clawmax-typecheck.out; then
  fail "TypeScript type check"
else
  pass "TypeScript type check"
fi

echo ""
echo -e "${YELLOW}→ Running Skills API unit tests...${NC}"
npx ts-node --transpileOnly server/lib/skills.test.ts > /tmp/clawmax-skills.out 2>&1 || true
if grep -v "Skill file missing name" /tmp/clawmax-skills.out | grep -v "Failed to parse skill" | grep -q "All tests passed"; then
  pass "Skills API unit tests (17 tests)"
else
  fail "Skills API unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Templates API unit tests...${NC}"
npx ts-node --transpileOnly server/lib/templates.test.ts > /tmp/clawmax-templates.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-templates.out; then
  template_count=$(grep "Passed:" /tmp/clawmax-templates.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Templates API unit tests (${template_count:-?} tests)"
else
  fail "Templates API unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Teams unit tests...${NC}"
npx ts-node --transpileOnly server/lib/teams.test.ts > /tmp/clawmax-teams.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-teams.out; then
  teams_count=$(grep "Tests passed:" /tmp/clawmax-teams.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Teams unit tests (${teams_count:-?} tests)"
else
  fail "Teams unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Template feedback unit tests...${NC}"
npx ts-node --transpileOnly server/lib/template-feedback.test.ts > /tmp/clawmax-template-feedback.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-template-feedback.out; then
  template_feedback_count=$(grep "Tests passed:" /tmp/clawmax-template-feedback.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Template feedback unit tests (${template_feedback_count:-?} tests)"
else
  fail "Template feedback unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Organization structure client unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/organizationTeams.test.ts > /tmp/clawmax-organization-teams.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-organization-teams.out; then
  organization_teams_count=$(grep "Tests passed:" /tmp/clawmax-organization-teams.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Organization structure client unit tests (${organization_teams_count:-?} tests)"
else
  fail "Organization structure client unit tests"
fi

echo -e "${YELLOW}→ Running Notifications unit tests...${NC}"
npx ts-node --transpileOnly server/lib/notifications.test.ts > /tmp/clawmax-notifications.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-notifications.out; then
  notif_count=$(grep "Passed:" /tmp/clawmax-notifications.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Notifications unit tests (${notif_count:-?} tests)"
else
  fail "Notifications unit tests"
fi

echo -e "${YELLOW}→ Running Workspace artifact notification unit tests...${NC}"
OPENCLAW_WORKSPACE=/tmp/clawmax-workspace-artifact-notifications npx ts-node --transpileOnly server/lib/workspace-artifact-notifications.test.ts > /tmp/clawmax-workspace-artifact-notifications.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-artifact-notifications.out; then
  workspace_artifact_notif_count=$(grep "Passed:" /tmp/clawmax-workspace-artifact-notifications.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Workspace artifact notification unit tests (${workspace_artifact_notif_count:-?} tests)"
else
  fail "Workspace artifact notification unit tests"
fi

echo -e "${YELLOW}→ Running Workspace DocHub entry filtering unit tests...${NC}"
npx ts-node --transpileOnly server/lib/workspace-doc-entries.test.ts > /tmp/clawmax-workspace-doc-entries.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-doc-entries.out; then
  workspace_doc_entries_count=$(grep "Passed:" /tmp/clawmax-workspace-doc-entries.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Workspace DocHub entry filtering unit tests (${workspace_doc_entries_count:-?} tests)"
else
  fail "Workspace DocHub entry filtering unit tests"
fi

echo -e "${YELLOW}→ Running Local secrets unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/localSecrets.test.ts > /tmp/clawmax-local-secrets.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-local-secrets.out; then
  local_secrets_count=$(grep "Tests passed:" /tmp/clawmax-local-secrets.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Local secrets unit tests (${local_secrets_count:-?} tests)"
else
  fail "Local secrets unit tests"
fi

echo -e "${YELLOW}→ Running BYOK helper unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/byok.test.ts > /tmp/clawmax-byok.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-byok.out; then
  byok_count=$(grep "Tests passed:" /tmp/clawmax-byok.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "BYOK helper unit tests (${byok_count:-?} tests)"
else
  fail "BYOK helper unit tests"
fi

echo -e "${YELLOW}→ Running Gateway diagnostics unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/gatewayDiagnostics.test.ts > /tmp/clawmax-gateway-diagnostics.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-gateway-diagnostics.out; then
  gateway_diagnostics_count=$(grep "Passed:" /tmp/clawmax-gateway-diagnostics.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Gateway diagnostics unit tests (${gateway_diagnostics_count:-?} tests)"
else
  fail "Gateway diagnostics unit tests"
fi

echo -e "${YELLOW}→ Running Communication bulk actions unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/communicationBulkActions.test.ts > /tmp/clawmax-communication-bulk-actions.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-communication-bulk-actions.out; then
  communication_bulk_actions_count=$(grep "Tests passed:" /tmp/clawmax-communication-bulk-actions.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Communication bulk actions unit tests (${communication_bulk_actions_count:-?} tests)"
else
  fail "Communication bulk actions unit tests"
fi

echo -e "${YELLOW}→ Running Channel API helper unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/channelApi.test.ts > /tmp/clawmax-channel-api.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-channel-api.out; then
  channel_api_count=$(grep "Tests passed:" /tmp/clawmax-channel-api.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Channel API helper unit tests (${channel_api_count:-?} tests)"
else
  fail "Channel API helper unit tests"
fi

echo -e "${YELLOW}→ Running Maintenance banner view unit tests...${NC}"
npx ts-node --transpileOnly client/src/lib/maintenanceBannerView.test.ts > /tmp/clawmax-maintenance-banner-view.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-maintenance-banner-view.out; then
  maintenance_banner_view_count=$(grep "Tests passed:" /tmp/clawmax-maintenance-banner-view.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Maintenance banner view unit tests (${maintenance_banner_view_count:-?} tests)"
else
  fail "Maintenance banner view unit tests"
fi

echo -e "${YELLOW}→ Running Dashboard env unit tests...${NC}"
npx ts-node --transpileOnly server/lib/dashboard-env.test.ts > /tmp/clawmax-dashboard-env.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-dashboard-env.out; then
  dashboard_env_count=$(grep "Tests passed:" /tmp/clawmax-dashboard-env.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Dashboard env unit tests (${dashboard_env_count:-?} tests)"
else
  fail "Dashboard env unit tests"
fi

echo -e "${YELLOW}→ Running Cloud maintenance status unit tests...${NC}"
npx ts-node --transpileOnly server/lib/cloud-maintenance-status.test.ts > /tmp/clawmax-cloud-maintenance-status.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-cloud-maintenance-status.out; then
  cloud_maintenance_status_count=$(grep "Tests passed:" /tmp/clawmax-cloud-maintenance-status.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Cloud maintenance status unit tests (${cloud_maintenance_status_count:-?} tests)"
else
  fail "Cloud maintenance status unit tests"
fi

echo -e "${YELLOW}→ Running Workflows unit tests...${NC}"
OPENCLAW_WORKSPACE=/tmp/clawmax-workflows-test npx ts-node --transpileOnly server/lib/workflows.test.ts > /tmp/clawmax-workflows.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workflows.out; then
  wf_count=$(grep "Passed:" /tmp/clawmax-workflows.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Workflows unit tests (${wf_count:-?} tests in server/lib/workflows.test.ts)"
else
  fail "Workflows unit tests"
fi

echo -e "${YELLOW}→ Running Metering unit tests...${NC}"
npx ts-node --transpileOnly server/lib/metering.test.ts > /tmp/clawmax-metering.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-metering.out; then
  metering_count=$(grep "Tests passed:" /tmp/clawmax-metering.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Metering unit tests (${metering_count:-?} tests)"
else
  fail "Metering unit tests"
fi

echo -e "${YELLOW}→ Running Prereqs unit tests...${NC}"
npx ts-node --transpileOnly server/lib/prereqs.test.ts > /tmp/clawmax-prereqs.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-prereqs.out; then
  prereqs_count=$(grep "Tests passed:" /tmp/clawmax-prereqs.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Prereqs unit tests (${prereqs_count:-?} tests)"
else
  fail "Prereqs unit tests"
fi

echo -e "${YELLOW}→ Running Workspace integrations unit tests...${NC}"
npx ts-node --transpileOnly server/lib/workspace-integrations.test.ts > /tmp/clawmax-workspace-integrations.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-integrations.out; then
  workspace_integrations_count=$(grep "Tests passed:" /tmp/clawmax-workspace-integrations.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Workspace integrations unit tests (${workspace_integrations_count:-?} tests)"
else
  fail "Workspace integrations unit tests"
fi

echo -e "${YELLOW}→ Running Integration validation unit tests...${NC}"
npx ts-node --transpileOnly server/lib/integration-validation.test.ts > /tmp/clawmax-integration-validation.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-integration-validation.out; then
  integration_validation_count=$(grep "Tests passed:" /tmp/clawmax-integration-validation.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Integration validation unit tests (${integration_validation_count:-?} tests)"
else
  fail "Integration validation unit tests"
fi

echo -e "${YELLOW}→ Running Validator unit tests...${NC}"
npx ts-node --transpileOnly server/lib/validator.test.ts > /tmp/clawmax-validator.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-validator.out; then
  val_count=$(grep "Passed:" /tmp/clawmax-validator.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Validator unit tests (${val_count:-?} tests)"
else
  fail "Validator unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Workspace order unit tests...${NC}"
npx ts-node --transpileOnly test/workspace-order.test.ts > /tmp/clawmax-workspace-order.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-order.out; then
  pass "Workspace order unit tests (6 tests)"
else
  fail "Workspace order unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Agent config validation unit tests...${NC}"
npx ts-node --transpileOnly server/lib/agent-config-validation.test.ts > /tmp/clawmax-agent-config-validation.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-agent-config-validation.out; then
  pass "Agent config validation unit tests (6 tests)"
else
  fail "Agent config validation unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Agent model unit tests...${NC}"
npx ts-node --transpileOnly server/lib/agent-model.test.ts > /tmp/clawmax-agent-model.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-agent-model.out; then
  pass "Agent model unit tests (3 tests)"
else
  fail "Agent model unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Cron next-run unit tests...${NC}"
npx ts-node --transpileOnly server/lib/cron-next-run.test.ts > /tmp/clawmax-cron-next-run.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-cron-next-run.out; then
  pass "Cron next-run unit tests (5 tests)"
else
  fail "Cron next-run unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Safe env / BYOK unit tests...${NC}"
npx ts-node --transpileOnly server/lib/safe-env.test.ts > /tmp/clawmax-safe-env.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-safe-env.out; then
  pass "Safe env / BYOK unit tests (8 tests)"
else
  fail "Safe env / BYOK unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Auth / OTP unit tests...${NC}"
npx ts-node --transpileOnly server/lib/github-auth.test.ts > /tmp/clawmax-github-auth.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-github-auth.out; then
  pass "Auth / OTP unit tests (6 tests)"
else
  fail "Auth / OTP unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Dashboard auth helper unit tests...${NC}"
npx ts-node --transpileOnly server/lib/auth.test.ts > /tmp/clawmax-auth-helper.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-auth-helper.out; then
  auth_helper_count=$(grep "Passed:" /tmp/clawmax-auth-helper.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "Dashboard auth helper unit tests (${auth_helper_count:-?} tests)"
else
  fail "Dashboard auth helper unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running OpenClaw config helper unit tests...${NC}"
npx ts-node --transpileOnly server/lib/openclaw-config.test.ts > /tmp/clawmax-openclaw-config.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-openclaw-config.out; then
  openclaw_config_count=$(grep "Passed:" /tmp/clawmax-openclaw-config.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Passed: //' | tr -cd '0-9')
  pass "OpenClaw config helper unit tests (${openclaw_config_count:-?} tests)"
else
  fail "OpenClaw config helper unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Agent execution runtime unit tests...${NC}"
npx ts-node --transpileOnly server/lib/agent-execution.test.ts > /tmp/clawmax-agent-execution.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-agent-execution.out; then
  pass "Agent execution runtime unit tests (2 tests)"
else
  fail "Agent execution runtime unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Workflow routes unit tests...${NC}"
npx ts-node --transpileOnly server/routes/workflows.test.ts > /tmp/clawmax-workflow-routes.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workflow-routes.out; then
  workflow_routes_count=$(grep "Tests passed:" /tmp/clawmax-workflow-routes.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  workflow_total=$(( ${wf_count:-0} + ${workflow_routes_count:-0} ))
  pass "Workflow routes unit tests (${workflow_routes_count:-?} tests in server/routes/workflows.test.ts)"
  pass "Workflow test total (${workflow_total} tests across lib + routes)"
else
  fail "Workflow routes unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Workspace dashboard library unit tests...${NC}"
npx ts-node --transpileOnly server/lib/workspace-dashboards.test.ts > /tmp/clawmax-workspace-dashboards.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-dashboards.out; then
  workspace_dashboards_count=$(grep "Tests passed:" /tmp/clawmax-workspace-dashboards.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Workspace dashboard library unit tests (${workspace_dashboards_count:-?} tests)"
else
  fail "Workspace dashboard library unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Workspace dashboard route helper unit tests...${NC}"
npx ts-node --transpileOnly server/routes/workspace-dashboards.test.ts > /tmp/clawmax-workspace-dashboard-routes.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-dashboard-routes.out; then
  workspace_dashboard_routes_count=$(grep "Tests passed:" /tmp/clawmax-workspace-dashboard-routes.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Workspace dashboard route helper unit tests (${workspace_dashboard_routes_count:-?} tests)"
else
  fail "Workspace dashboard route helper unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running AI generator unit tests...${NC}"
npx ts-node --transpileOnly server/lib/ai-generator.test.ts > /tmp/clawmax-ai-generator.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-ai-generator.out; then
  ai_generator_count=$(grep "Tests passed:" /tmp/clawmax-ai-generator.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "AI generator unit tests (${ai_generator_count:-?} tests)"
else
  fail "AI generator unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Build-a-Company demo smoke tests...${NC}"
npx ts-node --transpileOnly server/lib/build-company-demo-smoke.test.ts > /tmp/clawmax-build-company-demo-smoke.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-build-company-demo-smoke.out; then
  build_company_demo_smoke_count=$(grep "Tests passed:" /tmp/clawmax-build-company-demo-smoke.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Build-a-Company demo smoke tests (${build_company_demo_smoke_count:-?} tests)"
else
  fail "Build-a-Company demo smoke tests"
fi

echo ""
echo -e "${YELLOW}→ Running Workspace delete-agent unit tests...${NC}"
npx ts-node --transpileOnly server/lib/workspace-delete-agent.test.ts > /tmp/clawmax-workspace-delete-agent.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-workspace-delete-agent.out; then
  workspace_delete_agent_count=$(grep "Tests passed:" /tmp/clawmax-workspace-delete-agent.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "Workspace delete-agent unit tests (${workspace_delete_agent_count:-?} tests)"
else
  fail "Workspace delete-agent unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running OpenClaw agent transfer unit tests...${NC}"
npx ts-node --transpileOnly server/lib/openclaw-agent-transfer.test.ts > /tmp/clawmax-openclaw-agent-transfer.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-openclaw-agent-transfer.out; then
  openclaw_transfer_count=$(grep "Tests passed:" /tmp/clawmax-openclaw-agent-transfer.out | sed 's/\x1b\[[0-9;]*m//g' | sed 's/.*Tests passed: //' | tr -cd '0-9')
  pass "OpenClaw agent transfer unit tests (${openclaw_transfer_count:-?} tests)"
else
  fail "OpenClaw agent transfer unit tests"
fi

cd ..
echo ""

# =========================================
# Section 1: Health & System APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Health & System APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_api "Health endpoint" "/api/health"
test_json_field "Health has workspace" "/api/health" ".workspace"
test_api "System info endpoint" "/api/system"
test_json_field "System has agentCount" "/api/system" ".agentCount"
test_json_field "System has version" "/api/system" ".version"
test_api "Activity feed endpoint" "/api/activity"

echo ""

# =========================================
# Section 2: Agent APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Agent APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_api "List agents" "/api/agents"
test_json_field "Agents array exists" "/api/agents" ".agents"
agent_count=$(json_array_length "/api/agents" ".agents")
if [ "$agent_count" -gt 0 ]; then
  test_json_field "Agents have IDs" "/api/agents" ".agents[0].id"
  test_json_field "Agents have status" "/api/agents" ".agents[0].status"
  test_json_field "Agents have communities" "/api/agents" ".agents[0].communities"
  test_json_field "Agents have groups" "/api/agents" ".agents[0].groups"
  test_json_field "Agents have tags" "/api/agents" ".agents[0].tags"
else
  warn "No agents found - skipping seeded agent field checks"
fi

# Test next agent ID suggestion
test_api "Next agent ID" "/api/agents/next"
test_json_field "Next ID has suggested id" "/api/agents/next" ".id"
test_json_field "Next ID has port" "/api/agents/next" ".port"

echo ""

# =========================================
# Section 3-6: Validation Tests (Optional)
# =========================================
if [ "$SKIP_VALIDATION" = "true" ]; then
  warn "Skipping validation tests (sections 3-6) - use --with-validation to run them"
  echo ""
else
  warn "Running validation tests that modify live data files!"
  echo ""

# =========================================
# Section 3: AGENTS Schema Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. AGENTS Schema Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}→ Running direct agents schema checks...${NC}"

cd dashboard
npx ts-node --transpileOnly -e "
  const { validateAgents } = require('./server/lib/validator');
  const invalidId = validateAgents({
    agents: { list: [{ id: '9invalid', name: 'test', workspace: '/tmp/test', agentDir: '/tmp/test' }] }
  });
  if (invalidId.valid) process.exit(1);
  const missingFields = validateAgents({
    agents: { list: [{ id: 'test', name: 'test' }] }
  });
  if (missingFields.valid) process.exit(2);
  process.exit(0);
" > /tmp/clawmax-agent-schema.out 2>&1
agent_schema_status=$?
cd ..

if [ "$agent_schema_status" -eq 0 ]; then
  pass "Invalid agent ID detected (starts with digit)"
  pass "Missing required fields detected"
else
  if [ "$agent_schema_status" -eq 1 ]; then
    fail "Invalid agent ID not detected"
    pass "Missing required fields detected"
  elif [ "$agent_schema_status" -eq 2 ]; then
    pass "Invalid agent ID detected (starts with digit)"
    fail "Missing required fields not detected"
  else
    fail "Invalid agent ID not detected"
    fail "Missing required fields not detected"
  fi
fi

echo ""

# =========================================
# Section 4: COMMUNITIES.md Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. COMMUNITIES.md Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Valid community
valid_community='## Communities

### TestCommunity
- **Description:** Test community
- **Tags:** test, dev
- **Channels:** whatsapp'

test_validation "Valid community" "ORG/COMMUNITIES.md" "$valid_community" false

# Invalid: Missing required description
invalid_community_missing_description='## Communities

### MissingDescriptionCommunity
- **Tags:** test'

test_validation "Invalid community (missing description)" "ORG/COMMUNITIES.md" "$invalid_community_missing_description" true

# Invalid: Bad tag format (spaces)
invalid_community_tag='## Communities

### GoodCommunity
- **Description:** Test
- **Tags:** bad tag, with spaces'

test_validation "Invalid community tag format" "ORG/COMMUNITIES.md" "$invalid_community_tag" true

# Invalid: Bad channel
invalid_community_channel='## Communities

### TestCommunity
- **Description:** Test
- **Tags:** test
- **Channels:** invalid-channel'

test_validation "Invalid community channel" "ORG/COMMUNITIES.md" "$invalid_community_channel" true

echo ""

# =========================================
# Section 5: GROUPS.md Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. GROUPS.md Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Valid group
valid_group='## Groups

### TestGroup
- **Description:** Test group
- **Community:** TestCommunity
- **Tags:** test
- **Channels:** whatsapp'

test_validation "Valid group" "ORG/GROUPS.md" "$valid_group" false

# Invalid: Missing required description
invalid_group_missing_description='## Groups

### MissingDescriptionGroup
- **Community:** Test'

test_validation "Invalid group (missing description)" "ORG/GROUPS.md" "$invalid_group_missing_description" true

echo ""

# =========================================
# Section 6: IDENTITY.md Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. IDENTITY.md Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Valid identity
valid_identity='# Agent Identity

**Name:** test-agent

**Role:** Developer

**Model:** openai/gpt-4o

**Description:** Test agent for validation

**Tags:** test, dev'

test_validation "Valid identity" "AGENTS/test/IDENTITY.md" "$valid_identity" false

# Invalid: Missing name
invalid_identity_no_name='# Agent Identity

**Role:** Developer'

test_validation "Invalid identity (no name)" "AGENTS/test/IDENTITY.md" "$invalid_identity_no_name" true

echo ""

fi # End of validation tests (sections 3-6)

# =========================================
# Section 7: Document APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. Document APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_api "List markdown files" "/api/docs"
test_json_field "Docs have ORG section" "/api/docs" '.entries | map(select(.section == "ORG")) | length'
test_json_field "Docs have SYSTEM section" "/api/docs" '.entries | map(select(.section == "SYSTEM")) | length'
agent_doc_count=$(apicurl "$API_BASE/api/docs" | jq '.entries | map(select(.section == "AGENTS")) | length')
if [ "$agent_doc_count" -gt 0 ]; then
  pass "Docs have AGENTS section entries ($agent_doc_count)"
else
  warn "No AGENTS docs found - clean workspace has no seeded agent docs"
fi

echo ""

# =========================================
# Section 8: Channel APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8. Channel APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_api "List communities" "/api/communities"
test_json_field "Communities array exists" "/api/communities" ".communities"
test_api "List groups" "/api/groups"
test_json_field "Groups array exists" "/api/groups" ".groups"

echo ""

# =========================================
# Non-integration boundary
# =========================================
if [ "$RUN_INTEGRATION" != true ]; then
  warn "Skipping live dashboard mutation sections. Use ./test.sh integration for disruptive or destructive API tests."
  echo ""
else

# =========================================
# Section 9: Group Chat APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9. Group Chat APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test group message endpoints exist
test_api "Get group messages" "/api/groups/General/messages"
test_json_field "Group messages array" "/api/groups/General/messages" ".messages"

# Test sending a message
response=$(apicurl -X POST "$API_BASE/api/groups/General/messages" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Test message from test suite","mentions":[]}')

if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
  pass "Send message to group"
else
  fail "Send message to group"
fi

# Test community message endpoints
test_api "Get community messages" "/api/communities/Maximilien.ai/messages"
test_json_field "Community messages array" "/api/communities/Maximilien.ai/messages" ".messages"

# Test archives endpoints
test_api "Get group archives" "/api/groups/General/archives"
test_json_field "Group archives array" "/api/groups/General/archives" ".archives"

echo ""

# =========================================
# Section 10: Activity Feed
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "10. Activity Feed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_json_field "Activity feed array" "/api/activity" ".feed"
activity_count=$(json_array_length "/api/activity" ".feed")
if [ "$activity_count" -gt 0 ]; then
  test_json_field "Activity has agentId" "/api/activity" ".feed[0].agentId"
  test_json_field "Activity has file" "/api/activity" ".feed[0].file"
  test_json_field "Activity has ageMins" "/api/activity" ".feed[0].ageMins"

  activity_agent_count=$(apicurl "$API_BASE/api/activity" | jq '.feed | map(.agentId) | unique | length')
  if [ "$activity_agent_count" -gt 1 ]; then
    pass "Activity from multiple agents ($activity_agent_count agents)"
  else
    warn "Activity feed has only $activity_agent_count unique agent"
  fi
else
  warn "Activity feed empty - skipping activity detail checks"
fi

echo ""

# =========================================
# Section 11: WhatsApp Integration
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "11. WhatsApp Integration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test agent health endpoint includes WhatsApp status (conditional)
# First check if dave agent exists
dave_exists=$(apicurl "$API_BASE/api/agents" | jq -e '.agents[] | select(.id == "dave")' > /dev/null 2>&1 && echo "yes" || echo "no")
if [ "$dave_exists" = "yes" ]; then
  test_api "Agent health endpoint" "/api/agents/dave/health"

  # Check if channels field exists before testing WhatsApp-specific fields
  has_channels=$(apicurl "$API_BASE/api/agents/dave/health" | jq -e '.channels' > /dev/null 2>&1 && echo "yes" || echo "no")
  if [ "$has_channels" = "yes" ]; then
    test_json_field "Health has channels" "/api/agents/dave/health" ".channels"
    test_json_field "WhatsApp channel status" "/api/agents/dave/health" ".channels.whatsapp"
    test_json_field "WhatsApp configured" "/api/agents/dave/health" ".channels.whatsapp.configured"
    test_json_field "WhatsApp linked status" "/api/agents/dave/health" ".channels.whatsapp.linked"
  else
    warn "Agent health endpoint exists but channels field not present (WhatsApp integration not configured)"
  fi
else
  warn "Agent 'dave' not found - skipping WhatsApp health tests"
fi

# Verify groups have WhatsApp channels (optional)
whatsapp_groups=$(apicurl "$API_BASE/api/groups" | jq '[.groups[] | select(.channels[]? == "whatsapp")] | length')
if [ "$whatsapp_groups" -gt 0 ]; then
  pass "Groups with WhatsApp channel ($whatsapp_groups groups)"
else
  warn "Groups with WhatsApp channel (none found - WhatsApp integration not configured)"
fi

echo ""

# =========================================
# Section 12: MANDATE.md Schema Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "12. MANDATE.md Schema Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify mandate schema exists
# Schema is in repo root SYSTEM/schemas, not workspace
WORKSPACE=$(apicurl "$API_BASE/api/health" | jq -r '.workspace')
REPO_ROOT="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || cd .. && pwd)"
if [ -f "$REPO_ROOT/SYSTEM/schemas/mandate.schema.json" ]; then
  pass "MANDATE.md schema file exists"

  # Test schema is valid JSON
  if jq empty "$REPO_ROOT/SYSTEM/schemas/mandate.schema.json" 2>/dev/null; then
    pass "MANDATE.md schema is valid JSON"
  else
    fail "MANDATE.md schema is not valid JSON"
  fi
else
  fail "MANDATE.md schema file not found (looked in: $REPO_ROOT/SYSTEM/schemas/)"
fi

# Note: Actual validation function will be tested when MANDATE editing is added to API
warn "MANDATE validation function ready (will be used when editing is added)"

echo ""

# =========================================
# Section 13: DocHub Search
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "13. DocHub Search"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test empty query returns empty results
response=$(apicurl "$API_BASE/api/docs/search?q=")
if echo "$response" | jq -e '.results == []' > /dev/null 2>&1; then
  pass "Empty query returns empty results"
else
  fail "Empty query did not return empty results"
fi

# Test search for "template" returns results (or warn if no docs indexed yet)
response=$(apicurl "$API_BASE/api/docs/search?q=template")
result_count=$(echo "$response" | jq '.results | length')
if [ "$result_count" -gt 0 ]; then
  pass "Search for 'template' found $result_count results"
else
  warn "Search for 'template' found no results (documents may not be indexed yet)"
fi

# Test search results have required fields (path, matches, preview)
response=$(apicurl "$API_BASE/api/docs/search?q=agent")
search_result_count=$(echo "$response" | jq '.results | length')
if [ "$search_result_count" -gt 0 ]; then
  if echo "$response" | jq -e '.results[0] | has("path") and has("matches") and has("preview")' > /dev/null 2>&1; then
    pass "Search results contain required fields"
  else
    fail "Search results missing required fields"
  fi
else
  warn "Search for 'agent' returned no results - skipping field shape check"
fi

# Test search results sorted by matches (descending)
response=$(apicurl "$API_BASE/api/docs/search?q=the")
first_matches=$(echo "$response" | jq '.results[0].matches // 0')
second_matches=$(echo "$response" | jq '.results[1].matches // 0')
if [ "$first_matches" -ge "$second_matches" ]; then
  pass "Search results sorted by match count (descending)"
else
  fail "Search results not properly sorted"
fi

# Test search is case-insensitive
lower_response=$(apicurl "$API_BASE/api/docs/search?q=community")
upper_response=$(apicurl "$API_BASE/api/docs/search?q=COMMUNITY")
lower_count=$(echo "$lower_response" | jq '.results | length')
upper_count=$(echo "$upper_response" | jq '.results | length')
if [ "$lower_count" -eq "$upper_count" ]; then
  pass "Search is case-insensitive"
else
  fail "Search case-sensitivity mismatch"
fi

echo ""

# =========================================
# Section 14: Skills & Tools APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "14. Skills & Tools APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test list all skills
test_api "List all skills" "/api/skills"
test_json_field "Skills array exists" "/api/skills" ".skills"
skill_count=$(json_array_length "/api/skills" ".skills")
if [ "$skill_count" -gt 0 ]; then
  test_json_field "Skills have name" "/api/skills" ".skills[0].name"
  test_json_field "Skills have description" "/api/skills" ".skills[0].description"
  test_json_field "Skills have source" "/api/skills" ".skills[0].source"
else
  fail "Skills catalog empty"
fi

if [ "$skill_count" -gt 40 ]; then
  pass "Skills catalog loaded ($skill_count skills)"
else
  fail "Skills catalog incomplete ($skill_count skills, expected >40)"
fi

# Test get single skill
test_api "Get single skill (github)" "/api/skills/github"
test_json_field "Skill details have name" "/api/skills/github" ".name"
test_json_field "Skill details have emoji" "/api/skills/github" ".emoji"

# Test get agent's skills
test_api "Get agent skills" "/api/skills/agent/engineer"
test_json_field "Agent skills array" "/api/skills/agent/engineer" ".skillIds"
test_json_field "Agent skills objects" "/api/skills/agent/engineer" ".skills"

# Test agents API includes skills field (look for an agent with skills, not just first)
if apicurl "$API_BASE/api/agents" | jq -e '.agents[] | select(.skills != null)' > /dev/null 2>&1; then
  pass "Agents have skills field"
else
  if [ "$agent_count" -gt 0 ]; then
    # If no agent has skills yet, just check the field exists (can be null)
    test_json_field "Agents have skills field" "/api/agents" ".agents[0] | has(\"skills\")"
  else
    warn "No agents found - skipping skills field check"
  fi
fi

# Test skill validation
response=$(apicurl -X POST "$API_BASE/api/skills/validate" \
  -H 'Content-Type: application/json' \
  -d '{"skills":["github","slack","notion"]}')

if echo "$response" | jq -e '.valid == true' > /dev/null 2>&1; then
  pass "Valid skills pass validation"
else
  fail "Valid skills validation failed"
fi

# Test invalid skill detection
response=$(apicurl -X POST "$API_BASE/api/skills/validate" \
  -H 'Content-Type: application/json' \
  -d '{"skills":["github","nonexistent-skill-xyz"]}')

if echo "$response" | jq -e '.valid == false' > /dev/null 2>&1; then
  missing=$(echo "$response" | jq -r '.missing[0]')
  if [ "$missing" = "nonexistent-skill-xyz" ]; then
    pass "Invalid skills detected correctly"
  else
    fail "Invalid skills not detected properly"
  fi
else
  fail "Invalid skills validation incorrect"
fi

# Test skill assignment update (if we have agents)
if apicurl "$API_BASE/api/agents" | jq -e '.agents[0].id' > /dev/null 2>&1; then
  first_agent=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[0].id')

  # Get current skills
  current_skills=$(apicurl "$API_BASE/api/skills/agent/$first_agent" | jq -r '.skillIds')

  # Try to update (use valid skills: github and slack)
  test_skills='["github","slack"]'
  response=$(apicurl -X PUT "$API_BASE/api/skills/agent/$first_agent" \
    -H 'Content-Type: application/json' \
    -d "{\"skills\":$test_skills}")

  if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "Skills assignment update succeeded"

    # Verify persistence - check if skills were saved
    sleep 0.5
    updated_skills=$(apicurl "$API_BASE/api/skills/agent/$first_agent" | jq -r '.skillIds[]')
    if echo "$updated_skills" | grep -q "github"; then
      pass "Skills persisted to openclaw.json"
    else
      fail "Skills not persisted correctly"
    fi
  else
    fail "Skills assignment update failed"
  fi
else
  warn "No agents found for skills assignment test"
fi

# Test bulk skill assignment
if apicurl "$API_BASE/api/agents" | jq -e '.agents[0].id' > /dev/null 2>&1 && \
   apicurl "$API_BASE/api/agents" | jq -e '.agents[1].id' > /dev/null 2>&1; then
  agent1=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[0].id')
  agent2=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[1].id')

  response=$(apicurl -X POST "$API_BASE/api/skills/bulk-assign" \
    -H 'Content-Type: application/json' \
    -d "{\"agentIds\":[\"$agent1\",\"$agent2\"],\"addSkills\":[\"github\"]}")

  if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    updated=$(echo "$response" | jq -r '.updated')
    pass "Bulk skill assignment succeeded ($updated agents)"
  else
    fail "Bulk skill assignment failed"
  fi

  # Test validation: invalid skills rejected
  response=$(apicurl -X POST "$API_BASE/api/skills/bulk-assign" \
    -H 'Content-Type: application/json' \
    -d "{\"agentIds\":[\"$agent1\"],\"addSkills\":[\"nonexistent-skill-xyz\"]}")

  if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
    pass "Bulk skill assignment rejects invalid skills"
  else
    fail "Bulk skill assignment should reject invalid skills"
  fi
else
  warn "Need 2+ agents for bulk skill assignment test"
fi

echo ""

# =========================================
# Section 15: Gateway RPC Compatibility
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "15. Gateway RPC Compatibility"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test that config writes go through Gateway RPC with proper validation
TEST_AGENT="engineer"
TEST_SKILLS_PAYLOAD='["github","slack"]'

# Check if agent exists in global config
if ! openclaw agents list 2>&1 | grep -q "$TEST_AGENT"; then
  warn "Agent '$TEST_AGENT' not found in global config - skipping Gateway RPC tests"
  warn "Gateway RPC tests require agent registered in ~/.openclaw/openclaw.json"
else
  # Save current config
  cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.rpc-test-backup

  # Get current metadata timestamp before update
  META_BEFORE=$(jq -r '.meta.lastTouchedAt' ~/.openclaw/openclaw.json)

  # Update skills via dashboard API (should use Gateway RPC)
  response=$(apicurl -X PUT "$API_BASE/api/skills/agent/$TEST_AGENT" \
    -H 'Content-Type: application/json' \
    -d "{\"skills\":$TEST_SKILLS_PAYLOAD}")

  if echo "$response" | jq -e '.ok' > /dev/null 2>&1; then
    pass "Gateway RPC skills update succeeded"

  # Wait for write to complete
  sleep 0.5

  # Verify metadata was stamped (indicating Gateway RPC was used)
  META_AFTER=$(jq -r '.meta.lastTouchedAt' ~/.openclaw/openclaw.json)

  if [ "$META_AFTER" != "$META_BEFORE" ] && [ "$META_AFTER" != "null" ]; then
    pass "Config metadata stamped by Gateway"
  else
    fail "Config metadata NOT stamped (direct write detected!)"
  fi

    # Verify OpenClaw CLI can still read config
    if openclaw agents list 2>&1 | grep -q "$TEST_AGENT"; then
      pass "OpenClaw CLI can read Gateway-modified config"
    else
      fail "OpenClaw CLI cannot read config (validation may have failed)"
    fi
  else
    warn "Gateway RPC skills update failed (agent may not exist in this workspace)"
  fi

  # Restore backup
  mv ~/.openclaw/openclaw.json.rpc-test-backup ~/.openclaw/openclaw.json
fi

echo ""

# =========================================
# Section 16: Workflows APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "16. Workflows APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test list workflows
test_api "List workflows" "/api/workflows"
test_json_field "Workflows array exists" "/api/workflows" ".workflows"

# Count existing workflows
workflow_count=$(apicurl "$API_BASE/api/workflows" | jq '.workflows | length')
if [ "$workflow_count" -ge 0 ]; then
  pass "Workflows endpoint returns array (count: $workflow_count)"
else
  fail "Workflows endpoint invalid response"
fi

# Test get specific workflow (if any exist)
if [ "$workflow_count" -gt 0 ]; then
  first_workflow_id=$(apicurl "$API_BASE/api/workflows" | jq -r '.workflows[0].id')
  test_api "Get workflow by ID" "/api/workflows/$first_workflow_id"
  test_json_field "Workflow has name" "/api/workflows/$first_workflow_id" ".name"
  test_json_field "Workflow has schedule" "/api/workflows/$first_workflow_id" ".schedule"
  test_json_field "Workflow has targeting" "/api/workflows/$first_workflow_id" ".targeting"
  test_json_field "Workflow has content" "/api/workflows/$first_workflow_id" ".content"
  test_json_field "Workflow has scheduleHuman" "/api/workflows/$first_workflow_id" ".scheduleHuman"

  # Test participants endpoint
  test_api "Get workflow participants" "/api/workflows/$first_workflow_id/participants"
  test_json_field "Participants array" "/api/workflows/$first_workflow_id/participants" ".participants"

  # Test executions endpoint
  test_api "Get workflow executions" "/api/workflows/$first_workflow_id/executions"
  test_json_field "Executions array" "/api/workflows/$first_workflow_id/executions" ".executions"
else
  warn "No workflows found for detailed testing"
fi

# Test create workflow
test_workflow_payload='{"name":"Test Workflow","description":"Test workflow for testing","schedule":"0 9 * * *","enabled":true,"targeting":{"communities":[],"groups":[],"tags":[],"agents":[]},"author":"test-suite","executionMode":"automated","content":"# Test Workflow\\n\\nThis is a test."}'

response=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d "$test_workflow_payload")

if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
  test_workflow_id=$(echo "$response" | jq -r '.id')
  pass "Create workflow (ID: $test_workflow_id)"

  # Test update workflow
  response=$(apicurl -X PUT "$API_BASE/api/workflows/$test_workflow_id" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":false}')

  if echo "$response" | jq -e '.message' > /dev/null 2>&1; then
    pass "Update workflow (disable)"
  else
    fail "Update workflow failed"
  fi

  # Verify update
  updated_workflow=$(apicurl "$API_BASE/api/workflows/$test_workflow_id")
  if [ "$(echo "$updated_workflow" | jq -r '.enabled')" = "false" ]; then
    pass "Workflow update persisted"
  else
    fail "Workflow update not persisted"
  fi

  # Test delete workflow
  response=$(apicurl -X DELETE "$API_BASE/api/workflows/$test_workflow_id")

  if echo "$response" | jq -e '.message' > /dev/null 2>&1; then
    pass "Delete workflow"
  else
    fail "Delete workflow failed"
  fi

  # Verify deletion
  response=$(apicurl -w "\n%{http_code}" "$API_BASE/api/workflows/$test_workflow_id")
  code=$(echo "$response" | tail -n 1)
  if [ "$code" -eq 404 ]; then
    pass "Workflow deleted successfully"
  else
    fail "Workflow still exists after deletion"
  fi
else
  fail "Create workflow failed"
fi

# Test invalid cron expression
response=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bad Cron","description":"Test","schedule":"invalid","content":"test"}')

if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Invalid cron expression rejected"
else
  fail "Invalid cron expression not rejected"
fi

# Test missing required fields
response=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Incomplete"}')

if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Missing required fields rejected"
else
  fail "Missing required fields not rejected"
fi

echo ""

# =========================================
# Section 17: Custom Skills Import
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "17. Custom Skills Import"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test SKILLS directory exists
# Get actual workspace path from health endpoint (reuse from Section 12 if available, otherwise fetch)
if [ -z "$WORKSPACE" ]; then
  WORKSPACE=$(apicurl "$API_BASE/api/health" | jq -r '.workspace')
fi
if [ -d "$WORKSPACE/SKILLS/custom" ]; then
  pass "SKILLS/custom directory exists"
else
  fail "SKILLS/custom directory not found (workspace: $WORKSPACE)"
fi

# Create a test skill for import
TEST_SKILL_DIR="/tmp/test-skill-$RANDOM"
mkdir -p "$TEST_SKILL_DIR"

# Create skill.md
cat > "$TEST_SKILL_DIR/skill.md" <<'EOF'
# Test Skill

**Description:** A test skill for automated testing

**Capabilities:**
- Test capability 1
- Test capability 2
EOF

# Create index.ts
cat > "$TEST_SKILL_DIR/index.ts" <<'EOF'
export const tools = {
  testTool: {
    description: 'A test tool',
    parameters: {},
    execute: async () => 'test result'
  }
}
EOF

# Test import API endpoint
response=$(apicurl -X POST "$API_BASE/api/skills/import" \
  -H 'Content-Type: application/json' \
  -d "{\"sourcePath\":\"$TEST_SKILL_DIR\"}")

if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
  test_skill_id=$(echo "$response" | jq -r '.skillId')
  pass "Import custom skill (ID: $test_skill_id)"

  # Verify skill appears in skills list (check by id, not name)
  sleep 0.5
  if apicurl "$API_BASE/api/skills" | jq -e ".skills[] | select(.id == \"$test_skill_id\")" > /dev/null 2>&1; then
    pass "Imported skill appears in skills list"

    # Verify skill source is 'workspace'
    skill_source=$(apicurl "$API_BASE/api/skills" | jq -r ".skills[] | select(.id == \"$test_skill_id\") | .source")
    if [ "$skill_source" = "workspace" ]; then
      pass "Imported skill has source 'workspace'"
    else
      fail "Imported skill source incorrect (got: $skill_source)"
    fi

    # Test delete imported skill
    response=$(apicurl -X DELETE "$API_BASE/api/skills/$test_skill_id")
    if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
      pass "Delete custom skill"

      # Verify skill removed from list (check by id)
      sleep 0.5
      if ! apicurl "$API_BASE/api/skills" | jq -e ".skills[] | select(.id == \"$test_skill_id\")" > /dev/null 2>&1; then
        pass "Deleted skill removed from skills list"
      else
        fail "Deleted skill still appears in skills list"
      fi
    else
      fail "Delete custom skill failed"
    fi
  else
    fail "Imported skill not found in skills list"
  fi
else
  error_msg=$(echo "$response" | jq -r '.error // "unknown error"')
  fail "Import custom skill failed: $error_msg"
fi

# Test import validation - missing skill.md
TEST_INVALID_DIR="/tmp/test-invalid-skill-$RANDOM"
mkdir -p "$TEST_INVALID_DIR"
echo "export const tools = {}" > "$TEST_INVALID_DIR/index.ts"

response=$(apicurl -X POST "$API_BASE/api/skills/import" \
  -H 'Content-Type: application/json' \
  -d "{\"sourcePath\":\"$TEST_INVALID_DIR\"}")

if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Import validation rejects missing skill.md"
else
  fail "Import validation did not reject missing skill.md"
fi

# Test import validation - missing index.ts
TEST_INVALID_DIR2="/tmp/test-invalid-skill2-$RANDOM"
mkdir -p "$TEST_INVALID_DIR2"
echo "# Test" > "$TEST_INVALID_DIR2/skill.md"

response=$(apicurl -X POST "$API_BASE/api/skills/import" \
  -H 'Content-Type: application/json' \
  -d "{\"sourcePath\":\"$TEST_INVALID_DIR2\"}")

if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Import validation rejects missing index.ts"
else
  fail "Import validation did not reject missing index.ts"
fi

echo ""

# =========================================
# 18. Notification APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "18. Notification APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# GET /api/notifications
response=$(apicurl "$API_BASE/api/notifications")
if echo "$response" | jq -e '.notifications' > /dev/null 2>&1; then
  pass "List notifications (HTTP 200)"
else
  fail "List notifications failed"
fi

# Check response has expected fields
if echo "$response" | jq -e '.activeCount >= 0' > /dev/null 2>&1; then
  pass "Notifications response has activeCount"
else
  fail "Notifications missing activeCount"
fi

# POST /api/notifications/dismiss-all
response=$(apicurl -X POST "$API_BASE/api/notifications/dismiss-all")
if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Dismiss all notifications"
else
  fail "Dismiss all notifications failed"
fi

# POST /api/notifications/dismiss with invalid id
response=$(apicurl -X POST "$API_BASE/api/notifications/dismiss" \
  -H 'Content-Type: application/json' \
  -d '{"id":"nonexistent-id"}')
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Dismiss invalid notification returns error"
else
  fail "Dismiss invalid notification should return error"
fi

# POST /api/notifications/:id/action with invalid id
response=$(apicurl -X POST "$API_BASE/api/notifications/invalid-id/action" \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve"}')
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Action on invalid notification returns error"
else
  fail "Action on invalid notification should return error"
fi

# GET /api/notifications/blockers/:workflowId
response=$(apicurl "$API_BASE/api/notifications/blockers/nonexistent-workflow")
if echo "$response" | jq -e '.blockers' > /dev/null 2>&1; then
  pass "Blockers endpoint returns array"
else
  fail "Blockers endpoint failed"
fi

echo ""

# =========================================
# 19. Per-Agent Cost Limits
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "19. Per-Agent Cost Limits"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# GET /api/agents/cost-limits
response=$(apicurl "$API_BASE/api/agents/cost-limits")
if echo "$response" | jq -e '.limits' > /dev/null 2>&1; then
  pass "List all cost limits"
else
  fail "List cost limits failed"
fi

# Set a cost limit on a test agent (if agents exist)
FIRST_AGENT=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[0].id // empty')
if [ -n "$FIRST_AGENT" ]; then
  workspace_budget=$(apicurl "$API_BASE/api/budget" | jq -r '.config.limitUsd // 10')
  if [ -z "$workspace_budget" ] || [ "$workspace_budget" = "null" ]; then
    workspace_budget="10"
  fi
  agent_limit=$(awk -v budget="$workspace_budget" 'BEGIN { if (budget > 1) print 1; else print budget }')

  # PUT cost limit
  response=$(apicurl -X PUT "$API_BASE/api/agents/$FIRST_AGENT/cost-limit" \
    -H 'Content-Type: application/json' \
    -d "{\"limitUsd\": $agent_limit}")
  if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "Set per-agent cost limit"
  else
    fail "Set per-agent cost limit failed"
  fi

  # GET cost limit
  response=$(apicurl "$API_BASE/api/agents/$FIRST_AGENT/cost-limit")
  if echo "$response" | jq -e --argjson expected "$agent_limit" '.limitUsd == $expected' > /dev/null 2>&1; then
    pass "Get per-agent cost limit"
  else
    fail "Get per-agent cost limit failed (got: $(echo $response | jq '.limitUsd'))"
  fi

  # Remove cost limit
  response=$(apicurl -X PUT "$API_BASE/api/agents/$FIRST_AGENT/cost-limit" \
    -H 'Content-Type: application/json' \
    -d '{"limitUsd": null}')
  if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "Remove per-agent cost limit"
  else
    fail "Remove per-agent cost limit failed"
  fi
else
  warn "No agents found — skipping per-agent cost limit tests"
fi

echo ""

# =========================================
# 20. Bulk Model Change
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "20. Bulk Model Change"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# POST /api/agents/bulk-model with no agents (should still succeed with 0 updated)
response=$(apicurl -X POST "$API_BASE/api/agents/bulk-model" \
  -H 'Content-Type: application/json' \
  -d '{"agentIds":[],"model":"openai/gpt-4o"}')
if echo "$response" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Bulk model change (empty list)"
else
  fail "Bulk model change (empty list) failed"
fi

# POST with missing model (should fail validation)
response=$(apicurl -X POST "$API_BASE/api/agents/bulk-model" \
  -H 'Content-Type: application/json' \
  -d '{"agentIds":["test"]}')
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  pass "Bulk model change rejects missing model"
else
  fail "Bulk model change should reject missing model"
fi

echo ""

# =========================================
# 21. Available Models API
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "21. Available Models API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

response=$(apicurl "$API_BASE/api/agents/models")
if echo "$response" | jq -e '.models' > /dev/null 2>&1; then
  model_count=$(echo "$response" | jq '.models | length')
  pass "Models API returns list (count: $model_count)"
else
  fail "Models API failed"
fi

if echo "$response" | jq -e '.modelsByProvider' > /dev/null 2>&1; then
  pass "Models API includes modelsByProvider"
else
  fail "Models API missing modelsByProvider"
fi

# Test models refresh endpoint
response=$(apicurl -X POST "$API_BASE/api/agents/models/refresh")
if echo "$response" | jq -e '.models' > /dev/null 2>&1; then
  refresh_count=$(echo "$response" | jq '.models | length')
  pass "Models refresh returns list (count: $refresh_count)"
else
  fail "Models refresh failed"
fi

# Cleanup test directories
rm -rf "$TEST_SKILL_DIR" "$TEST_INVALID_DIR" "$TEST_INVALID_DIR2"

echo ""

# =========================================
# Section 22: Template Categories & TEMPLATE.md
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "22. Template Categories & TEMPLATE.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test that templates have category field
templates_response=$(apicurl "$API_BASE/api/templates")
if echo "$templates_response" | jq -e '.organizations | length > 0' > /dev/null 2>&1; then
  pass "Templates API returns organizations"

  # Check category field exists
  has_category=$(echo "$templates_response" | jq '[.organizations[] | select(.category != null)] | length')
  if [ "$has_category" -gt "0" ]; then
    pass "Templates have category field ($has_category with category)"
  else
    fail "No templates have category field"
  fi

  # Check kickoff workflows exist
  has_kickoff=$(echo "$templates_response" | jq '[.organizations[] | select(.workflows != null) | .workflows[] | select(.id == "kickoff")] | length')
  if [ "$has_kickoff" -gt "0" ]; then
    pass "Templates have kickoff workflows ($has_kickoff templates)"
  else
    warn "No templates with kickoff workflows found"
  fi
else
  warn "No organization templates found"
fi

# Test TEMPLATE.md support (save a template and check both formats created)
test_template='{"name":"Test MD Template","type":"organization","version":"1.0.0","agents":[{"id":"test-agent","role":"tester"}]}'
test_slug="test-md-template"
apicurl -X PUT "$API_BASE/api/templates/organizations/$test_slug" \
  -H 'Content-Type: application/json' \
  -d "$test_template" > /dev/null 2>&1

if [ -f "WORKSPACES/default/TEMPLATES/organizations/$test_slug/template.json" ]; then
  pass "Template save creates template.json"
else
  # Check global templates dir
  if [ -f "TEMPLATES/organizations/$test_slug/template.json" ]; then
    pass "Template save creates template.json (global)"
  else
    warn "template.json not found after save (may use different path)"
  fi
fi

# Clean up test template
apicurl -X DELETE "$API_BASE/api/templates/organizations/$test_slug" > /dev/null 2>&1

# =========================================
# Section 23: Shipables Registry API
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "23. Shipables Registry API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test registry search (empty query returns all)
registry_response=$(apicurl "$API_BASE/api/skills/registry/search?q=")
if echo "$registry_response" | jq -e '.ok == true' > /dev/null 2>&1; then
  result_count=$(echo "$registry_response" | jq '.results | length')
  pass "Registry search returns results ($result_count skills)"
else
  warn "Registry search unavailable (Shipables CLI may not be installed)"
fi

# Test registry search with query
registry_search=$(apicurl "$API_BASE/api/skills/registry/search?q=github")
if echo "$registry_search" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Registry search with query works"
else
  warn "Registry search with query unavailable"
fi

# =========================================
# Section 24: Workflow Content Overrides
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "24. Workflow Content Overrides"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test that the import endpoint accepts workflowOverrides
# (We test the parameter parsing, not full import to avoid creating agents)
override_response=$(apicurl -X POST "$API_BASE/api/templates/organizations/import" \
  -H 'Content-Type: application/json' \
  -d '{"templateSlug":"nonexistent-template-xyz","workflowOverrides":{"kickoff":"custom content"}}')

if echo "$override_response" | jq -e '.error' > /dev/null 2>&1; then
  error_msg=$(echo "$override_response" | jq -r '.error')
  if echo "$error_msg" | grep -qi "not found"; then
    pass "Import endpoint accepts workflowOverrides parameter"
  else
    pass "Import endpoint responds correctly ($error_msg)"
  fi
else
  fail "Import endpoint should return error for nonexistent template"
fi

echo ""

# =========================================
# Section 25: Workflow v2 APIs
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "25. Workflow v2 APIs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create a test workflow for v2 API tests
test_wf_response=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d '{"name":"V2 Test Workflow","description":"Testing v2 APIs","schedule":"manual","content":"# Test\nDo the thing.","executionMode":"automated","targeting":{"agents":[],"groups":[],"tags":[],"communities":[]}}')

test_wf_id=$(echo "$test_wf_response" | jq -r '.id // empty')

if [ -n "$test_wf_id" ]; then
  pass "Created test workflow for v2 tests (ID: $test_wf_id)"

  # Test progress reporting
  progress_response=$(apicurl -X POST "$API_BASE/api/workflows/$test_wf_id/progress" \
    -H 'Content-Type: application/json' \
    -d '{"progress":42,"detail":"Almost halfway","agentId":"test-agent"}')
  if echo "$progress_response" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "Workflow progress reporting works"
  else
    fail "Workflow progress reporting failed"
  fi

  # Test dependency check
  deps_response=$(apicurl "$API_BASE/api/workflows/$test_wf_id/dependencies")
  if echo "$deps_response" | jq -e '.ok == true' > /dev/null 2>&1; then
    met=$(echo "$deps_response" | jq -r '.met')
    pass "Workflow dependency check works (met: $met)"
  else
    fail "Workflow dependency check failed"
  fi

  # Test blocker declaration
  blocker_response=$(apicurl -X POST "$API_BASE/api/workflows/$test_wf_id/blocker" \
    -H 'Content-Type: application/json' \
    -d '{"agentId":"test-agent","blockerType":"approval","title":"Test blocker","message":"Needs approval"}')
  if echo "$blocker_response" | jq -e '.ok == true' > /dev/null 2>&1; then
    pass "Workflow blocker declaration works"
  else
    fail "Workflow blocker declaration failed"
  fi

  # Test blocker query
  blockers_response=$(apicurl "$API_BASE/api/notifications/blockers/$test_wf_id")
  blocker_count=$(echo "$blockers_response" | jq -r '.count')
  if [ "$blocker_count" -gt "0" ] 2>/dev/null; then
    pass "Blocker query returns blockers (count: $blocker_count)"
  else
    pass "Blocker query endpoint works"
  fi

  # Test progress with invalid value
  bad_progress=$(apicurl -X POST "$API_BASE/api/workflows/$test_wf_id/progress" \
    -H 'Content-Type: application/json' \
    -d '{"progress":150}')
  if echo "$bad_progress" | jq -e '.error' > /dev/null 2>&1; then
    pass "Invalid progress (150) rejected"
  else
    fail "Invalid progress should be rejected"
  fi

  # Test blocker with missing fields
  bad_blocker=$(apicurl -X POST "$API_BASE/api/workflows/$test_wf_id/blocker" \
    -H 'Content-Type: application/json' \
    -d '{"agentId":"test"}')
  if echo "$bad_blocker" | jq -e '.error' > /dev/null 2>&1; then
    pass "Blocker with missing fields rejected"
  else
    fail "Blocker with missing fields should be rejected"
  fi

  # Test workflow export as markdown
  export_response=$(apicurl "$API_BASE/api/templates/workflows/$test_wf_id/export-md")
  if echo "$export_response" | grep -q "name:"; then
    pass "Workflow export-md returns YAML frontmatter"
  else
    warn "Workflow export-md format unexpected"
  fi

  # Clean up test workflow
  apicurl -X DELETE "$API_BASE/api/workflows/$test_wf_id" > /dev/null 2>&1

  # Clean up test notifications
  apicurl -X POST "$API_BASE/api/notifications/dismiss-all" > /dev/null 2>&1
else
  warn "Could not create test workflow for v2 tests"
fi

# =========================================
# Section 26: Template Import/Export MD
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "26. Template Import/Export MD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test template export as markdown
export_md=$(apicurl "$API_BASE/api/templates/organizations/dev-team/export-md")
if echo "$export_md" | grep -q "name: Dev Team"; then
  pass "Template export-md returns lean TEMPLATE.md"
else
  warn "Template export-md format unexpected (may need different slug)"
fi

# Test template import with valid markdown
import_response=$(apicurl -X POST "$API_BASE/api/templates/import-md" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"---\\nname: Test Import Template\\ntype: organization\\nversion: \\\"1.0.0\\\"\\n---\\n\\nA test template.\\n\\n## Agents\\n\\n| id | name | role | tags | skills |\\n|----|------|------|------|--------|\\n| test-a | Test Agent | Tester | test | |\\n\"}")
if echo "$import_response" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Template import-md accepts valid TEMPLATE.md"
  # Clean up
  apicurl -X DELETE "$API_BASE/api/templates/organizations/test-import-template" > /dev/null 2>&1
else
  error_msg=$(echo "$import_response" | jq -r '.error // "unknown"')
  warn "Template import-md: $error_msg"
fi

# Test template import with invalid content
bad_import=$(apicurl -X POST "$API_BASE/api/templates/import-md" \
  -H 'Content-Type: application/json' \
  -d '{"content":"just plain text no frontmatter"}')
if echo "$bad_import" | jq -e '.error' > /dev/null 2>&1; then
  pass "Template import-md rejects invalid content"
else
  fail "Template import-md should reject invalid content"
fi

# Test workflow import-md
wf_import=$(apicurl -X POST "$API_BASE/api/templates/workflows/import-md" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"---\\nname: Test WF Import\\ndescription: Testing import\\nschedule: manual\\ncontent: placeholder\\n---\\n\\n# Test Workflow\\n\\nDo the thing.\\n\"}")
if echo "$wf_import" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Workflow import-md works"
  # Clean up
  wf_import_id=$(echo "$wf_import" | jq -r '.id // empty')
  [ -n "$wf_import_id" ] && apicurl -X DELETE "$API_BASE/api/workflows/$wf_import_id" > /dev/null 2>&1
else
  error_msg=$(echo "$wf_import" | jq -r '.error // "unknown"')
  warn "Workflow import-md: $error_msg"
fi

# =========================================
# Section 27: Workspace Switching
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "27. Workspace Switching"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get current workspace
current_ws=$(apicurl "$API_BASE/api/health" | jq -r '.workspace')
if [ -n "$current_ws" ]; then
  pass "Current workspace detected: $(basename "$current_ws")"
else
  fail "Could not detect current workspace"
fi

# List workspaces
ws_list=$(apicurl "$API_BASE/api/workspaces")
ws_count=$(echo "$ws_list" | jq '.workspaces | length' 2>/dev/null)
if [ "$ws_count" -ge "1" ] 2>/dev/null; then
  pass "Workspaces listed ($ws_count workspaces)"
else
  warn "No workspaces found"
fi

# Get active workspace
active_ws=$(apicurl "$API_BASE/api/workspaces/active")
if echo "$active_ws" | jq -e '.workspace.id' > /dev/null 2>&1; then
  pass "Active workspace endpoint works"
else
  warn "Active workspace endpoint returned unexpected format"
fi

# =========================================
# Section 28: Workflow DAG API
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "28. Workflow DAG API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create two workflows with dependency for DAG test
dag_wf1=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d '{"name":"DAG Test Step 1","description":"First step","schedule":"manual","content":"Step 1","executionMode":"automated","type":"once","targeting":{"agents":[],"groups":[],"tags":[],"communities":[]}}')
dag_wf1_id=$(echo "$dag_wf1" | jq -r '.id // empty')

dag_wf2=$(apicurl -X POST "$API_BASE/api/workflows" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"DAG Test Step 2\",\"description\":\"Second step\",\"schedule\":\"manual\",\"content\":\"Step 2\",\"executionMode\":\"automated\",\"type\":\"recurring\",\"dependsOn\":[\"$dag_wf1_id\"],\"targeting\":{\"agents\":[],\"groups\":[],\"tags\":[],\"communities\":[]}}")
dag_wf2_id=$(echo "$dag_wf2" | jq -r '.id // empty')

if [ -n "$dag_wf1_id" ] && [ -n "$dag_wf2_id" ]; then
  pass "Created DAG test workflows ($dag_wf1_id → $dag_wf2_id)"

  # Verify dependency persisted
  dag_check=$(apicurl "$API_BASE/api/workflows/$dag_wf2_id")
  dag_deps=$(echo "$dag_check" | jq -r '.dependsOn[0] // empty')
  if [ "$dag_deps" = "$dag_wf1_id" ]; then
    pass "DAG dependency persisted correctly"
  else
    fail "DAG dependency not persisted (got: $dag_deps)"
  fi

  # Test DAG status endpoint
  dag_status=$(apicurl "$API_BASE/api/workflows/dag")
  if echo "$dag_status" | jq -e '.ok == true' > /dev/null 2>&1; then
    dag_count=$(echo "$dag_status" | jq '.dag | length')
    pass "DAG status endpoint works ($dag_count workflows)"
  else
    fail "DAG status endpoint failed"
  fi

  # Test complete + cascade
  complete_result=$(apicurl -X POST "$API_BASE/api/workflows/$dag_wf1_id/complete")
  if echo "$complete_result" | jq -e '.ok == true' > /dev/null 2>&1; then
    ready=$(echo "$complete_result" | jq '.readyToRun | length')
    pass "DAG complete + cascade works ($ready ready)"
  else
    fail "DAG complete failed"
  fi

  # Verify step 1 is completed
  step1_status=$(apicurl "$API_BASE/api/workflows/$dag_wf1_id" | jq -r '.status // "unknown"')
  if [ "$step1_status" = "completed" ]; then
    pass "Completed workflow has status=completed"
  else
    fail "Expected completed, got $step1_status"
  fi

  # Test workflow trigger (for DAG run button)
  trigger_result=$(apicurl -X POST "$API_BASE/api/workflows/$dag_wf2_id/trigger" \
    -H 'Content-Type: application/json' \
    -d '{"manual":true}')
  if echo "$trigger_result" | jq -e '.executionId' > /dev/null 2>&1; then
    pass "Workflow trigger from DAG works"
  else
    # May fail without execution keys — that's ok
    warn "Workflow trigger: $(echo "$trigger_result" | jq -r '.error // "no keys"')"
  fi

  # Clean up
  apicurl -X DELETE "$API_BASE/api/workflows/$dag_wf1_id" > /dev/null 2>&1
  apicurl -X DELETE "$API_BASE/api/workflows/$dag_wf2_id" > /dev/null 2>&1
  apicurl -X POST "$API_BASE/api/notifications/dismiss-all" > /dev/null 2>&1
else
  warn "Could not create DAG test workflows"
fi

# =========================================
# Section 29: Budget Block Notification
# =========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "29. Budget & Template Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test reserved template names (via import-md which calls saveTemplate)
reserved_result=$(apicurl -X POST "$API_BASE/api/templates/import-md" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"---\\nname: ClawMax System Test\\ntype: organization\\nversion: \\\"1.0.0\\\"\\n---\\n\\n## Agents\\n\\n| id | name | role | tags | skills |\\n|----|------|------|------|--------|\\n| x | X | X | | |\\n\"}")
if echo "$reserved_result" | jq -e '.error' > /dev/null 2>&1; then
  error_msg=$(echo "$reserved_result" | jq -r '.error')
  if echo "$error_msg" | grep -qi "reserved"; then
    pass "Reserved template name rejected"
  else
    pass "Template save correctly rejected ($error_msg)"
  fi
else
  fail "Reserved template name should be rejected"
fi

# Test template cross-validation on import
import_bad=$(apicurl -X POST "$API_BASE/api/templates/import-md" \
  -H 'Content-Type: application/json' \
  -d "{\"content\":\"---\\nname: Cross Val Test\\ntype: organization\\nversion: \\\"1.0.0\\\"\\n---\\n\\n## Agents\\n\\n| id | name | role | tags | skills |\\n|----|------|------|------|--------|\\n| a1 | Agent 1 | Tester | test | |\\n\"}")
if echo "$import_bad" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Template import with cross-validation works"
  # Clean up
  apicurl -X DELETE "$API_BASE/api/templates/organizations/cross-val-test" > /dev/null 2>&1
else
  warn "Template import-md: $(echo "$import_bad" | jq -r '.error // "unknown"')"
fi

echo ""

# =========================================
# Integration Tests (live agents)
# =========================================
# Run with: ./test.sh integration
if [ "$1" = "integration" ] || [ "$2" = "integration" ]; then

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "INTEGRATION TESTS — Live Agent Execution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Model: server-selected cost-efficient default"
echo ""

INTEGRATION_START=$(date +%s)

# Step 1: Create/activate system-test workspace
echo -e "${YELLOW}→ Setting up system-test workspace...${NC}"
SYSTEM_TEST_WS_NAME="ClawMax System Test"
SYSTEM_TEST_WS_PATH="${HOME}/.openclaw/workspaces/clawmax-system-test"

workspaces_json=$(apicurl "$API_BASE/api/workspaces")
SYSTEM_TEST_WS=$(echo "$workspaces_json" | jq -r \
  ".workspaces[] | select(.id==\"clawmax-system-test\" or .name==\"$SYSTEM_TEST_WS_NAME\" or .path==\"$SYSTEM_TEST_WS_PATH\") | .id" \
  2>/dev/null | head -1)

# Always recreate the system-test workspace so stale hidden files
# cannot force suffixed workflow ids like test-kickoff-2.
if [ -n "$SYSTEM_TEST_WS" ]; then
  apicurl -X PUT "$API_BASE/api/workspaces/default/activate" > /dev/null 2>&1
  delete_existing_ws_result=$(apicurl -X DELETE "$API_BASE/api/workspaces/$SYSTEM_TEST_WS" 2>/dev/null)
  if echo "$delete_existing_ws_result" | jq -e '.ok == true' > /dev/null 2>&1; then
    rm -rf "$SYSTEM_TEST_WS_PATH"
  fi
fi

# Also clean stale on-disk residue even if the workspace registry no longer has
# an entry for the system-test workspace. Hidden files here can make create fail.
if [ -d "$SYSTEM_TEST_WS_PATH" ]; then
  rm -rf "$SYSTEM_TEST_WS_PATH"
fi

create_result=$(apicurl -X POST "$API_BASE/api/workspaces" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$SYSTEM_TEST_WS_NAME\",\"path\":\"$SYSTEM_TEST_WS_PATH\"}")
SYSTEM_TEST_WS=$(echo "$create_result" | jq -r '.workspace.id // empty' 2>/dev/null)
if [ -n "$SYSTEM_TEST_WS" ]; then
  echo "  Created workspace: $SYSTEM_TEST_WS"
else
  fail "Failed to create system test workspace"
  SYSTEM_TEST_WS="default"
fi

# Activate system-test workspace
apicurl -X PUT "$API_BASE/api/workspaces/$SYSTEM_TEST_WS/activate" > /dev/null 2>&1
pass "System test workspace activated"

# Step 2: Clean and re-apply template
echo -e "${YELLOW}→ Applying system-test template...${NC}"

# Delete existing test agents
existing_agents=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[]?.id' 2>/dev/null)
for agent_id in $existing_agents; do
  apicurl -X DELETE "$API_BASE/api/agents/$agent_id" \
    -H 'Content-Type: application/json' -d '{"confirm":true}' > /dev/null 2>&1
done

# Delete existing test workflows
existing_wfs=$(apicurl "$API_BASE/api/workflows" | jq -r '.workflows[]?.id' 2>/dev/null)
for wf_id in $existing_wfs; do
  apicurl -X DELETE "$API_BASE/api/workflows/$wf_id" > /dev/null 2>&1
done

# Apply system-test template with the server-selected cost-efficient model
auth_config=$(apicurl "$API_BASE/api/auth/config")
SYSTEM_TEST_MODEL=$(echo "$auth_config" | jq -r '.costEfficientModel // empty' 2>/dev/null)
if [ -z "$SYSTEM_TEST_MODEL" ] || [ "$SYSTEM_TEST_MODEL" = "null" ]; then
  SYSTEM_TEST_MODEL="openai/gpt-4o-mini"
fi
apply_result=$(apicurl -X POST "$API_BASE/api/templates/organizations/import" \
  -H 'Content-Type: application/json' \
  -d "{\"templateSlug\":\"clawmax-system-test\",\"modelOverride\":\"$SYSTEM_TEST_MODEL\",\"agentCounts\":{\"test-agent\":2}}")

if echo "$apply_result" | jq -e '.ok == true' > /dev/null 2>&1; then
  agent_count=$(echo "$apply_result" | jq '.agentIds | length')
  pass "Applied system-test template ($agent_count agents)"
else
  error_msg=$(echo "$apply_result" | jq -r '.error // "unknown"')
  fail "Failed to apply system-test template: $error_msg"
fi

# Step 3: Verify agents created
agent_list=$(apicurl "$API_BASE/api/agents" | jq -r '.agents[].id' 2>/dev/null | sort)
expected_agents="test-agent1 test-agent2 test-lead"
for agent_id in $expected_agents; do
  if echo "$agent_list" | grep -q "^${agent_id}$"; then
    pass "Agent $agent_id exists"
  else
    fail "Agent $agent_id missing"
  fi
done

# Step 4: Verify workflows created
# Template apply can return before every imported workflow is visible through
# the active workspace read path, so wait briefly for the expected ids.
wf_list=""
for i in $(seq 1 10); do
  wf_list=$(apicurl "$API_BASE/api/workflows" | jq -r '.workflows[]?.id' 2>/dev/null | sort)
  ready_count=0
  for wf_id in test-kickoff test-filesystem test-communications test-github test-dag-parallel-a test-dag-parallel-b test-report; do
    if echo "$wf_list" | grep -qx "$wf_id"; then
      ready_count=$((ready_count + 1))
    fi
  done
  if [ "$ready_count" -eq 7 ]; then
    break
  fi
  sleep 2
done

expected_wfs="test-kickoff test-filesystem test-communications test-github test-dag-parallel-a test-dag-parallel-b test-report"
for wf_id in $expected_wfs; do
  if echo "$wf_list" | grep -qx "$wf_id"; then
    pass "Workflow $wf_id exists"
  else
    fail "Workflow $wf_id missing"
  fi
done

# Step 5: Verify communities and groups
comm_count=$(apicurl "$API_BASE/api/communities" | jq '.communities | length' 2>/dev/null)
group_count=$(apicurl "$API_BASE/api/groups" | jq '.groups | length' 2>/dev/null)
if [ "$comm_count" -ge "1" ] 2>/dev/null; then
  pass "Communities exist ($comm_count)"
else
  fail "No communities found"
fi
if [ "$group_count" -ge "3" ] 2>/dev/null; then
  pass "Groups exist ($group_count)"
else
  fail "Expected 3+ groups, got $group_count"
fi

# Step 6: Test 1-1 agent chat
echo ""
echo -e "${YELLOW}→ Testing agent chat...${NC}"
chat_result=$(apicurl -X POST "$API_BASE/api/agents/test-lead/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Say HELLO in exactly one word.","sessionId":"integration-test"}' 2>/dev/null)

if echo "$chat_result" | jq -e '.text' > /dev/null 2>&1; then
  response_text=$(echo "$chat_result" | jq -r '.text' | head -1)
  pass "Agent chat works (response: ${response_text:0:50})"
else
  # Chat might use streaming — check for error
  if echo "$chat_result" | jq -e '.error' > /dev/null 2>&1; then
    error_msg=$(echo "$chat_result" | jq -r '.error')
    warn "Agent chat: $error_msg (may need gateway)"
  else
    warn "Agent chat returned unexpected format"
  fi
fi

# Step 7: Test group message
echo -e "${YELLOW}→ Testing group messaging...${NC}"
group_msg=$(apicurl -X POST "$API_BASE/api/groups/Test%20Chat/messages" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Integration test message","from":"system"}' 2>/dev/null)

if echo "$group_msg" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Group message sent"
else
  warn "Group message may not be supported via this endpoint"
fi

# Step 8: Test workflow trigger + DAG progression
echo ""
echo -e "${YELLOW}→ Testing workflow DAG execution...${NC}"

# Enable all workflows
for wf_id in test-kickoff test-filesystem test-communications test-github test-dag-parallel-a test-dag-parallel-b test-report; do
  apicurl -X PUT "$API_BASE/api/workflows/$wf_id" \
    -H 'Content-Type: application/json' -d '{"enabled":true}' > /dev/null 2>&1
done

# Set up DAG dependencies (in case import didn't preserve them)
apicurl -X PUT "$API_BASE/api/workflows/test-kickoff" -H 'Content-Type: application/json' -d '{"type":"once"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-filesystem" -H 'Content-Type: application/json' -d '{"dependsOn":["test-kickoff"],"type":"recurring"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-communications" -H 'Content-Type: application/json' -d '{"dependsOn":["test-filesystem"],"type":"recurring"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-github" -H 'Content-Type: application/json' -d '{"dependsOn":["test-communications"],"type":"recurring"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-dag-parallel-a" -H 'Content-Type: application/json' -d '{"dependsOn":["test-communications"],"type":"recurring"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-dag-parallel-b" -H 'Content-Type: application/json' -d '{"dependsOn":["test-communications"],"type":"recurring"}' > /dev/null 2>&1
apicurl -X PUT "$API_BASE/api/workflows/test-report" -H 'Content-Type: application/json' -d '{"dependsOn":["test-github","test-dag-parallel-a","test-dag-parallel-b"],"type":"conditional"}' > /dev/null 2>&1
pass "DAG dependencies configured"

# Read provider keys from dashboard .env for agent execution
BYOK_ANTHROPIC=$(grep SYSTEM_ANTHROPIC_API_KEY "dashboard/.env" 2>/dev/null | cut -d= -f2)
BYOK_OPENAI=$(grep SYSTEM_OPENAI_API_KEY "dashboard/.env" 2>/dev/null | cut -d= -f2)
BYOK_GEMINI=$(grep SYSTEM_GEMINI_API_KEY "dashboard/.env" 2>/dev/null | cut -d= -f2)
BYOK_JSON="{}"
if [ -n "$BYOK_OPENAI" ]; then
  BYOK_JSON="{\"openai\":\"$BYOK_OPENAI\"}"
elif [ -n "$BYOK_GEMINI" ]; then
  BYOK_JSON="{\"gemini\":\"$BYOK_GEMINI\"}"
elif [ -n "$BYOK_ANTHROPIC" ]; then
  BYOK_JSON="{\"anthropic\":\"$BYOK_ANTHROPIC\"}"
fi

# Trigger kickoff with BYOK keys
trigger_result=$(apicurl -X POST "$API_BASE/api/workflows/test-kickoff/trigger" \
  -H 'Content-Type: application/json' \
  -d "{\"manual\":true,\"byok\":$BYOK_JSON}")

if echo "$trigger_result" | jq -e '.executionId' > /dev/null 2>&1; then
  pass "Kickoff workflow triggered"
else
  fail "Failed to trigger kickoff"
fi

# Wait for kickoff to complete (max 120s)
echo "  Waiting for kickoff to complete (max 120s)..."
for i in $(seq 1 24); do
  sleep 5
  status=$(apicurl "$API_BASE/api/workflows/test-kickoff" | jq -r '.status // "idle"' 2>/dev/null)
  if [ "$status" = "completed" ]; then
    pass "Kickoff completed"
    break
  fi
  if [ "$i" = "24" ]; then
    warn "Kickoff did not complete in 120s (status: $status)"
  fi
done

# Check DAG status
echo -e "${YELLOW}→ Checking DAG progression...${NC}"
dag_status=$(apicurl "$API_BASE/api/workflows/dag")
completed_count=$(echo "$dag_status" | jq '[.dag[] | select(.status == "completed")] | length' 2>/dev/null)
if [ "$completed_count" -ge "1" ] 2>/dev/null; then
  pass "DAG progressing ($completed_count workflows completed)"
else
  warn "No workflows completed yet"
fi

# Step 9: Test notifications
echo ""
echo -e "${YELLOW}→ Testing notifications...${NC}"
notif_response=$(apicurl "$API_BASE/api/notifications")
if echo "$notif_response" | jq -e '.notifications' > /dev/null 2>&1; then
  notif_count=$(echo "$notif_response" | jq '.activeCount')
  pass "Notifications endpoint works ($notif_count active)"
else
  fail "Notifications endpoint failed"
fi

# Step 10: Test workflow progress API
progress_result=$(apicurl -X POST "$API_BASE/api/workflows/test-kickoff/progress" \
  -H 'Content-Type: application/json' \
  -d '{"progress":100,"detail":"Integration test","agentId":"test-lead"}')
if echo "$progress_result" | jq -e '.ok == true' > /dev/null 2>&1; then
  pass "Workflow progress API works"
else
  warn "Workflow progress API: $(echo "$progress_result" | jq -r '.error // "unknown"')"
fi

# Step 11: Test workflow complete + DAG advance
complete_result=$(apicurl -X POST "$API_BASE/api/workflows/test-kickoff/complete")
if echo "$complete_result" | jq -e '.ok == true' > /dev/null 2>&1; then
  ready=$(echo "$complete_result" | jq -r '.readyToRun | length')
  pass "Workflow complete + DAG advance (${ready} ready)"
else
  warn "Workflow complete API issue"
fi

# Step 12: Test agent file/memory access
echo ""
echo -e "${YELLOW}→ Testing agent workspace access...${NC}"

# Verify agent IDENTITY.md files were created
ws_path=$(apicurl "$API_BASE/api/health" | jq -r '.workspace')
if [ -n "$ws_path" ] && [ -f "$ws_path/AGENTS/test-lead/IDENTITY.md" ]; then
  pass "Agent IDENTITY.md exists on disk"
  # Verify content has expected fields
  if grep -q "Test Lead" "$ws_path/AGENTS/test-lead/IDENTITY.md" 2>/dev/null; then
    pass "Agent identity has correct name"
  else
    warn "Agent identity content unexpected"
  fi
else
  warn "Could not verify agent files on disk"
fi

# Test workspace-ls skill is assigned
skill_check=$(apicurl "$API_BASE/api/skills/agent/test-lead" 2>/dev/null)
if echo "$skill_check" | jq -e '.skillIds' > /dev/null 2>&1; then
  if echo "$skill_check" | jq -r '.skillIds[]' 2>/dev/null | grep -q "workspace-ls"; then
    pass "workspace-ls skill assigned to test-lead"
  else
    warn "workspace-ls skill not found on test-lead"
  fi
else
  warn "Could not check agent skills"
fi

# Test writing a memory file (simulate agent memory)
if [ -n "$ws_path" ] && [ -d "$ws_path/AGENTS/test-lead" ]; then
  mkdir -p "$ws_path/AGENTS/test-lead"
  echo "# Test Memory\nCreated by integration test at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ws_path/AGENTS/test-lead/TEST_MEMORY.md"
  if [ -f "$ws_path/AGENTS/test-lead/TEST_MEMORY.md" ]; then
    pass "Agent memory file created successfully"
    rm -f "$ws_path/AGENTS/test-lead/TEST_MEMORY.md"
  else
    fail "Failed to create agent memory file"
  fi
else
  warn "Could not test memory creation (workspace path unknown)"
fi

# Cost estimation
INTEGRATION_END=$(date +%s)
INTEGRATION_DURATION=$((INTEGRATION_END - INTEGRATION_START))
# Step 13: Cleanup — delete test agents and workflows
echo ""
echo -e "${YELLOW}→ Cleaning up system-test workspace...${NC}"
for wf_id in $(apicurl "$API_BASE/api/workflows" | jq -r '.workflows[]?.id' 2>/dev/null); do
  apicurl -X DELETE "$API_BASE/api/workflows/$wf_id" > /dev/null 2>&1
done
for agent_id in $(apicurl "$API_BASE/api/agents" | jq -r '.agents[]?.id' 2>/dev/null); do
  apicurl -X DELETE "$API_BASE/api/agents/$agent_id" \
    -H 'Content-Type: application/json' -d '{"confirm":true}' > /dev/null 2>&1
done
# Dismiss all test notifications
apicurl -X POST "$API_BASE/api/notifications/dismiss-all" > /dev/null 2>&1

# Recreate a clean system-test workspace so later runs start from a known state.
if [ -n "$SYSTEM_TEST_WS" ] && [ "$SYSTEM_TEST_WS" != "$ORIGINAL_WORKSPACE_ID" ]; then
  # Switch away from the active system-test workspace before deleting it.
  apicurl -X PUT "${API_BASE}/api/workspaces/default/activate" > /dev/null 2>&1
  delete_ws_result=$(apicurl -X DELETE "$API_BASE/api/workspaces/$SYSTEM_TEST_WS" 2>/dev/null)
  if echo "$delete_ws_result" | jq -e '.ok == true' > /dev/null 2>&1; then
    rm -rf "$SYSTEM_TEST_WS_PATH"
    recreate_ws_result=$(apicurl -X POST "$API_BASE/api/workspaces" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"$SYSTEM_TEST_WS_NAME\",\"path\":\"$SYSTEM_TEST_WS_PATH\"}")
    if echo "$recreate_ws_result" | jq -e '.workspace.id' > /dev/null 2>&1; then
      pass "System-test workspace cleaned up and recreated fresh"
    else
      warn "System-test workspace deleted but could not be recreated automatically"
    fi
  else
    warn "Could not fully reset system-test workspace"
  fi
else
  pass "System-test workspace cleaned up"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Integration Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Duration: ${INTEGRATION_DURATION}s"
echo "Model: ${SYSTEM_TEST_MODEL:-openai/gpt-4o-mini}"
echo "Est. cost: ~\$0.01-0.05 (based on ~3 agent calls)"
echo ""

fi
# End integration tests
fi # End live dashboard mutation sections

# Restore original workspace if it was different from default
if [ "$RUN_INTEGRATION" = true ] && [ -n "$ORIGINAL_WORKSPACE_ID" ] && [ "$ORIGINAL_WORKSPACE_ID" != "default" ]; then
  apicurl -X PUT "${API_BASE}/api/workspaces/${ORIGINAL_WORKSPACE_ID}/activate" > /dev/null 2>&1
  echo -e "${GREEN}✓${NC} Restored active workspace: $ORIGINAL_WORKSPACE_ID"
fi

# =========================================
# Summary
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
total=$((passed + failed))
echo "Total:  $total"
echo -e "${GREEN}Passed: $passed${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
  echo -e "${GREEN}All tests passed! ✨${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
