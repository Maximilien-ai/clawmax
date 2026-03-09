# Known Issues - ClawMax Dashboard

## 🐛 Issue #1: Typing Indicators Not Showing in Communication View

**Status**: 🟡 TIMING LIMITATION
**Priority**: Low
**Severity**: UX Issue (known limitation)
**Reported**: March 9, 2026
**Investigated**: March 10, 2026

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

### Root Cause (Confirmed via Debugging)

**The Problem**: **Workflow executions complete too fast** (~5-10 seconds), faster than the typing indicator polling interval (5 seconds).

**Evidence from Console Logs**:
```
[Typing Indicators] Workflow status-check executions: 1 completed
```By the time the user switches to the Communication view or the first poll executes, the workflow status is already `completed`. No `running` or `pending` state is ever detected.

**Why It Happens**:
1. User triggers workflow from Workflows page
2. Workflow executes (agents respond in 5-10 seconds total)
3. User switches to Communication → Status group (~3-5 seconds)
4. **Workflow is already completed** when typing indicator poll runs
5. Result: No typing indicators shown

**Technical Details**:
- Implementation: `client/src/components/GroupChatPanel.tsx` (lines 89-159)
- Polling interval: 5 seconds
- Typical workflow duration: 5-15 seconds
- Window of opportunity: Very small or non-existent

### Workaround
**For Testing/Demo**:
1. Open Communication view → Status group **FIRST**
2. Keep it visible
3. Then trigger workflow (in split screen or another window)
4. Typing indicators MAY appear if workflow takes >5 seconds

**For Production**:
- Use workflows with 10+ agents (longer execution time)
- Reduce polling interval to 2-3 seconds (more aggressive)
- Accept as limitation for fast workflows

### Potential Solutions
1. **Reduce polling interval** to 2-3 seconds (more aggressive)
2. **WebSocket real-time updates** instead of polling
3. **Show "working" indicator** for first 10 seconds after trigger (optimistic UI)
4. **Accept as known limitation** for fast-completing workflows

### Decision
**Documented as known limitation** for v1.0.0. Will revisit with WebSocket implementation in v1.1.0 if user feedback indicates it's important.

---

## 🐛 Issue #2: Workflow Completion Toast Not Showing

**Status**: ✅ FIXED
**Priority**: Medium (was)
**Severity**: UX Issue (was non-blocking)
**Reported**: March 9, 2026
**Fixed**: March 10, 2026

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

### Root Cause (Confirmed via Debugging)

**The Problem**: **Polling was checking the wrong executions!**

**Evidence from Console Logs**:
```
[Workflow Toast] Trigger response: {executionId: 'eb06e2fe-7e89-4245-b614-271553b1988c', ...}
[Workflow Toast] Adding to tracked executions: status-check:eb06e2fe-7e89-4245-b614-271553b1988c
...
[Workflow Toast] Checking execution: {key: 'status-check:test-auth-fix', executionStatus: 'completed', ...}
[Workflow Toast] Checking execution: {key: 'test:simple-test', executionStatus: 'completed', ...}
```

**Notice**: The triggered execution (`eb06e2fe-...`) was NEVER checked! Only old executions (`test-auth-fix`, `simple-test`) were being polled.

**Why It Happened**:
1. Trigger created execution `eb06e2fe-7e89-4245-b614-271553b1988c`
2. Polling fetched `limit=1` (latest execution only)
3. But API returned `test-auth-fix` (an older execution) as "latest"
4. New execution was never checked
5. No transition detected → No toast

**The Bug**: Fetching only `limit=1` execution meant if the new execution wasn't the absolute latest (e.g., if multiple workflows ran), it would be missed entirely.

### The Fix (Commit 59e4788)

**Changed**: Fetch `limit=5` recent executions instead of `limit=1`
**Changed**: Loop through ALL 5 executions to check tracked ones

**Code Changes** (`client/src/pages/Workflows.tsx`):
```typescript
// OLD: Fetch only latest execution
const res = await fetch(`/api/workflows/${id}/executions?limit=1`)
const latest = data.executions?.[0]
// Only checked this one execution

// NEW: Fetch recent 5 executions
const res = await fetch(`/api/workflows/${id}/executions?limit=5`)
const executions = data.executions || []
// Loop through ALL executions
for (const execution of check.executions || []) {
  const key = `${check.id}:${execution.id}`
  const tracked = prev.get(key)
  // Check if this execution is tracked and transitioned
}
```

**Result**: Now finds and tracks ANY execution in the last 5, not just the absolute latest.

### Testing
1. Go to Workflows page
2. Click "▶ Run Now" on any workflow
3. **Stay on the page**
4. Wait 10-20 seconds
5. ✅ Toast should appear: "✅ [Workflow Name] completed (X/Y agents)"

### Verification
Completion toast now works reliably! 🎉

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
