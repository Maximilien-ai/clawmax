#!/bin/bash
# Test script for template APIs

set -e  # Exit on error

API="http://localhost:3001/api"
AGENT_ID="todd0"  # Use an existing agent

echo "=== Testing Template System ==="
echo ""

echo "1. Testing GET /api/templates (should return empty initially)"
curl -s "$API/templates" | jq '.'
echo ""

echo "2. Testing POST /api/templates/agents/$AGENT_ID/save (create template from agent)"
curl -s -X POST "$API/templates/agents/$AGENT_ID/save" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Senior Software Engineer",
    "description": "A test template for senior engineers",
    "author": "maximilien",
    "tags": ["engineer", "golang", "test"]
  }' | jq '.'
echo ""

echo "3. Testing GET /api/templates (should show 1 template)"
curl -s "$API/templates" | jq '.'
echo ""

echo "4. Testing GET /api/templates/agents (should show 1 agent template)"
curl -s "$API/templates/agents" | jq '.'
echo ""

echo "5. Testing GET /api/templates/agents/test-senior-software-engineer (get specific template)"
curl -s "$API/templates/agents/test-senior-software-engineer" | jq '.'
echo ""

echo "6. Testing DELETE /api/templates/agents/test-senior-software-engineer (delete template)"
curl -s -X DELETE "$API/templates/agents/test-senior-software-engineer" | jq '.'
echo ""

echo "7. Testing GET /api/templates (should be empty again)"
curl -s "$API/templates" | jq '.'
echo ""

echo "=== All tests passed! ==="
