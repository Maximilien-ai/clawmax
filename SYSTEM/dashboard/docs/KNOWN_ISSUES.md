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
**Priority**: High (was critical for v1.0.0 demo)
**Severity**: UX Issue (non-blocking but important)
**Reported**: March 9, 2026
**Fixed**: March 11, 2026

### Description
After running a workflow from the Workflows page, no toast notification appeared when the workflow completed, even when staying on the Workflows page.

### Root Cause
Two bugs were found and fixed:

**Bug #1 (March 10)**: Polling was fetching only `limit=1` execution, missing newly triggered executions if they weren't the absolute latest.
- **Fix**: Fetch `limit=5` recent executions and loop through ALL of them to find tracked ones

**Bug #2 (March 11)**: After showing toast, execution was re-added to tracking Map, causing duplicate notifications.
- **Fix**: Delete execution from Map IMMEDIATELY after showing toast to prevent re-checking

### The Final Fix

**File**: `client/src/pages/Workflows.tsx` (lines 166-212)

**Key changes**:
1. Fetch 5 recent executions instead of just latest
2. Loop through all executions to check for transitions
3. Delete from Map immediately after showing toast (not in cleanup phase)
4. Use `else if` to prevent re-tracking completed executions

```typescript
if (wasInProgress && isComplete) {
  // Show toast...
  showSuccess(`${icon} ${check.workflowName} completed (${successRate} agents)`)

  // Delete from Map IMMEDIATELY to prevent duplicate toasts
  next.delete(key)
}
// Track all non-complete execution states
else if (execution.status === 'running' || execution.status === 'pending') {
  next.set(key, { ... })
}
```

### Testing
1. Go to Workflows page
2. Click "▶ Run Now" on any workflow
3. **Stay on the page**
4. Wait 10-20 seconds
5. ✅ Toast appears ONCE: "✅ [Workflow Name] completed (X/Y agents)"

---

## 🐛 Issue #3: @all Messages to Groups Not Reliably Working

**Status**: 🔴 UNRESOLVED
**Priority**: High
**Severity**: Functional Issue (blocks group messaging feature)
**Reported**: March 10, 2026

### Description
When sending an @all message to a group (e.g., Status group) from Communication view, the message sometimes works but is not reliable. Messages may not be delivered to all group members.

### Expected Behavior
1. User opens Communication page → Status group
2. User types message with @all mention
3. Message is sent to ALL members of the Status group
4. All agents in the group receive and can respond to the message
5. Works reliably every time

### Actual Behavior
- @all messages sometimes work
- Sometimes messages are not delivered to all group members
- Reliability is inconsistent

### Steps to Reproduce
1. Open Communication page
2. Click "Status" group to open chat panel
3. Type message: "@all what's your status?"
4. Send message
5. Check if all group members received the message
6. **Result**: Sometimes works, sometimes doesn't

### Technical Details

**Files Involved**:
- `client/src/components/GroupChatPanel.tsx` - Message sending
- `server/routes/groups.ts` or `server/routes/communities.ts` - Group message endpoints
- OpenClaw gateway message handling

**Suspected Root Causes**:
1. **Agent availability**: Some agents may be offline when message is sent
2. **Message routing**: @all expansion may not be working correctly
3. **Gateway issues**: Individual agent gateways may not be responding
4. **Timing**: Race condition in sending to multiple agents
5. **Error handling**: Failures to send to some agents may be silent

### Investigation Needed
- [ ] Add logging to message send endpoint to see what agents are targeted
- [ ] Verify @all mention expansion logic
- [ ] Check individual agent gateway responses
- [ ] Test with all agents confirmed online
- [ ] Add error reporting for failed sends

### Workaround
- Check which agents are online before sending @all messages
- Send individual messages to agents if @all fails
- Retry @all message if it doesn't work the first time

---

## 🐛 Issue #4: Agents Created from Org Templates Not Tagged

**Status**: ✅ FIXED
**Priority**: High
**Severity**: Functional Issue (missing metadata)
**Reported**: March 10, 2026
**Fixed**: March 11, 2026

### Description
When applying a startup org template, agents are created successfully but are not tagged with the expected tags defined in the template.

### Root Cause
The org template import logic was copying agent files but not writing tags from template.json to the agent's IDENTITY.md file.

### The Fix
**File**: `server/lib/templates.ts` (lines 879-937)

Modified `importOrganizationTemplate` to write tags to IDENTITY.md after copying files:
1. Check if template agent has tags defined
2. Read existing IDENTITY.md file
3. Replace existing Tags field, Tags section, or add new Tags field
4. Write updated content back to IDENTITY.md

```typescript
// Add tags to IDENTITY.md if specified in template
if (templateAgent.tags && templateAgent.tags.length > 0) {
  const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
  if (fs.existsSync(identityPath)) {
    let identityContent = fs.readFileSync(identityPath, 'utf-8')
    const tagsLine = `- **Tags:** ${templateAgent.tags.join(', ')}`
    // ... replacement logic for different IDENTITY.md formats
  }
}
```

### Testing
1. Import org template with tagged agents
2. Check agent IDENTITY.md files - tags are present
3. View agents in dashboard - tags display correctly

---

## 🐛 Issue #5: Archived Agents Still in Groups and Responding

**Status**: ✅ FIXED
**Priority**: High
**Severity**: Functional Issue (data integrity problem)
**Reported**: March 10, 2026
**Fixed**: March 11, 2026

### Description
After archiving agents, they remain members of communication groups and communities, and continue to respond to messages sent to those groups.

### Root Cause
The archive operation was moving the agent directory but not removing the agent from COMMUNITIES.md and GROUPS.md member lists. Additionally, there was a regex bug that failed to match Members lines without a leading dash.

### The Fix
**File**: `server/routes/agents.ts` (line 1705, 1726)

1. Fixed regex pattern to handle Members lines with or without leading dash:
   - Old: `/^-\s+\*\*Members:\*\*/i`
   - New: `/^\s*-?\s*\*\*Members:\*\*/i`

2. Added cleanup logic to remove archived agent from all member lists in COMMUNITIES.md and GROUPS.md

3. Created cleanup script to fix old data:
   - **File**: `server/scripts/cleanup-archived-agents.ts`
   - Removes archived agents from existing member lists
   - Can be run to clean up historical data

### Testing
1. Archive an agent that's in groups/communities
2. Check COMMUNITIES.md and GROUPS.md - agent removed from member lists
3. Send @all message to group - archived agent doesn't respond
4. Run cleanup script to fix old data

---

## 🐛 Issue #6: No Bulk Delete for Agents

**Status**: ✅ FIXED
**Priority**: Medium
**Severity**: UX Issue (workflow inefficiency)
**Reported**: March 10, 2026
**Fixed**: March 11, 2026

### Description
When selecting multiple agents in the Agents view, there is no bulk delete action available. Users must delete agents one at a time.

### The Fix
**Files Modified**:
- `server/routes/agents.ts` - Added bulk delete endpoints
- `client/src/components/BulkOperationsPanel.tsx` - Added delete UI
- `client/src/pages/Agents.tsx` - Wired up bulk delete handler

**Features Implemented**:
1. **Bulk impact calculation endpoint** (`POST /api/agents/bulk-impact`):
   - Returns impact summary: communities, groups, TODOs affected
   - Calculates for all selected agents

2. **Bulk delete endpoint** (`DELETE /api/agents/bulk`):
   - Deletes multiple agents in one operation
   - Option to remove state directories
   - Returns summary of deleted agents

3. **Double confirmation UI**:
   - First: Shows impact summary with agent count, groups, communities, TODOs
   - Second: Red warning with 🚨 icon - "This action is permanent"
   - Both confirmations required to proceed

4. **Impact display**:
   - X agents will be deleted
   - Will be removed from Y communities
   - Will be removed from Z groups
   - Will affect N TODOs

### Testing
1. Select multiple agents with checkboxes
2. Click "Delete" in bulk operations panel
3. See impact summary in first confirmation
4. Confirm → See second warning confirmation
5. Confirm → All agents deleted, toasts shown

---

## 🐛 Issue #7: No Way to Delete Orgs, Groups, and Communities

**Status**: ✅ FIXED
**Priority**: Medium
**Severity**: UX Issue (missing CRUD operations)
**Reported**: March 10, 2026
**Fixed**: March 11, 2026

### Description
There is no UI mechanism to delete organizations, communication groups, or communities. Only agents can be deleted.

### The Fix
**File Modified**: `client/src/pages/Communication.tsx`

**Features Implemented**:
1. **⋮ (vertical menu) button** on each community and group card
   - Positioned next to the type badge in card header
   - Opens dropdown menu with actions

2. **Delete action in menu**:
   - Red "Delete" button in dropdown
   - Closes menu and opens confirmation dialog

3. **Delete confirmation dialog**:
   - Shows entity type (Community or Group) and name
   - Displays member count warning if > 0 agents
   - "⚠️ This [type] has X members. They will be removed from this [type]."
   - "This action cannot be undone" warning
   - Cancel and Delete buttons

4. **Delete handler**:
   - Calls appropriate DELETE endpoint:
     - Communities: `DELETE /api/communities/:name`
     - Groups: `DELETE /api/groups/:name`
   - Shows success toast after deletion
   - Refreshes agent list to update UI

**Backend**: Delete endpoints already existed in:
- `server/routes/channels.ts` (lines 104, 116)
- `server/lib/workspace.ts` - `deleteGroup()` function

### Testing
1. Go to Communication page
2. Hover over community/group card
3. Click ⋮ menu button
4. Click "Delete"
5. See confirmation with member count
6. Confirm → Entity deleted, success toast shown

---

## 🐛 Issue #8: Community/Group Navigation Highlight Not Working

**Status**: 🟡 KNOWN LIMITATION (Low Priority)
**Priority**: Low
**Severity**: UX Issue (minor)
**Reported**: February 23, 2026

### Description
When clicking a community or group from an agent card, navigation to the Communication page works, but the channel card doesn't scroll into view or highlight.

### Root Cause
React doesn't render the channel cards when the Communication page div has the `hidden` class. The DOM elements aren't available when the scroll/highlight logic runs.

**Technical Details**:
- App.tsx uses `className={page === 'communication' ? '' : 'hidden'}` for page switching
- The `hidden` class prevents React from rendering child components
- By the time the useEffect runs, elements aren't in DOM

### Workaround
Users can:
1. Click the community/group from agent card (navigation works)
2. Manually find the channel in the list

### Potential Solutions
1. Remove hidden class approach - use `display: none` or `visibility: hidden` instead
2. Use React Router for proper page routing
3. Store scroll intent and let Communication page handle it on mount

### Files Affected
- `client/src/App.tsx:164`
- `client/src/pages/Communication.tsx:87-106`

**Decision**: Deferred to v1.1.0 - Minor UX issue, navigation works

---

## 🐛 Issue #9: Gateway RPC Authentication Scope Limitation

**Status**: 🟡 DOCUMENTED LIMITATION
**Priority**: Medium
**Severity**: Architecture Issue (workaround in place)
**Reported**: February 26, 2026

### Description
Dashboard cannot perform admin operations via Gateway RPC (config.patch, skills updates) because token authentication doesn't grant `operator.admin` scope.

### Root Cause
OpenClaw Gateway requires `operator.admin` scope for config modifications. CLI uses device-based auth which auto-grants scopes. Token auth doesn't grant any scopes by default.

### Current Workaround
Dashboard uses direct file writes to `~/.openclaw/openclaw.json` with metadata stamping:
- ✅ Fast, reliable, OpenClaw CLI compatible
- ❌ No Zod schema validation
- ❌ No Gateway audit trail

### Proper Solution (Future)
Implement device-based authentication for Dashboard → Gateway communication using OpenClaw's `loadOrCreateDeviceIdentity()` function.

### Related
- Token Usage Monitoring (Issue from KNOWN_ISSUES.md) - also blocked by Gateway RPC scope limitations
- See `SYSTEM/docs/archive/TOKEN_USAGE_LIMITATION.md` for details

**Decision**: Documented limitation - workaround is production-ready, proper auth can be implemented in v1.1.0

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

**Last Updated**: March 11, 2026
**Recent Fixes** (March 11, 2026):
1. ✅ Issue #4: Agents now get tags from org template import
2. ✅ Issue #5: Archived agents removed from groups and communities
3. ✅ Issue #6: Bulk delete for agents with double confirmation implemented
4. ✅ Issue #7: Delete actions for groups/communities with ⋮ menu implemented

**Active Issues**:
1. Issue #1: Typing indicators (timing limitation - documented)
2. Issue #3: @all messages not reliable (needs investigation)
3. Issue #8: Navigation highlight not working (low priority)
4. Issue #9: Gateway RPC scope limitation (documented)

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

### 1. Fast Workflows
Workflows completing in < 5 seconds may miss polling window.

### 2. Token Usage Monitoring ⏳
**Status**: Implemented in ClawMax, blocked by OpenClaw Gateway

**Issue**: Dashboard code is ready but OpenClaw Gateway doesn't expose `sessions.usage` RPC method to external clients.

**Error**: `Gateway RPC error: missing scope: operator.admin`

**What's Needed from OpenClaw**:
- Expose `sessions.usage` method to external clients (currently internal only)
- Either add new scope (e.g., `operator.usage`) OR allow `operator.admin` to access it
- Document scope requirements for third-party integrations

**ClawMax Implementation** (Ready to go):
- Backend: `/api/agents/usage` endpoint (`server/routes/agents.ts:486-524`)
- Frontend: Usage fetch + display (`client/src/pages/Agents.tsx`)
- UI: Token counts with 🪙 icon on agent cards
- Auto-refresh: Every 5 minutes

**Current Behavior**: Token counts don't appear (graceful degradation, no errors shown)

**Future**: Will work automatically when OpenClaw exposes the API

**See**: `SYSTEM/docs/archive/TOKEN_USAGE_LIMITATION.md` for full technical details

### 3. Typing Indicators
Only show during active execution (not retroactive).

### 4. Completion Toast
Only shows if user stays on Workflows page.

### 5. Templates Now Global Across Workspaces ✅
**Status**: ✅ IMPLEMENTED
**Priority**: Medium
**Reported**: March 11, 2026
**Fixed**: March 11, 2026

**Implementation**: Templates are now stored in two locations:
1. **Global templates** at `~/.openclaw/TEMPLATES/` - System templates shared across all workspaces
2. **Workspace templates** at `WORKSPACE/TEMPLATES/` - Private templates for each workspace

**Behavior**:
- All workspaces can see global templates (agent + org templates)
- Users can create workspace-specific templates for privacy
- Workspace templates override global templates with the same name
- Template listing merges both locations automatically

**Usage**: No action needed - existing templates were copied to global location automatically.

---

## Issues #4-7: See Above for Details

**Issues #4, #5, #6, and #7 have been FIXED on March 11, 2026.**

See the detailed entries above for:
- ✅ Issue #4: Agents Created from Org Templates Not Tagged
- ✅ Issue #5: Archived Agents Still in Groups and Responding
- ✅ Issue #6: No Bulk Delete for Agents
- ✅ Issue #7: No Way to Delete Orgs, Groups, and Communities

---

**Tracking**: Use GitHub Issues when repository is published
