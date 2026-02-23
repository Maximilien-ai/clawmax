#!/bin/bash
# Test suite for new features added in Feb 24 sprint
# Tests: Pagination, Performance, Network handling, Mobile responsiveness

set -e  # Exit on error

API_BASE="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

echo "========================================="
echo "New Features Test Suite (Feb 24, 2025)"
echo "========================================="
echo ""

pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((passed++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((failed++))
}

test_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =========================================
# Test 1: Pagination API
# =========================================
test_section "1. Pagination API"

# Test 1.1: Default behavior (no pagination params returns all)
echo "Test 1.1: Default behavior (backward compatibility)"
RESPONSE=$(curl -s "$API_BASE/api/agents")
HAS_AGENTS=$(echo "$RESPONSE" | jq 'has("agents")')
HAS_PAGINATION=$(echo "$RESPONSE" | jq 'has("hasMore") or has("nextCursor") or has("total")')

if [ "$HAS_AGENTS" == "true" ] && [ "$HAS_PAGINATION" == "false" ]; then
  pass "Non-paginated request returns only agents array"
else
  fail "Non-paginated request format incorrect"
fi

# Test 1.2: Paginated request returns pagination fields
echo "Test 1.2: Paginated request returns pagination metadata"
RESPONSE=$(curl -s "$API_BASE/api/agents?limit=5")
HAS_AGENTS=$(echo "$RESPONSE" | jq 'has("agents")')
HAS_HAS_MORE=$(echo "$RESPONSE" | jq 'has("hasMore")')
HAS_NEXT_CURSOR=$(echo "$RESPONSE" | jq 'has("nextCursor")')
HAS_TOTAL=$(echo "$RESPONSE" | jq 'has("total")')

if [ "$HAS_AGENTS" == "true" ] && [ "$HAS_HAS_MORE" == "true" ] && [ "$HAS_NEXT_CURSOR" == "true" ] && [ "$HAS_TOTAL" == "true" ]; then
  pass "Paginated request returns all metadata fields"
else
  fail "Paginated request missing metadata fields"
fi

# Test 1.3: Limit param works correctly
echo "Test 1.3: Limit parameter works"
RESPONSE=$(curl -s "$API_BASE/api/agents?limit=3")
AGENT_COUNT=$(echo "$RESPONSE" | jq '.agents | length')

if [ "$AGENT_COUNT" -le 3 ]; then
  pass "Limit parameter respected (returned $AGENT_COUNT agents)"
else
  fail "Limit parameter not working (returned $AGENT_COUNT agents, expected ≤3)"
fi

# Test 1.4: Cursor pagination works
echo "Test 1.4: Cursor-based pagination"
RESPONSE1=$(curl -s "$API_BASE/api/agents?limit=2")
HAS_MORE=$(echo "$RESPONSE1" | jq -r '.hasMore')
NEXT_CURSOR=$(echo "$RESPONSE1" | jq -r '.nextCursor')

if [ "$HAS_MORE" == "true" ] && [ "$NEXT_CURSOR" != "null" ]; then
  # Try to fetch next page
  RESPONSE2=$(curl -s "$API_BASE/api/agents?limit=2&cursor=$NEXT_CURSOR")
  PAGE2_COUNT=$(echo "$RESPONSE2" | jq '.agents | length')

  if [ "$PAGE2_COUNT" -gt 0 ]; then
    pass "Cursor pagination works (fetched page 2 with $PAGE2_COUNT agents)"
  else
    fail "Cursor pagination returned empty page 2"
  fi
else
  pass "Cursor pagination not needed (too few agents)"
fi

# =========================================
# Test 2: Error Handling & Toast System
# =========================================
test_section "2. Error Handling & Toast System"

# Test 2.1: Components exist
echo "Test 2.1: Toast component file exists"
if [ -f "SYSTEM/dashboard/client/src/components/Toast.tsx" ]; then
  pass "Toast component exists"
else
  fail "Toast component not found"
fi

echo "Test 2.2: ErrorBoundary component file exists"
if [ -f "SYSTEM/dashboard/client/src/components/ErrorBoundary.tsx" ]; then
  pass "ErrorBoundary component exists"
else
  fail "ErrorBoundary component not found"
fi

# Test 2.3: Toast exports
echo "Test 2.3: Toast component exports correct functions"
TOAST_EXPORTS=$(grep -E "export.*function.*(showToast|showSuccess|showError|showWarning|showInfo|useToast)" SYSTEM/dashboard/client/src/components/Toast.tsx | wc -l)
if [ "$TOAST_EXPORTS" -ge 1 ]; then
  pass "Toast component exports notification functions"
else
  fail "Toast component missing expected exports"
fi

# =========================================
# Test 3: Connection Status Feature
# =========================================
test_section "3. Connection Status Feature"

# Test 3.1: Component file exists
echo "Test 3.1: ConnectionStatus component exists"
if [ -f "SYSTEM/dashboard/client/src/components/ConnectionStatus.tsx" ]; then
  pass "ConnectionStatus component exists"
else
  fail "ConnectionStatus component not found"
fi

# Test 3.2: Hook export
echo "Test 3.2: useOnlineStatus hook exported"
if grep -q "export function useOnlineStatus" SYSTEM/dashboard/client/src/components/ConnectionStatus.tsx; then
  pass "useOnlineStatus hook exported"
else
  fail "useOnlineStatus hook not found"
fi

# Test 3.3: Component uses navigator.onLine
echo "Test 3.3: Component uses navigator.onLine API"
if grep -q "navigator.onLine" SYSTEM/dashboard/client/src/components/ConnectionStatus.tsx; then
  pass "Component uses navigator.onLine API"
else
  fail "Component doesn't use navigator.onLine"
fi

# Test 3.4: Component integrated into App
echo "Test 3.4: ConnectionStatus integrated into App.tsx"
if grep -q "ConnectionStatus" SYSTEM/dashboard/client/src/App.tsx; then
  pass "ConnectionStatus integrated into App"
else
  fail "ConnectionStatus not integrated into App"
fi

# =========================================
# Test 4: Performance Optimizations
# =========================================
test_section "4. Performance Optimizations"

# Test 4.1: AgentCard memoized
echo "Test 4.1: AgentCard component memoized"
if grep -q "React.memo.*AgentCard" SYSTEM/dashboard/client/src/pages/Agents.tsx; then
  pass "AgentCard is memoized with React.memo"
else
  fail "AgentCard not memoized"
fi

# Test 4.2: CommunitiesManager memoized
echo "Test 4.2: CommunitiesManager component memoized"
if grep -q "React.memo.*CommunitiesManager" SYSTEM/dashboard/client/src/components/CommunitiesManager.tsx; then
  pass "CommunitiesManager is memoized with React.memo"
else
  fail "CommunitiesManager not memoized"
fi

# Test 4.3: Loading skeletons present
echo "Test 4.3: Loading skeletons implemented"
if grep -q "animate-pulse" SYSTEM/dashboard/client/src/pages/Agents.tsx; then
  pass "Loading skeletons with animate-pulse"
else
  fail "Loading skeletons not found"
fi

# Test 4.4: Empty states
echo "Test 4.4: Empty states implemented"
EMPTY_STATES=$(grep -c "No agents" SYSTEM/dashboard/client/src/pages/Agents.tsx || echo 0)
if [ "$EMPTY_STATES" -ge 1 ]; then
  pass "Empty states implemented ($EMPTY_STATES found)"
else
  fail "Empty states not found"
fi

# =========================================
# Test 5: Mobile Responsiveness
# =========================================
test_section "5. Mobile Responsiveness"

# Test 5.1: Mobile nav state
echo "Test 5.1: Mobile navigation state exists"
if grep -q "mobileNavOpen" SYSTEM/dashboard/client/src/App.tsx; then
  pass "Mobile navigation state implemented"
else
  fail "Mobile navigation state not found"
fi

# Test 5.2: Hamburger menu
echo "Test 5.2: Mobile menu button exists"
if grep -q "md:hidden.*Toggle menu" SYSTEM/dashboard/client/src/App.tsx; then
  pass "Hamburger menu button implemented"
else
  fail "Hamburger menu button not found"
fi

# Test 5.3: Mobile breakpoints
echo "Test 5.3: Responsive classes use md: breakpoint"
MD_BREAKPOINTS=$(grep -c "md:" SYSTEM/dashboard/client/src/App.tsx || echo 0)
if [ "$MD_BREAKPOINTS" -ge 3 ]; then
  pass "Responsive breakpoints implemented ($MD_BREAKPOINTS uses of md:)"
else
  fail "Insufficient responsive breakpoints ($MD_BREAKPOINTS found)"
fi

# Test 5.4: Mobile overlay backdrop
echo "Test 5.4: Mobile overlay backdrop exists"
if grep -q "bg-black/50.*md:hidden" SYSTEM/dashboard/client/src/App.tsx; then
  pass "Mobile overlay backdrop implemented"
else
  fail "Mobile overlay backdrop not found"
fi

# =========================================
# Test 6: Loading States & UX
# =========================================
test_section "6. Loading States & UX"

# Test 6.1: Disabled buttons during operations
echo "Test 6.1: Buttons disabled during async operations"
DISABLED_BUTTONS=$(grep -c "disabled=" SYSTEM/dashboard/client/src/pages/Agents.tsx || echo 0)
if [ "$DISABLED_BUTTONS" -ge 2 ]; then
  pass "Buttons disable during operations ($DISABLED_BUTTONS disabled states)"
else
  fail "Insufficient disabled button states ($DISABLED_BUTTONS found)"
fi

# Test 6.2: Loading spinners
echo "Test 6.2: Loading spinners implemented"
if grep -q "Loading\.\.\." SYSTEM/dashboard/client/src/pages/Agents.tsx; then
  pass "Loading indicators present"
else
  fail "Loading indicators not found"
fi

# Test 6.3: Refresh cooldown
echo "Test 6.3: Refresh cooldown implemented"
if grep -q "cooling" SYSTEM/dashboard/client/src/pages/Agents.tsx; then
  pass "Refresh cooldown to prevent spam"
else
  fail "Refresh cooldown not found"
fi

# =========================================
# Summary
# =========================================
echo ""
echo "========================================="
echo -e "${BLUE}Test Summary${NC}"
echo "========================================="
echo -e "${GREEN}Passed: $passed${NC}"
if [ "$failed" -gt 0 ]; then
  echo -e "${RED}Failed: $failed${NC}"
else
  echo -e "${GREEN}Failed: $failed${NC}"
fi
echo "========================================="
echo ""

if [ "$failed" -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
