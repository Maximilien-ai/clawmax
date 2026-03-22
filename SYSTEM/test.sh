#!/bin/bash
# set -e  # Disabled to show all test results even if one fails

# SYSTEM Test Suite
# Tests validation, APIs, and key features
#
# Usage: ./test.sh [--with-validation]
#   --with-validation: Include sections 3-6 (validation tests that modify files)
#
# WARNING: Validation tests (sections 3-6) modify live data files!
# Run without --with-validation flag to skip them (recommended).

# Ensure we're in the SYSTEM directory
cd "$(dirname "$0")"

API_BASE="http://localhost:3001"
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

# Check dashboard server is running
if ! curl -s --connect-timeout 3 --max-time 5 "$API_BASE/api/health" > /dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Dashboard server not running on $API_BASE"
  echo -e "    Start it with: ${YELLOW}./SYSTEM/start.sh${NC}"
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
  echo -e "${RED}Pre-flight checks failed.${NC} Please run ${YELLOW}./setup.sh${NC} first, then ${YELLOW}./SYSTEM/start.sh${NC}"
  exit 1
fi

echo ""

# Parse flags - validation tests are SKIPPED by default
SKIP_VALIDATION=true
for arg in "$@"; do
  if [ "$arg" = "--with-validation" ]; then
    SKIP_VALIDATION=false
  fi
done

passed=0
failed=0

echo "========================================="
echo "SYSTEM Test Suite"
echo "Dashboard | API | Integration Tests"
echo "========================================="
echo ""

# Ensure tests run on the correct workspace (default workspace for this repo)
apicurl -X PUT "${API_BASE}/api/workspaces/default/activate" > /dev/null 2>&1

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
  pass "Templates API unit tests (15 tests)"
else
  fail "Templates API unit tests"
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
echo -e "${YELLOW}→ Running Safe env / BYOK unit tests...${NC}"
npx ts-node --transpileOnly server/lib/safe-env.test.ts > /tmp/clawmax-safe-env.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-safe-env.out; then
  pass "Safe env / BYOK unit tests (8 tests)"
else
  fail "Safe env / BYOK unit tests"
fi

echo ""
echo -e "${YELLOW}→ Running Agent execution runtime unit tests...${NC}"
npx ts-node --transpileOnly server/lib/agent-execution.test.ts > /tmp/clawmax-agent-execution.out 2>&1 || true
if grep -q "All tests passed" /tmp/clawmax-agent-execution.out; then
  pass "Agent execution runtime unit tests (2 tests)"
else
  fail "Agent execution runtime unit tests"
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

# Backup current config
if [ -f ~/.openclaw/openclaw.json ]; then
  cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.test-backup
  warn "Backed up openclaw.json"
fi

# Test: Invalid agent ID (starts with number)
cat > /tmp/test-openclaw.json <<'EOF'
{
  "agents": {
    "list": [
      {
        "id": "9invalid",
        "name": "test",
        "workspace": "/tmp/test",
        "agentDir": "/tmp/test"
      }
    ]
  }
}
EOF

if [ -f ~/.openclaw/openclaw.json.test-backup ]; then
  cp /tmp/test-openclaw.json ~/.openclaw/openclaw.json
  sleep 0.5

  # Check if validation warning appears
  if apicurl "$API_BASE/api/agents" | jq -e '.agents[] | select(.id == "9invalid") | .validationWarnings' > /dev/null 2>&1; then
    pass "Invalid agent ID detected (starts with digit)"
  else
    fail "Invalid agent ID not detected"
  fi

  # Test: Missing required field
  cat > /tmp/test-openclaw-missing.json <<'EOF'
{
  "agents": {
    "list": [
      {
        "id": "test",
        "name": "test"
      }
    ]
  }
}
EOF

  cp /tmp/test-openclaw-missing.json ~/.openclaw/openclaw.json
  sleep 0.5

  if apicurl "$API_BASE/api/agents" | jq -e '.agents[] | select(.id == "test") | .validationWarnings' > /dev/null 2>&1; then
    pass "Missing required fields detected"
  else
    fail "Missing required fields not detected"
  fi

  # Restore backup
  mv ~/.openclaw/openclaw.json.test-backup ~/.openclaw/openclaw.json
  warn "Restored openclaw.json"
else
  warn "Skipping AGENTS validation tests (no openclaw.json found)"
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

# Invalid: Bad ID (starts with number)
invalid_community_id='## Communities

### 9BadCommunity
- **Description:** Invalid
- **Tags:** test'

test_validation "Invalid community ID" "ORG/COMMUNITIES.md" "$invalid_community_id" true

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

# Invalid: Bad group ID
invalid_group_id='## Groups

### 9BadGroup
- **Description:** Invalid
- **Community:** Test'

test_validation "Invalid group ID" "ORG/GROUPS.md" "$invalid_group_id" true

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
  # If no agent has skills yet, just check the field exists (can be null)
  test_json_field "Agents have skills field" "/api/agents" ".agents[0] | has(\"skills\")"
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
    fail "Gateway RPC skills update failed"
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

# Cleanup test directories
rm -rf "$TEST_SKILL_DIR" "$TEST_INVALID_DIR" "$TEST_INVALID_DIR2"

echo ""

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
