# Saturday-Monday Plan: Feb 22-24, 2025

## Completed (Friday Feb 21)

### ✅ Communities & Groups Management
- **Issue**: Removing agents from groups wasn't persisting to agent cards
- **Root Cause**: COMMUNITIES.md and GROUPS.md lacked Members fields entirely
- **Solution**:
  - Added Members fields to all 4 communities and 10 groups
  - Re-enabled membership filtering in workspace.ts using parseGroupsWithMembers()
  - Backend POST endpoint now successfully updates memberships
- **Testing**: Verified by removing engineer from 2 groups (10→8 groups displayed)
- **Status**: ✅ Fully working

### ✅ UI Already Correct
- CommunitiesManager component properly separates communities (🏘 purple) from groups (👥 indigo)
- Selection counts displayed for each section
- No changes needed

### ✅ Git Commits
- Total of 6 commits today including membership system + archived messages
- All changes committed and ready for weekend/Monday work

---

## Tomorrow (Saturday Feb 22) - 4 Hours

**Focus**: Communication + Activity Testing + Schema Validation

### Batch 1: Core Communication Testing (2 hours)
1. **Test group chat functionality end-to-end** (1 hour)
   - Create test message in a group
   - Verify all members receive it
   - Test with different communities
   - Validate WhatsApp channel integration

2. **Test Activity page with real agent data** (1 hour)
   - Generate activity from multiple agents
   - Verify timeline displays correctly
   - Test filtering by agent/community/group
   - Check performance with 100+ activity items

### Batch 2: Schema Validation + WhatsApp (2 hours)
3. **Add MANDATE.md schema validation** (45 min)
   - Create SYSTEM/schemas/mandate.schema.json
   - Add validateMandate() to validator.ts
   - Add validation to settings page for mandate editing
   - Test with valid/invalid mandate content

4. **Test WhatsApp integration features** (1 hour 15 min)
   - Verify message sending through WhatsApp channel
   - Test message receiving/webhook handling
   - Check group message distribution
   - Validate phone number formatting

**Expected Deliverables**:
- ✅ Group chat working end-to-end
- ✅ Activity page tested and validated
- ✅ MANDATE.md schema validation implemented
- ✅ WhatsApp integration verified

---

## Monday (Feb 24) - 8 Hours

**Focus**: Performance + Scale + UX Polish + Error Handling

### Batch 1: Performance & Scale (3 hours)
5. **Add pagination for 100+ agents** (1.5 hours)
   - Implement cursor-based pagination in API
   - Add "Load More" or infinite scroll to agents grid
   - Test with simulated 200+ agents
   - Optimize initial load time

6. **Dashboard performance optimization** (1.5 hours)
   - Profile render performance with React DevTools
   - Memoize expensive components (AgentCard, CommunitiesManager)
   - Lazy load agent details
   - Add loading skeletons for better UX

### Batch 2: Documentation & Search (2 hours)
7. **Document search in DocHub** (1 hour)
   - Add search bar to DocHub component
   - Implement fuzzy search across all .md files
   - Highlight search terms in results
   - Test with agent docs (SOUL, TOOLS, MANDATE)

8. **Add batch operations for agents** (1 hour)
   - Multi-select agents in grid
   - Bulk add to community/group
   - Bulk archive/unarchive
   - Confirmation dialogs for safety

### Batch 3: Error Handling + UX (3 hours)
9. **Error handling improvements** (1 hour)
   - Add error boundaries around major components
   - Toast notifications for API errors
   - Retry logic for failed requests
   - Better error messages for users

10. **Archive management UI** (45 min)
    - Add "Archived Agents" tab
    - Show archive/unarchive button in agent cards
    - Add archive reason/timestamp display
    - Test archive/unarchive workflow

11. **Agent restart testing** (45 min)
    - Test restart functionality with openclaw-gateway
    - Verify status updates after restart
    - Handle gateway unavailable gracefully
    - Test restart for running vs stopped agents

12. **Mobile responsiveness** (30 min)
    - Test dashboard on mobile viewport
    - Fix agent grid layout on small screens
    - Make modals mobile-friendly
    - Test navigation on touch devices

**Expected Deliverables**:
- ✅ Pagination working for 100+ agents
- ✅ Dashboard performance optimized
- ✅ DocHub search implemented
- ✅ Batch operations available
- ✅ Error handling robust
- ✅ Archive UI complete
- ✅ Agent restart tested and working
- ✅ Mobile experience improved

---

## Nice-to-Have (If Time Permits)

### Additional Features
13. **Agent templates/cloning** (2 hours)
    - Create agent from template
    - Clone existing agent configuration
    - Template library in UI

14. **Real-time agent status updates** (1.5 hours)
    - WebSocket connection for status changes
    - Live update agent cards without refresh
    - Connection status indicator

15. **Activity log export** (1 hour)
    - Export activity to CSV/JSON
    - Filter before export
    - Download functionality

---

## Success Metrics

### Saturday (4 hours)
- [ ] Group chat sends messages successfully
- [ ] Activity page displays 100+ items smoothly
- [ ] MANDATE.md validation catches errors
- [ ] WhatsApp messages send/receive correctly

### Monday (8 hours)
- [ ] Dashboard loads 200+ agents with pagination
- [ ] Component render time < 100ms
- [ ] Search returns results in < 200ms
- [ ] Bulk operations work on 10+ agents
- [ ] Zero unhandled errors in console
- [ ] Archive workflow tested end-to-end
- [ ] Agent restart success rate > 95%
- [ ] Mobile layout works on 375px width

---

## Notes

- **Priority**: Focus on items 1-12 first (core functionality)
- **Testing**: Test each feature with real data before moving to next
- **Commits**: Commit after each completed batch
- **Documentation**: Update relevant docs as features are completed
- **Time Tracking**: Monitor actual time vs estimated for future planning

## Context from Previous Work

- Communities/Groups membership system now fully functional
- Backend POST /api/agents/:id/communities endpoint working
- All agents initialized in all groups (current "all see all" behavior)
- Membership filtering enabled in workspace.ts (lines 795-815)
- UI properly separates communities (purple) from groups (indigo)
