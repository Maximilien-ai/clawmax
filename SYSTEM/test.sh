#!/bin/bash
# set -e  # Disabled to show all test results even if one fails

# Dashboard Test Suite
# Tests validation, APIs, and key features
#
# Usage: ./test.sh [--with-validation]
#   --with-validation: Include sections 3-6 (validation tests that modify files)
#
# WARNING: Validation tests (sections 3-6) modify live data files!
# Run without --with-validation flag to skip them (recommended).

API_BASE="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

  response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
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

  response=$(curl -s "$API_BASE$endpoint")
  if echo "$response" | jq -e "$field" > /dev/null 2>&1; then
    pass "$name"
    return 0
  else
    fail "$name (field '$field' not found)"
    return 1
  fi
}

# Section 0: TypeScript & Unit Tests
echo ""
echo "========================================="
echo "Section 0: TypeScript & Skills Tests"
echo "========================================="
echo ""

echo -e "${YELLOW}→ Running TypeScript type check...${NC}"
if (cd dashboard && npm run typecheck 2>&1) | grep -q "error TS"; then
  fail "TypeScript type check"
else
  pass "TypeScript type check"
fi

echo ""
echo -e "${YELLOW}→ Running Skills API unit tests...${NC}"
if (cd dashboard && npx ts-node server/lib/skills.test.ts 2>&1 | grep -v "Skill file missing name" | grep -v "Failed to parse skill") | grep -q "All tests passed"; then
  pass "Skills API unit tests (14 tests)"
else
  fail "Skills API unit tests"
fi
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
test_json_field "Agents have IDs" "/api/agents" ".agents[0].id"
test_json_field "Agents have status" "/api/agents" ".agents[0].status"
test_json_field "Agents have communities" "/api/agents" ".agents[0].communities"
test_json_field "Agents have groups" "/api/agents" ".agents[0].groups"
test_json_field "Agents have tags" "/api/agents" ".agents[0].tags"

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
  if curl -s "$API_BASE/api/agents" | jq -e '.agents[] | select(.id == "9invalid") | .validationWarnings' > /dev/null 2>&1; then
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

  if curl -s "$API_BASE/api/agents" | jq -e '.agents[] | select(.id == "test") | .validationWarnings' > /dev/null 2>&1; then
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
test_json_field "Docs have AGENTS section" "/api/docs" '.entries | map(select(.section == "AGENTS")) | length'
test_json_field "Docs have SYSTEM section" "/api/docs" '.entries | map(select(.section == "SYSTEM")) | length'

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
response=$(curl -s -X POST "$API_BASE/api/groups/General/messages" \
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
test_json_field "Activity has agentId" "/api/activity" ".feed[0].agentId"
test_json_field "Activity has file" "/api/activity" ".feed[0].file"
test_json_field "Activity has ageMins" "/api/activity" ".feed[0].ageMins"

# Verify we have activity from multiple agents
agent_count=$(curl -s "$API_BASE/api/activity" | jq '.feed | map(.agentId) | unique | length')
if [ "$agent_count" -gt 1 ]; then
  pass "Activity from multiple agents ($agent_count agents)"
else
  fail "Activity from multiple agents (only $agent_count agent)"
fi

echo ""

# =========================================
# Section 11: WhatsApp Integration
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "11. WhatsApp Integration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test agent health endpoint includes WhatsApp status
test_api "Agent health endpoint" "/api/agents/dave/health"
test_json_field "Health has channels" "/api/agents/dave/health" ".channels"
test_json_field "WhatsApp channel status" "/api/agents/dave/health" ".channels.whatsapp"
test_json_field "WhatsApp configured" "/api/agents/dave/health" ".channels.whatsapp.configured"
test_json_field "WhatsApp linked status" "/api/agents/dave/health" ".channels.whatsapp.linked"

# Verify groups have WhatsApp channels
whatsapp_groups=$(curl -s "$API_BASE/api/groups" | jq '[.groups[] | select(.channels[]? == "whatsapp")] | length')
if [ "$whatsapp_groups" -gt 0 ]; then
  pass "Groups with WhatsApp channel ($whatsapp_groups groups)"
else
  fail "Groups with WhatsApp channel (none found)"
fi

echo ""

# =========================================
# Section 12: MANDATE.md Schema Validation
# =========================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "12. MANDATE.md Schema Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify mandate schema exists
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
if [ -f "$WORKSPACE/SYSTEM/schemas/mandate.schema.json" ]; then
  pass "MANDATE.md schema file exists"

  # Test schema is valid JSON
  if jq empty "$WORKSPACE/SYSTEM/schemas/mandate.schema.json" 2>/dev/null; then
    pass "MANDATE.md schema is valid JSON"
  else
    fail "MANDATE.md schema is not valid JSON"
  fi
else
  fail "MANDATE.md schema file not found"
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
response=$(curl -s "$API_BASE/api/docs/search?q=")
if echo "$response" | jq -e '.results == []' > /dev/null 2>&1; then
  pass "Empty query returns empty results"
else
  fail "Empty query did not return empty results"
fi

# Test search for "template" returns results
response=$(curl -s "$API_BASE/api/docs/search?q=template")
result_count=$(echo "$response" | jq '.results | length')
if [ "$result_count" -gt 0 ]; then
  pass "Search for 'template' found $result_count results"
else
  fail "Search for 'template' found no results"
fi

# Test search results have required fields (path, matches, preview)
response=$(curl -s "$API_BASE/api/docs/search?q=agent")
if echo "$response" | jq -e '.results[0] | has("path") and has("matches") and has("preview")' > /dev/null 2>&1; then
  pass "Search results contain required fields"
else
  fail "Search results missing required fields"
fi

# Test search results sorted by matches (descending)
response=$(curl -s "$API_BASE/api/docs/search?q=the")
first_matches=$(echo "$response" | jq '.results[0].matches // 0')
second_matches=$(echo "$response" | jq '.results[1].matches // 0')
if [ "$first_matches" -ge "$second_matches" ]; then
  pass "Search results sorted by match count (descending)"
else
  fail "Search results not properly sorted"
fi

# Test search is case-insensitive
lower_response=$(curl -s "$API_BASE/api/docs/search?q=community")
upper_response=$(curl -s "$API_BASE/api/docs/search?q=COMMUNITY")
lower_count=$(echo "$lower_response" | jq '.results | length')
upper_count=$(echo "$upper_response" | jq '.results | length')
if [ "$lower_count" -eq "$upper_count" ]; then
  pass "Search is case-insensitive"
else
  fail "Search case-sensitivity mismatch"
fi

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
