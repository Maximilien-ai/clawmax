# Known Issues - ClawMax Dashboard

## 🐛 Issue #1: Typing Indicators Not Showing in Communication View

**Status**: 🔴 UNRESOLVED
**Priority**: Medium
**Severity**: UX Issue (non-blocking)
**Reported**: March 9, 2026

### Description
When running a workflow from the Workflows page, typing indicators do not appear in the Communication view's group chat panel, even when viewing the correct group.

### Expected Behavior
- User opens Communication page → Status group chat
- User runs "Status Check" workflow from Workflows page
- Within 5 seconds, animated typing indicators (3 bouncing dots) should appear under agent names (ceo, engineer, max0)
- Indicators should disappear as agents complete responses

### Actual Behavior
- No typing indicators appear
- Messages from agents appear in chat, but no "working" indication before they post

### Steps to Reproduce
1. Open Dashboard → Communication page
2. Click "Status" group to open chat panel
3. Keep chat panel visible (don't close)
4. In another tab: Go to Workflows page
5. Find "Status Check" workflow
6. Click "▶ Run Now" and confirm
7. Switch back to Communication view
8. **Result**: No typing indicators appear

### Technical Details

**Implementation Attempted**:
- `GroupChatPanel.tsx` has `fetchActiveWorkflows()` function
- Polls every 5 seconds for running workflows
- Checks `/api/workflows` for workflows targeting current group
- Fetches execution details via `/api/workflows/{id}/executions/{executionId}`
- Attempts to filter participants by `pending`/`running` status
- Should call `setTypingAgents(workingAgents)`

**Suspected Root Causes**:
1. **Timing**: Workflow completes before first poll (< 5 seconds)
2. **API Response**: Execution details may not include real-time participant status
3. **State Management**: `typingAgents` state not updating correctly
4. **Channel Matching**: Agent IDs may not match between workflow participants and channel members
5. **Polling Not Active**: `fetchActiveWorkflows` may not be running (useEffect dependency issue)

**Files Involved**:
- `client/src/components/GroupChatPanel.tsx` (lines 79-135)
- `server/routes/workflows.ts` (execution endpoints)

### Workaround
None - feature non-functional.

### Investigation Needed
- [ ] Add console.log to verify `fetchActiveWorkflows` is called
- [ ] Check if workflow execution includes real-time participant status updates
- [ ] Verify channel.members IDs match participant agentIds exactly
- [ ] Test with slower workflow (10+ agents) to extend execution window
- [ ] Check React DevTools for `typingAgents` state changes

---

## 🐛 Issue #2: Workflow Completion Toast Not Showing

**Status**: 🔴 UNRESOLVED
**Priority**: Medium
**Severity**: UX Issue (non-blocking)
**Reported**: March 9, 2026

### Description
After running a workflow from the Workflows page, no toast notification appears when the workflow completes, even when staying on the Workflows page.

### Expected Behavior
- User clicks "▶ Run Now" on a workflow
- Workflow executes (10-30 seconds)
- User stays on Workflows page
- Toast appears: "✅ Status Check completed (3/3 agents)"
- Toast auto-dismisses after a few seconds

### Actual Behavior
- No toast notification appears
- User must manually check execution status or refresh page

### Steps to Reproduce
1. Go to Workflows page
2. Find "Status Check" workflow
3. Click "▶ Run Now" and confirm
4. **Stay on Workflows page** - do not navigate away
5. Wait 10-30 seconds for workflow to complete
6. **Result**: No completion toast appears

### Technical Details

**Implementation Attempted**:
- `Workflows.tsx` has `checkRunningWorkflows()` polling function (every 5s)
- Tracks executions in `trackedExecutions` Map with format: `{workflowId}:{executionId}`
- When "Run Now" clicked, adds execution to Map with `status: 'pending'`
- Polling detects transition: `pending/running` → `completed/failed`
- Should show toast via `showSuccess()` or `showError()`

**Suspected Root Causes**:
1. **Tracking Not Working**: `trackedExecutions` Map not updating correctly
2. **Key Mismatch**: Execution ID from `/trigger` doesn't match ID in `/executions` list
3. **Timing**: Workflow completes before next poll cycle (< 5 seconds)
4. **Polling Stopped**: `checkRunningWorkflows` interval may not be running
5. **Toast Context**: `useToast()` may not be available in polling callback

**Code Location**:
- `client/src/pages/Workflows.tsx` (lines 860-895: Run Now handler)
- `client/src/pages/Workflows.tsx` (lines 131-226: Polling logic)

**Recent Changes**:
- Commit `88b5214`: Added capture of `executionId` from trigger response
- Commit `88b5214`: Added immediate tracking with `status: 'pending'`
- **Still not working after fix**

### Workaround
- Manually refresh Workflows page to see updated execution status
- Check Executions tab for completion status

### Investigation Needed
- [ ] Add console.log in `checkRunningWorkflows` to verify polling is active
- [ ] Log `trackedExecutions` Map contents before/after trigger
- [ ] Verify `showSuccess` function is available in scope
- [ ] Check browser console for React errors or warnings
- [ ] Test with manual Map update via React DevTools
- [ ] Verify execution ID format matches between trigger and list endpoints

---

## 🧪 Testing Notes

### Test Count Display
**Not a bug** - Expected behavior:
- `./test.sh` shows: **92 tests**
- Actual tests run: **106 tests** (77 integration + 14 skills + 15 templates)
- Unit test suites counted as single tests in summary

### Org Template Import/Export
**Status**: ⏳ Not yet tested by user
**Expected**: Functional (backend + frontend implemented)
**Recommendation**: Test with prefix (e.g., "demo-") to avoid workspace pollution

---

## 🔄 Status Updates

**Last Updated**: March 9, 2026
**Next Actions**:
1. Debug typing indicators with proper logging
2. Debug completion toast with state inspection
3. Consider simpler implementation without complex state tracking

**Logs to Check**:
```bash
# Browser console (while testing)
# Should see:
- "[Workflow Toast] {name} pending → completed"  (if toast logic runs)
- "Failed to fetch active workflows: {error}"     (if typing logic fails)

# Dashboard logs
tail -f /tmp/dashboard.log | grep -E "workflow|execution|trigger"
```

---

## 📋 Other Known Limitations

1. **Fast Workflows**: Workflows completing in < 5 seconds may miss polling window
2. **Token Usage**: Blocked by OpenClaw Gateway RPC scope (see `TOKEN_USAGE_LIMITATION.md`)
3. **Typing Indicators**: Only show during active execution (not retroactive)
4. **Completion Toast**: Only shows if user stays on Workflows page

---

**Tracking**: Use GitHub Issues when repository is published
