#!/bin/bash
# Repeatable pagination test script
# Verifies pagination works correctly without corrupting data

set -e  # Exit on error

echo "=== Pagination Test Suite ==="
echo ""

# Configuration
API_URL="http://localhost:3001/api/agents"
PAGE_SIZE=5

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Verify server is running
echo -e "${BLUE}Test 1: Verify server is running${NC}"
if ! curl -s -f "$API_URL" > /dev/null; then
    echo -e "${RED}FAIL: Server not responding at $API_URL${NC}"
    exit 1
fi
echo -e "${GREEN}PASS: Server is running${NC}"
echo ""

# Test 2: Get baseline agent count (no pagination)
echo -e "${BLUE}Test 2: Get baseline agent count${NC}"
TOTAL_AGENTS=$(curl -s "$API_URL" | jq '.agents | length')
echo "Total agents in system: $TOTAL_AGENTS"
if [ "$TOTAL_AGENTS" -eq 0 ]; then
    echo -e "${RED}FAIL: No agents found${NC}"
    exit 1
fi
echo -e "${GREEN}PASS: Found $TOTAL_AGENTS agents${NC}"
echo ""

# Test 3: First page with pagination
echo -e "${BLUE}Test 3: First page (limit=$PAGE_SIZE)${NC}"
RESPONSE=$(curl -s "$API_URL?limit=$PAGE_SIZE")
PAGE1_COUNT=$(echo "$RESPONSE" | jq '.agents | length')
HAS_MORE=$(echo "$RESPONSE" | jq -r '.hasMore')
NEXT_CURSOR=$(echo "$RESPONSE" | jq -r '.nextCursor')
REPORTED_TOTAL=$(echo "$RESPONSE" | jq -r '.total')

echo "  Agents returned: $PAGE1_COUNT"
echo "  Has more: $HAS_MORE"
echo "  Next cursor: $NEXT_CURSOR"
echo "  Reported total: $REPORTED_TOTAL"

if [ "$PAGE1_COUNT" -gt "$PAGE_SIZE" ]; then
    echo -e "${RED}FAIL: Returned more agents than limit${NC}"
    exit 1
fi

if [ "$REPORTED_TOTAL" -ne "$TOTAL_AGENTS" ]; then
    echo -e "${RED}FAIL: Reported total ($REPORTED_TOTAL) doesn't match actual ($TOTAL_AGENTS)${NC}"
    exit 1
fi

echo -e "${GREEN}PASS: First page returns correct count${NC}"
echo ""

# Test 4: Paginate through all agents
echo -e "${BLUE}Test 4: Paginate through all agents${NC}"
COLLECTED=0
CURSOR=""
PAGE_NUM=1

while true; do
    if [ -z "$CURSOR" ]; then
        URL="$API_URL?limit=$PAGE_SIZE"
    else
        URL="$API_URL?limit=$PAGE_SIZE&cursor=$CURSOR"
    fi

    RESPONSE=$(curl -s "$URL")
    COUNT=$(echo "$RESPONSE" | jq '.agents | length')
    HAS_MORE=$(echo "$RESPONSE" | jq -r '.hasMore')
    CURSOR=$(echo "$RESPONSE" | jq -r '.nextCursor')

    COLLECTED=$((COLLECTED + COUNT))
    echo "  Page $PAGE_NUM: $COUNT agents (total so far: $COLLECTED)"

    if [ "$HAS_MORE" != "true" ]; then
        break
    fi

    if [ "$CURSOR" == "null" ]; then
        break
    fi

    PAGE_NUM=$((PAGE_NUM + 1))

    # Safety: prevent infinite loop
    if [ "$PAGE_NUM" -gt 100 ]; then
        echo -e "${RED}FAIL: Too many pages (possible infinite loop)${NC}"
        exit 1
    fi
done

echo "  Total collected: $COLLECTED"

if [ "$COLLECTED" -ne "$TOTAL_AGENTS" ]; then
    echo -e "${RED}FAIL: Collected $COLLECTED agents, expected $TOTAL_AGENTS${NC}"
    exit 1
fi

echo -e "${GREEN}PASS: Successfully paginated through all agents${NC}"
echo ""

# Test 5: Verify no data corruption
echo -e "${BLUE}Test 5: Verify no data corruption${NC}"
FINAL_COUNT=$(curl -s "$API_URL" | jq '.agents | length')
if [ "$FINAL_COUNT" -ne "$TOTAL_AGENTS" ]; then
    echo -e "${RED}FAIL: Agent count changed! Before: $TOTAL_AGENTS, After: $FINAL_COUNT${NC}"
    exit 1
fi
echo -e "${GREEN}PASS: Agent count unchanged ($FINAL_COUNT agents)${NC}"
echo ""

# Test 6: Verify agent IDs are unique and stable
echo -e "${BLUE}Test 6: Verify agent IDs are unique${NC}"
ALL_IDS=$(curl -s "$API_URL" | jq -r '.agents[].id' | sort)
UNIQUE_IDS=$(echo "$ALL_IDS" | uniq)

if [ "$(echo "$ALL_IDS" | wc -l)" -ne "$(echo "$UNIQUE_IDS" | wc -l)" ]; then
    echo -e "${RED}FAIL: Duplicate agent IDs detected${NC}"
    exit 1
fi
echo -e "${GREEN}PASS: All agent IDs are unique${NC}"
echo ""

# Test 7: Backward compatibility (no pagination params)
echo -e "${BLUE}Test 7: Backward compatibility (no pagination)${NC}"
NO_PAGINATION=$(curl -s "$API_URL" | jq '.agents | length')
if [ "$NO_PAGINATION" -ne "$TOTAL_AGENTS" ]; then
    echo -e "${RED}FAIL: Non-paginated request returns different count${NC}"
    exit 1
fi

# Verify old response format still works
HAS_PAGINATION_FIELDS=$(curl -s "$API_URL" | jq 'has("hasMore") or has("nextCursor") or has("total")')
if [ "$HAS_PAGINATION_FIELDS" == "true" ]; then
    echo -e "${RED}FAIL: Non-paginated response includes pagination fields${NC}"
    exit 1
fi

echo -e "${GREEN}PASS: Backward compatibility maintained${NC}"
echo ""

# Final summary
echo -e "${GREEN}=== ALL TESTS PASSED ===${NC}"
echo ""
echo "Summary:"
echo "  Total agents: $TOTAL_AGENTS"
echo "  Pages tested: $PAGE_NUM"
echo "  No data corruption detected"
echo "  Backward compatibility verified"
echo ""
echo "✅ Pagination is working correctly and safely"
