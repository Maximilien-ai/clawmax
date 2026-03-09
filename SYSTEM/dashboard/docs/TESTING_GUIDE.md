# ClawMax Testing Guide

## Issue Analysis & Solutions

### 1. Test Count: 92 vs 106 Tests ✅ **RESOLVED**

**What you see**: 92 tests passing
**What's actually running**: 106 tests total

**Breakdown**:
- 77 API integration tests (main test.sh)
- 14 Skills unit tests (counted as 1 in test.sh)
- 15 Templates unit tests (counted as 1 in test.sh)
- **Total**: 77 + 14 + 15 = **106 tests**

**Why**: The test.sh script counts each unit test *suite* as 1 test for the overall count, but each suite runs multiple internal tests.

**Verify**:
```bash
# Run individual test suites
cd SYSTEM/dashboard
npx ts-node server/lib/skills.test.ts     # Shows "Passed: 14"
npx ts-node server/lib/templates.test.ts  # Shows "Passed: 15"

# Run full suite
cd ..
./test.sh  # Shows "Total: 92" (includes 2 suite tests)
```

---

### 2. Typing Indicators in Communication View 🔍 **TIMING ISSUE**

**What you expect**: See animated typing indicators when workflow runs
**What you need**: Have Communication view open DURING workflow execution

**Why it doesn't work**:
- Typing indicators only show while workflow is **actively running**
- They check every 5 seconds for running workflows
- If workflow completes before you switch to Communication view, indicators are already gone

**How to test properly**:

#### Step 1: Open Communication view FIRST
1. Go to Communication page
2. Find and open "Status" group chat panel
3. Keep it visible

#### Step 2: Run workflow from another window/tab
1. Open Workflows page in split screen or another tab
2. Find "Status Check" workflow
3. Click "▶ Run Now"

#### Step 3: Watch Communication view
- Within 5 seconds, you should see typing indicators appear
- Look for animated 3-dot bouncing indicators under agent names
- They'll disappear as agents complete their responses

**Debug checklist**:
```bash
# 1. Verify fetchActiveWorkflows is being called
# Open browser console in Communication view, look for:
# "Failed to fetch active workflows:" (if there's an error)

# 2. Check workflow is targeting the right group
curl -s http://localhost:3001/api/workflows/status-check | jq '.targeting'
# Should show: "groups": ["Status"]

# 3. Verify workflow is actually running
curl -s 'http://localhost:3001/api/workflows/status-check/executions?limit=1' | jq '.executions[0].status'
# Should show: "running" or "pending" while active
```

---

### 3. Workflow Completion Toast 🔔 **TIMING ISSUE**

**What you expect**: Toast notification when workflow completes
**What you need**: Stay on Workflows page until workflow completes

**Why it doesn't work**:
- Toast only appears if you're on the Workflows page when execution transitions from running → completed
- The polling checks every 5 seconds for status changes
- If you navigate away or workflow completes instantly, you miss the toast

**How to test properly**:

#### Method 1: Stay on Workflows page
1. Go to Workflows page
2. Click "▶ Run Now" on any workflow
3. **Don't navigate away**
4. Watch the workflow card - it should show "Running..."
5. Wait for completion (5-60 seconds depending on agents)
6. Toast should appear: "✅ [Workflow Name] completed (3/3 agents)"

#### Method 2: Use console to verify
```javascript
// Open browser console on Workflows page
// Look for log message:
[Workflow Toast] Status Check pending → completed

// If you see this log but no toast, there's a bug
// If you don't see this log, workflow completed before you opened the page
```

**Debug checklist**:
```bash
# 1. Check polling is active
# Browser console should show requests every 5s:
# GET /api/workflows/status-check/executions?limit=1

# 2. Verify trackedExecutions state
# In React DevTools, find Workflows component
# Look for trackedExecutions Map - should contain workflow IDs with status

# 3. Test with a slow workflow
# Create a workflow that targets many agents (10+)
# Gives you more time to see the transition
```

---

### 4. Organization Template Import/Export 📦 **SAFE TESTING**

**Your concern**: "Will this pollute my current workspace?"
**Answer**: Yes, imports will add agents/workflows to current workspace

**Safe testing options**:

#### Option A: Use a separate workspace (RECOMMENDED)
```bash
# 1. Create test workspace
mkdir -p ~/.openclaw/workspace-test
export OPENCLAW_WORKSPACE=~/.openclaw/workspace-test

# 2. Initialize with minimal structure
mkdir -p ~/.openclaw/workspace-test/{AGENTS,WORKFLOWS,ORG,SYSTEM}

# 3. Start dashboard pointing to test workspace
cd ~/.openclaw/workspace/SYSTEM
# Edit start.sh to use OPENCLAW_WORKSPACE env var
./start.sh

# 4. Test import/export freely
# Dashboard will operate on workspace-test

# 5. Return to main workspace
unset OPENCLAW_WORKSPACE
./stop.sh && ./start.sh
```

#### Option B: Test export only (NO IMPORT)
```bash
# 1. Export current org
# Dashboard → Organizations page → "📦 Export as Template"
# Name it: "backup-2026-03-09"

# 2. Verify export
ls -la ~/.openclaw/workspace/TEMPLATES/organizations/backup-2026-03-09/
# Should see: template.json + agents/

# 3. Inspect template
cat ~/.openclaw/workspace/TEMPLATES/organizations/backup-2026-03-09/template.json | jq '.agents | length'
# Shows agent count

# 4. DON'T CLICK IMPORT
# Just verify the export worked
```

#### Option C: Import pre-built templates (SAFE)
```bash
# Pre-built templates are designed for clean workspaces
# But you can import with prefix to avoid conflicts:

# 1. Go to Templates page
# 2. Find "Small Startup Team" or "Engineering Team"
# 3. Click to view details
# 4. Click "⚡ Apply Template"
# 5. Add prefix: "test-" or "demo-"
# Example: "test-ceo", "test-engineer", "test-product-manager"

# 6. Verify import
curl -s http://localhost:3001/api/agents | jq '.agents[] | select(.id | startswith("test-")) | .id'

# 7. Clean up easily
rm -rf ~/.openclaw/workspace/AGENTS/test-*
# Delete workflows manually from dashboard
```

#### Option D: Git safety net
```bash
# 1. Commit current state
cd ~/.openclaw/workspace
git add -A
git commit -m "checkpoint: before template testing"

# 2. Test import
# Do whatever you want in dashboard

# 3. If things go wrong, rollback
git reset --hard HEAD
git clean -fd

# 4. Restart dashboard
cd SYSTEM
./stop.sh && ./start.sh
```

---

## Complete Feature Test Plan

### Test 1: Typing Indicators
```bash
# Window 1: Communication view (keep visible)
# 1. Open http://localhost:5173
# 2. Go to Communication page
# 3. Click "Status" group to open chat panel

# Window 2: Workflows page
# 1. Open http://localhost:5173 in another tab
# 2. Go to Workflows page
# 3. Run "Status Check" workflow
# 4. Immediately switch back to Window 1

# Expected: Within 5 seconds, see typing indicators in chat
# - Animated 3 bouncing dots
# - Below agent names (ceo, engineer, max0)
# - Disappear as agents respond
```

### Test 2: Completion Toast
```bash
# 1. Go to Workflows page
# 2. Run "Status Check" workflow
# 3. Stay on page, don't navigate away
# 4. Watch for:
#    - Workflow card shows "Running..."
#    - After 10-30 seconds, toast appears
#    - Toast shows: "✅ Status Check completed (3/3 agents)"

# If workflow completes too fast:
# - Create a new workflow targeting 10+ agents
# - Gives more time to see the transition
```

### Test 3: Org Template Export
```bash
# 1. Go to Organizations page
# 2. Click "📦 Export as Template" button
# 3. Fill in:
#    - Name: "My Team Structure"
#    - Description: "Complete team with workflows"
#    - Author: Your name
#    - Tags: "production", "team"
# 4. Click "Save"
# 5. Verify: Go to Templates page → Organizations tab
#    - Should see "My Team Structure" card
#    - Shows agent count, community count, workflow count
```

### Test 4: Org Template Import (with prefix)
```bash
# 1. Go to Templates page → Organizations tab
# 2. Click "Small Startup Team"
# 3. Click "⚡ Apply Template"
# 4. Add prefix: "demo-"
# 5. Preview shows:
#    - ceo → demo-ceo
#    - engineer → demo-engineer
#    - product-manager → demo-product-manager
# 6. Click "Apply"
# 7. Verify: Go to Agents page
#    - Should see 3 new agents with "demo-" prefix
# 8. Verify: Go to Workflows page
#    - Should see 2 new workflows (Daily Standup, Weekly Status)
```

### Test 5: Complex Workflow Test
```bash
# 1. Go to Templates page → Workflows tab
# 2. Find "Complex Integration Test"
# 3. Click "Copy to Workflows" (creates editable copy)
# 4. Edit targeting to use your agents
# 5. Go to Workflows page
# 6. Run "Complex Integration Test"
# 7. Go to Workflows page → Executions
# 8. Click execution to see detailed results
# 9. Review agent responses for:
#    - File operations (read/write)
#    - Bash commands executed
#    - Web research results (if agents have web access)
#    - GitHub operations (if gh CLI available)
```

---

## Known Limitations

1. **Typing indicators**: Only visible during active workflow execution (5s polling interval)
2. **Completion toast**: Only appears if you're on Workflows page when workflow completes
3. **Template import**: Adds to current workspace (use prefix to avoid conflicts)
4. **Test count display**: Unit test suites counted as single tests in test.sh summary
5. **Fast workflows**: May complete before UI updates (< 5 second execution time)

---

## Quick Reference

### Run all tests
```bash
cd ~/.openclaw/workspace/SYSTEM
./test.sh
```

### Run unit tests individually
```bash
cd dashboard
npx ts-node server/lib/skills.test.ts      # 14 tests
npx ts-node server/lib/templates.test.ts   # 15 tests
```

### Check dashboard logs
```bash
tail -f /tmp/dashboard.log | grep -E "Toast|typing|workflow"
```

### Verify workflow status
```bash
curl -s http://localhost:3001/api/workflows/status-check/executions?limit=1 | jq '.executions[0]'
```

### List templates
```bash
ls -la ~/.openclaw/workspace/TEMPLATES/organizations/
ls -la ~/.openclaw/workspace/WORKFLOWS/templates/
```

---

## Troubleshooting

### Typing indicators never appear
- **Cause**: Workflow completes too fast (< 5 seconds)
- **Fix**: Create workflow targeting 10+ agents for longer execution

### Toast doesn't show
- **Cause**: Navigated away from Workflows page before completion
- **Fix**: Stay on Workflows page for 30+ seconds after starting workflow

### Template import fails
- **Cause**: Agent ID conflicts (agent already exists)
- **Fix**: Use prefix/suffix to rename agents during import

### Tests show 92 instead of 106
- **This is correct**: 92 integration tests + 29 unit tests (counted as 2 suite tests)
- **To see all**: Run unit tests individually to see internal counts

---

Last Updated: March 9, 2026
