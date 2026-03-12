# Tasks for Wednesday, March 11, 2026

**Goal**: Fix critical bugs and implement high-priority features for Friday demo
**Timeline**: Thursday = final testing/prep, Friday = demo
**Constraint**: All major items must be done and working by end of Wednesday

---

## MORNING SESSION (8 AM - 12 PM) ☀️

**Focus**: Fix the 2 critical bugs that impact demo functionality

### Task 1: Fix Issue #4 - Agent Tagging from Templates 🔴
**Priority**: CRITICAL
**Estimated Time**: 2 hours
**Status**: Not started

**Subtasks**:
1. [ ] Read and understand org template import code
   - `server/routes/organizations.ts` - Import endpoint
   - `server/routes/agents.ts` - Agent creation logic
   - Template parsing and YAML reading

2. [ ] Verify tags are defined in template YAML
   - Check `WORKFLOWS/templates/orgs/startup.yaml`
   - Verify tag structure in agent definitions

3. [ ] Add logging to agent creation
   - Log when tags are read from template
   - Log when tags are inserted into database
   - Identify where tags are being lost

4. [ ] Fix the bug
   - Ensure tags are passed to agent creation
   - Verify database insertion includes tags
   - Test with sample org template

5. [ ] Test the fix
   - Import startup org template
   - Verify agents have expected tags
   - Check agent cards in dashboard

**Acceptance Criteria**:
- ✅ Agents created from templates show correct tags
- ✅ Tags visible on agent cards in dashboard
- ✅ Works for all 3 pre-built org templates

**Files to Check**:
- `server/routes/organizations.ts`
- `server/routes/agents.ts`
- `WORKFLOWS/templates/orgs/*.yaml`

---

### Task 2: Fix Issue #5 - Archived Agent Cleanup 🔴
**Priority**: CRITICAL
**Estimated Time**: 2 hours
**Status**: Not started

**Subtasks**:
1. [ ] Review archive operation code
   - `server/routes/agents.ts` - Archive endpoint
   - Find where agent status is updated to "archived"

2. [ ] Identify group/community membership tables
   - Check database schema
   - Find relationship tables (agent_groups, agent_communities)

3. [ ] Implement cascade cleanup
   - Add group membership removal on archive
   - Add community membership removal on archive
   - Transaction to ensure atomicity

4. [ ] Add message routing filter
   - Verify archived agents are excluded from @all
   - Check gateway message sending logic
   - Add archived status check before sending

5. [ ] Test the fix
   - Create agents and add to groups
   - Archive one agent
   - Verify agent removed from group members list
   - Send @all message, verify archived agent doesn't respond
   - Check UI shows correct membership

**Acceptance Criteria**:
- ✅ Archived agents removed from all groups
- ✅ Archived agents removed from all communities
- ✅ Archived agents don't respond to @all messages
- ✅ Group member lists show only active agents

**Files to Check**:
- `server/routes/agents.ts` - Archive operation
- `server/routes/groups.ts` - Group membership management
- `server/routes/communities.ts` - Community membership
- Database migration for cascade delete (if needed)

---

**Morning Break**: 30 minutes at 10:30 AM

---

## AFTERNOON SESSION (1 PM - 5 PM) 🌤️

**Focus**: Implement nice-to-have features if time permits, otherwise test and document

### Task 3: Implement Issue #6 - Bulk Delete for Agents 🟡
**Priority**: HIGH (if time permits)
**Estimated Time**: 2.5 hours
**Status**: Not started

**Subtasks**:
1. [ ] Frontend - Add bulk delete UI
   - `client/src/pages/Agents.tsx`
   - Add "Delete Selected" button when items selected
   - Implement first confirmation dialog
   - Implement second confirmation with impact warning

2. [ ] Backend - Create bulk delete endpoint
   - `server/routes/agents.ts`
   - POST `/api/agents/bulk-delete`
   - Accept array of agent IDs
   - Calculate impact (groups, communities, workflows)
   - Transaction for atomic deletion

3. [ ] Impact calculation logic
   - Count group memberships per agent
   - Count community memberships per agent
   - Check running workflows
   - Return impact summary

4. [ ] Double confirmation flow
   - First dialog: "Delete N agents?"
   - Second dialog: "This will remove them from X groups and Y communities. Continue?"
   - Show agent names in confirmation

5. [ ] Test bulk delete
   - Select 3 agents
   - Verify both confirmations appear
   - Confirm deletion
   - Verify agents deleted
   - Verify removed from groups/communities

**Acceptance Criteria**:
- ✅ Can select multiple agents
- ✅ Bulk delete button appears when selected
- ✅ Double confirmation with impact details
- ✅ All selected agents deleted atomically
- ✅ Group/community memberships cleaned up

**Files to Modify**:
- `client/src/pages/Agents.tsx`
- `server/routes/agents.ts`

---

### Task 4: Implement Issue #7 - Delete Orgs/Groups/Communities 🟡
**Priority**: MEDIUM (if time permits)
**Estimated Time**: 3 hours
**Status**: Not started

**Subtasks**:
1. [ ] Design consistent UX pattern
   - "..." vertical menu on each card
   - Same pattern for orgs, groups, communities
   - Consistent confirmation dialogs

2. [ ] Implement for Groups (highest priority)
   - `client/src/pages/Communication.tsx`
   - Add "..." menu to group cards
   - Add delete action with confirmation
   - `server/routes/groups.ts` - DELETE endpoint
   - Calculate impact (agents, workflows)

3. [ ] Implement for Communities
   - Similar to groups
   - `server/routes/communities.ts` - DELETE endpoint

4. [ ] Implement for Organizations
   - `client/src/pages/Organizations.tsx`
   - `server/routes/organizations.ts` - DELETE endpoint
   - Higher impact (affects many agents/workflows)

5. [ ] Test all entity deletions
   - Create test org/group/community
   - Delete via "..." menu
   - Verify confirmation dialog
   - Verify entity deleted
   - Verify impact applied correctly

**Acceptance Criteria**:
- ✅ All entity types have "..." menu
- ✅ Delete action with confirmation
- ✅ Impact calculation shown
- ✅ Entities deleted successfully

**Files to Modify**:
- `client/src/pages/Communication.tsx`
- `client/src/pages/Organizations.tsx`
- `server/routes/groups.ts`
- `server/routes/communities.ts`
- `server/routes/organizations.ts`

---

### Task 5: Testing & Documentation 🧪
**Priority**: CRITICAL (if Tasks 3-4 not started)
**Estimated Time**: 2 hours
**Status**: Not started

**If Tasks 3-4 are skipped or incomplete**:
1. [ ] Document Issues #6 and #7 as known limitations
   - Update KNOWN_ISSUES.md with "deferred to v1.1.0"
   - Add workarounds for manual deletion

2. [ ] End-to-end testing of fixed issues
   - Test Issue #4 fix with all 3 org templates
   - Test Issue #5 fix with multiple scenarios
   - Document any edge cases found

3. [ ] Update documentation
   - Update KNOWN_ISSUES.md with fix notes
   - Update BLOG_POST_DRAFT.md (remove fixed items from known issues)
   - Start DEMO_SCRIPT.md

4. [ ] Regression testing
   - Verify existing features still work
   - Test workflow execution
   - Test agent communication
   - Test template import/export

---

## DECISION POINT (3 PM) ⚠️

**At 3 PM, assess progress and decide**:

### Scenario A: Tasks 1-2 completed by 3 PM
- ✅ Proceed with Tasks 3-4 (bulk delete, entity deletion)
- Goal: Get as much done as possible before 5 PM
- Anything incomplete goes to Thursday AM

### Scenario B: Tasks 1-2 still in progress at 3 PM
- ⚠️ Focus entirely on completing Tasks 1-2
- Skip Tasks 3-4 for today
- Document as known limitations
- More time for testing on Thursday

### Scenario C: Major blockers encountered
- 🔴 Reassess priorities
- Consider alternative fixes
- Get input from team
- Adjust Friday demo scope if needed

---

## END OF DAY CHECKLIST (5 PM)

**Before ending Wednesday session**:
- [ ] All code changes committed to git
- [ ] KNOWN_ISSUES.md updated with current status
- [ ] WORK_SUMMARY_MAR11.md created with progress notes
- [ ] Blockers documented for Thursday
- [ ] Tomorrow's tasks adjusted based on today's progress

**Expected State by End of Wednesday**:
- ✅ Issue #4 FIXED (agent tagging)
- ✅ Issue #5 FIXED (archived agent cleanup)
- 🟡 Issue #6 STARTED or DOCUMENTED as limitation
- 🟡 Issue #7 STARTED or DOCUMENTED as limitation

---

## SUCCESS CRITERIA FOR WEDNESDAY

**Minimum (must achieve)**:
1. Issue #4 fixed and tested ✅
2. Issue #5 fixed and tested ✅
3. Both fixes documented in KNOWN_ISSUES.md ✅
4. Code committed and stable ✅

**Target (ideal outcome)**:
1. All 4 minimum criteria ✅
2. Issue #6 implemented (bulk delete) ✅
3. Issue #7 started (entity deletion) 🟡
4. Documentation updated ✅

**Stretch (if everything goes smoothly)**:
1. All target criteria ✅
2. Issue #7 fully implemented ✅
3. Demo script drafted ✅
4. Ready for Thursday testing day ✅

---

## NOTES & REMINDERS

- **Time is tight**: Thursday needs to be pure testing/prep, not development
- **Demo is Friday**: Everything must work by Thursday PM
- **Quality > Features**: Better to have 2 issues fixed well than 4 issues half-fixed
- **Test thoroughly**: Regressions are worse than known limitations
- **Document everything**: If something doesn't get done, document it clearly

**Remember**: The demo will show what works. Known limitations are acceptable. Broken features are not.

NOTE: nice, let's make sure to check these off and when done archive.

---

## THURSDAY PREVIEW (March 12)

**Thursday AM**:
- Complete any Wednesday carry-over work
- Test ALL org templates (startup, engineering, QA)
- Test ALL system workflows
- Capture screenshots/videos for blog

**Thursday PM**:
- Final documentation review
- Blog post publish
- Demo rehearsal
- Environment setup for Friday demo

**Friday (March 13)**:
- Final smoke tests
- DEMO DAY 🚀
- Celebrate v1.0.0 🎉
