# Template Testing Checklist - March 12, 2026

**Purpose**: Verify all 3 pre-built organization templates work correctly before Friday demo
**Time budget**: 2-2.5 hours
**Testing workspace**: Create fresh test workspaces for each template

---

## Pre-Testing Setup

### Environment Check
- [ ] Dashboard running: `cd SYSTEM/dashboard/client && npm run dev`
- [ ] Dashboard accessible at http://localhost:5173
- [ ] No JavaScript errors in console
- [ ] Current workspace noted (to restore after testing)

### Baseline Verification
- [ ] Templates page loads
- [ ] Can see all 3 org templates:
  - Small Startup Team
  - Engineering Team
  - QA Team
- [ ] Template details viewable (click each one)

---

## Test 1: Small Startup Team Template

**Expected**: 3 agents + 2 workflows
- Agents: CEO, Engineer, Product Manager
- Workflows: Daily Standup, Weekly Status Report

### Step 1: Create Test Workspace
- [ ] Create new workspace: `test-startup-team`
- [ ] Switch to new workspace in dashboard
- [ ] Verify empty agents list
- [ ] Verify no workflows exist

### Step 2: Import Template
- [ ] Navigate to Templates page
- [ ] Find "Small Startup Team" template
- [ ] Click "Import" or "Use Template"
- [ ] If prompted for prefix/suffix, use: `demo-`
- [ ] Wait for import to complete
- [ ] Check for success message/toast

### Step 3: Verify Agents Created
- [ ] Navigate to Dashboard (Agents page)
- [ ] Verify 3 agents exist:
  - [ ] `demo-ceo` (or similar based on prefix)
  - [ ] `demo-engineer`
  - [ ] `demo-product-manager`
- [ ] Check each agent card shows:
  - [ ] Identity/role
  - [ ] Tags (should have appropriate tags)
  - [ ] Communities/groups membership
  - [ ] Status (may show offline initially - OK)

### Step 4: Verify Organizational Structure
- [ ] Navigate to Organizations page
- [ ] Verify communities created (check template for expected communities)
- [ ] Verify groups created
- [ ] Check agent memberships match template design
- [ ] Verify hierarchy displays correctly

### Step 5: Verify Workflows Created
- [ ] Navigate to Workflows page
- [ ] Verify 2 workflows exist:
  - [ ] "Daily Standup"
  - [ ] "Weekly Status Report"
- [ ] Open each workflow and check:
  - [ ] Schedule set correctly
  - [ ] Targeting configured (communities/groups/tags/agents)
  - [ ] Content/instructions present
  - [ ] Can view workflow details

### Step 6: Start Agents
- [ ] For each agent, start their gateway:
  ```bash
  openclaw gateway start demo-ceo --workspace /path/to/test-startup-team
  openclaw gateway start demo-engineer --workspace /path/to/test-startup-team
  openclaw gateway start demo-product-manager --workspace /path/to/test-startup-team
  ```
- [ ] Wait 10-15 seconds for gateways to start
- [ ] Refresh dashboard
- [ ] Verify all 3 agents show "online" status

### Step 7: Execute "Daily Standup" Workflow
- [ ] Navigate to Workflows page
- [ ] Find "Daily Standup" workflow
- [ ] Click "Run Now" button
- [ ] Verify execution starts (redirects to Executions page or shows toast)
- [ ] Navigate to Executions page if not auto-redirected
- [ ] Watch execution in real-time:
  - [ ] Shows "Running" status
  - [ ] Participant list shows all 3 agents
  - [ ] Participant statuses update (pending → running → completed)
  - [ ] No errors in logs
- [ ] Wait for completion (may take 30-90 seconds)
- [ ] Verify completion toast/notification
- [ ] Check execution details:
  - [ ] All 3 participants completed successfully
  - [ ] Can view each agent's response
  - [ ] Responses make sense for their roles
  - [ ] No timeout errors

### Step 8: Execute "Weekly Status Report" Workflow
- [ ] Navigate to Workflows page
- [ ] Find "Weekly Status Report" workflow
- [ ] Click "Run Now"
- [ ] Monitor execution (same checks as Step 7)
- [ ] Verify all agents respond appropriately
- [ ] Check execution logs for any errors

### Step 9: Communication Test
- [ ] Navigate to Communication page
- [ ] Verify groups/communities visible
- [ ] Click into a group (e.g., "Engineering Team" or "Startup Team")
- [ ] Send a test message: "Hello team, testing communication"
- [ ] Verify message appears in chat
- [ ] Check if agents respond (may take 10-30 seconds)
- [ ] Verify responses appear in chat thread

### Step 10: Cleanup & Document
- [ ] Stop all test agent gateways (Ctrl+C in terminals)
- [ ] Document any issues found:
  - Agents that didn't start
  - Workflows that failed
  - Missing communities/groups
  - Errors in execution
- [ ] Take screenshots if issues found
- [ ] Switch back to main workspace

### Test 1 Results
**Status**: [ ] PASS / [ ] FAIL / [ ] NEEDS FIX

**Issues found**:
```
(List any issues here)
```

**Notes**:
```
(Any observations or notes)
```

---

## Test 2: Engineering Team Template

**Expected**: 3 agents + 3 workflows
- Agents: Engineer, QA Engineer, Release Coordinator
- Workflows: Code Review Reminder, Sprint Planning, Release Preparation

### Step 1: Create Test Workspace
- [ ] Create new workspace: `test-engineering-team`
- [ ] Switch to new workspace
- [ ] Verify clean slate

### Step 2: Import Template
- [ ] Import "Engineering Team" template
- [ ] Use prefix: `eng-`
- [ ] Wait for completion

### Step 3: Verify Agents
- [ ] Check 3 agents created:
  - [ ] `eng-engineer`
  - [ ] `eng-qa-engineer`
  - [ ] `eng-release-coordinator`
- [ ] Verify identities and tags
- [ ] Check community/group memberships

### Step 4: Verify Organization
- [ ] Check communities created
- [ ] Check groups created
- [ ] Verify hierarchy

### Step 5: Verify Workflows
- [ ] Verify 3 workflows exist:
  - [ ] "Code Review Reminder"
  - [ ] "Sprint Planning"
  - [ ] "Release Preparation"
- [ ] Check each workflow configured correctly

### Step 6: Start Agents
- [ ] Start all 3 agent gateways
- [ ] Verify all online in dashboard

### Step 7: Execute "Code Review Reminder"
- [ ] Run workflow
- [ ] Monitor execution
- [ ] Verify all agents respond
- [ ] Check for errors

### Step 8: Execute "Sprint Planning"
- [ ] Run workflow
- [ ] Monitor execution
- [ ] Verify responses

### Step 9: Execute "Release Preparation"
- [ ] Run workflow
- [ ] Monitor execution
- [ ] Verify completion

### Step 10: Quick Communication Test
- [ ] Send message to engineering group
- [ ] Verify chat works

### Step 11: Cleanup
- [ ] Stop gateways
- [ ] Document issues
- [ ] Switch workspace

### Test 2 Results
**Status**: [ ] PASS / [ ] FAIL / [ ] NEEDS FIX

**Issues found**:
```
(List any issues here)
```

---

## Test 3: QA Team Template

**Expected**: 3 agents + 4 workflows
- Agents: QA Engineer, GitHub Triager, Release Coordinator
- Workflows: PR Review, Issue Triage, CI/CD Monitor, Status Report to PM

### Step 1: Create Test Workspace
- [ ] Create new workspace: `test-qa-team`
- [ ] Switch workspace
- [ ] Verify empty

### Step 2: Import Template
- [ ] Import "QA Team" template
- [ ] Use prefix: `qa-`
- [ ] Wait for completion

### Step 3: Verify Agents
- [ ] Check 3 agents created:
  - [ ] `qa-qa-engineer`
  - [ ] `qa-github-triager`
  - [ ] `qa-release-coordinator`
- [ ] Verify identities/tags/memberships

### Step 4: Verify Organization
- [ ] Check communities
- [ ] Check groups
- [ ] Verify structure

### Step 5: Verify Workflows
- [ ] Verify 4 workflows exist:
  - [ ] "PR Review"
  - [ ] "Issue Triage"
  - [ ] "CI/CD Monitor"
  - [ ] "Status Report to PM"
- [ ] Check configurations

### Step 6: Start Agents
- [ ] Start all 3 gateways
- [ ] Verify online

### Step 7: Execute All 4 Workflows (one at a time)
- [ ] Run "PR Review"
  - [ ] Monitor execution
  - [ ] Verify completion
  - [ ] Check responses
- [ ] Run "Issue Triage"
  - [ ] Monitor execution
  - [ ] Verify completion
- [ ] Run "CI/CD Monitor"
  - [ ] Monitor execution
  - [ ] Verify completion
- [ ] Run "Status Report to PM"
  - [ ] Monitor execution
  - [ ] Verify completion

### Step 8: Communication Test
- [ ] Test group messaging

### Step 9: Cleanup
- [ ] Stop gateways
- [ ] Document issues
- [ ] Switch workspace

### Test 3 Results
**Status**: [ ] PASS / [ ] FAIL / [ ] NEEDS FIX

**Issues found**:
```
(List any issues here)
```

---

## Cross-Template Checks

### Consistency Verification
- [ ] All templates imported without errors
- [ ] No naming conflicts between templates
- [ ] Workflow executions all completed successfully
- [ ] No JavaScript console errors during testing
- [ ] Dashboard remained responsive throughout

### Known Issues Check
Reference: `SYSTEM/dashboard/docs/KNOWN_ISSUES.md`
- [ ] Issue #1 (Typing indicators): Expected limitation, ignore
- [ ] Issue #3 (@all messages): Test if still occurring
- [ ] Any new issues discovered?

---

## Summary & Next Steps

### Overall Test Results
- [ ] Small Startup Team: PASS / FAIL
- [ ] Engineering Team: PASS / FAIL
- [ ] QA Team: PASS / FAIL

### Critical Issues (Must fix before demo)
```
1.
2.
3.
```

### Minor Issues (Can defer or document)
```
1.
2.
3.
```

### Template Recommendations
- [ ] Which template to use for Friday demo? **Recommended**: Small Startup Team (simplest, 3 agents, 2 workflows)
- [ ] Any templates need fixes?
- [ ] Any workflows need content updates?

### Time Tracking
- **Started**: ___:___ AM/PM
- **Finished**: ___:___ AM/PM
- **Duration**: ___ hours ___ minutes
- **Issues found**: ___
- **Issues fixed**: ___

---

## Post-Testing Actions

### If All Tests Pass ✅
- [ ] Update DEMO_PREP_MAR12-13.md: Mark template testing complete
- [ ] Prepare demo workspace with chosen template
- [ ] Move to demo practice phase
- [ ] Document any quirks or notes for demo

### If Tests Fail ❌
- [ ] Document all failures in KNOWN_ISSUES.md
- [ ] Prioritize fixes (critical vs nice-to-have)
- [ ] Fix critical issues immediately
- [ ] Re-test after fixes
- [ ] Update template files if needed

### Communication
- [ ] Report testing status to user
- [ ] Highlight any blockers
- [ ] Recommend next steps

---

**Testing completed**: [ ] YES / [ ] NO
**Ready for demo**: [ ] YES / [ ] NO / [ ] WITH CAVEATS

**Notes for demo**:
```
(Any important notes, workarounds, or things to avoid during demo)
```
