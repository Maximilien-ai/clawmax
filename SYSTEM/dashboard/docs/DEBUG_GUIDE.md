# Bug Debugging Guide - Monday Night

**Status**: 🐛 Debugging enabled for both critical bugs
**Time**: ~30 minutes of work completed
**Next**: Test and analyze console logs

---

## 🎯 What Was Done

Added comprehensive console.log debugging to both critical bugs:

### 1. Typing Indicators (GroupChatPanel.tsx)
**File**: `client/src/components/GroupChatPanel.tsx`

**Debugging Added**:
- ✅ useEffect setup/cleanup logging
- ✅ typingAgents state change logging
- ✅ fetchActiveWorkflows() detailed tracing:
  - Channel info (name, type, member count)
  - Workflows found (total count)
  - Relevant workflows for this channel
  - Execution status for each workflow
  - Full participant data
  - Agent ID matching checks
  - Working agents detected

**Log Prefix**: `[Typing Indicators]`

---

### 2. Completion Toast (Workflows.tsx)
**File**: `client/src/pages/Workflows.tsx`

**Debugging Added**:
- ✅ Run Now button trigger logging
- ✅ API response logging (especially executionId)
- ✅ trackedExecutions add/update logging
- ✅ checkRunningWorkflows() polling logging:
  - useEffect setup/cleanup
  - Polling every 5 seconds
  - Current trackedExecutions state
  - Each execution status check
  - Transition detection (pending/running → completed/failed)
  - showSuccess function verification

**Log Prefix**: `[Workflow Toast]`

---

## 🧪 How to Test

### Test 1: Typing Indicators

1. **Open browser console** (Cmd+Option+J on Mac, F12 on Windows)

2. **Navigate to Communication page**
   - Go to Communication
   - Click "Status" group to open chat panel
   - Keep panel visible

3. **Trigger workflow** (in another tab/window)
   - Open Workflows page
   - Find "Status Check" workflow
   - Click "▶ Run Now" and confirm

4. **Watch console** for logs starting with `[Typing Indicators]`

5. **Expected logs**:
   ```
   [Typing Indicators] Setting up polling for channel: Status
   [Typing Indicators] Polling intervals set up (messages: 2s, workflows: 5s)
   [Typing Indicators] Checking for active workflows...
   [Typing Indicators] Found workflows: X
   [Typing Indicators] Relevant workflows for this channel: Y [workflow-ids]
   [Typing Indicators] Workflow status-check executions: 1 running
   [Typing Indicators] Found running execution: execution-id
   [Typing Indicators] Full execution details: { participants: 3, participantData: [...] }
   [Typing Indicators] Checking participant: { agentId: 'ceo', status: 'running', isInChannel: true }
   [Typing Indicators] Added typing agent: ceo
   [Typing Indicators] Working agents found: 3 ['ceo', 'engineer', 'max0']
   [Typing Indicators] Set typing agents!
   [Typing Indicators] typingAgents state changed: { count: 3, agents: [...] }
   ```

6. **Look for issues**:
   - ❌ No workflows found? → Workflow targeting issue
   - ❌ No relevant workflows? → Channel name mismatch
   - ❌ No executions? → Workflow not running
   - ❌ No participants? → API response structure issue
   - ❌ No agent match? → Agent ID mismatch
   - ❌ State not changing? → React state update issue

---

### Test 2: Completion Toast

1. **Open browser console** (Cmd+Option+J on Mac, F12 on Windows)

2. **Navigate to Workflows page**
   - Go to Workflows
   - Find "Status Check" workflow
   - Click on it to open detail panel

3. **Trigger workflow**
   - Click "▶ Run Now" and confirm
   - **STAY ON WORKFLOWS PAGE** - don't navigate away

4. **Watch console** for logs starting with `[Workflow Toast]`

5. **Expected logs**:
   ```
   [Workflow Toast] Setting up polling for X workflows
   [Workflow Toast] Polling interval set up (every 5s)
   [Workflow Toast] Triggering workflow: status-check Status Check
   [Workflow Toast] Trigger response: { executionId: 'abc-123', ... }
   [Workflow Toast] Adding to tracked executions: status-check:abc-123 { status: 'pending', ... }
   [Workflow Toast] trackedExecutions after add: 1 ['status-check:abc-123']

   ... (every 5 seconds) ...

   [Workflow Toast] Polling workflows... X workflows
   [Workflow Toast] Current trackedExecutions: 1 ['status-check:abc-123']
   [Workflow Toast] Checking execution: { key: 'status-check:abc-123', executionStatus: 'running', wasTracked: true, trackedStatus: 'pending' }
   [Workflow Toast] Tracking execution: status-check:abc-123 running

   ... (after workflow completes) ...

   [Workflow Toast] Checking execution: { key: 'status-check:abc-123', executionStatus: 'completed', wasTracked: true, trackedStatus: 'running' }
   [Workflow Toast] TRANSITION DETECTED! Status Check running → completed
   [Workflow Toast] Showing toast with showSuccess: function
   [Workflow Toast] Cleaning up tracked execution: status-check:abc-123
   ```

6. **Look for issues**:
   - ❌ No executionId in response? → API not returning executionId
   - ❌ trackedExecutions not updating? → State update issue
   - ❌ Polling not running? → useEffect dependency issue
   - ❌ Execution not found in poll? → Key mismatch between trigger and list
   - ❌ Transition not detected? → Logic issue
   - ❌ showSuccess is undefined? → useToast hook issue

---

## 📊 What to Share

After testing, share:

1. **Console logs** (copy/paste or screenshot)
2. **Did typing indicators appear?** (yes/no)
3. **Did completion toast show?** (yes/no)
4. **Any errors in console?** (red text)

This will tell us exactly where each bug is breaking!

---

## 🔍 Common Issues & Solutions

### Issue: "No executionId in trigger response"
**Cause**: API /trigger endpoint not returning executionId
**Fix**: Update server endpoint to return executionId

### Issue: "Participants array is empty"
**Cause**: Execution details API not including participants
**Fix**: Check server execution JSON structure

### Issue: "Agent ID mismatch"
**Cause**: Participant agentId doesn't match channel member ID
**Fix**: Verify agent ID format consistency

### Issue: "Polling not running"
**Cause**: useEffect dependencies or workflow count
**Fix**: Check useEffect dependencies and workflow state

### Issue: "showSuccess is undefined"
**Cause**: useToast hook not available
**Fix**: Verify ToastContext provider wraps component

---

## ⏱️ Time Spent

- Typing indicators debugging: ~15 minutes
- Completion toast debugging: ~15 minutes
- Total: ~30 minutes

**Remaining tonight**: ~90 minutes
**Next step**: Test, analyze logs, implement fixes

---

**Created**: March 10, 2026 - Monday Night
**Status**: Ready for testing

🐛 Let's find these bugs!
