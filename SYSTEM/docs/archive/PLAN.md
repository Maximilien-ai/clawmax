# ClawMax v1.0.0 Release Plan

⚠️ **THIS PLAN IS OUTDATED AS OF MARCH 11** ⚠️
**Current Plan**: See `TASKS_MAR11.md` for today's (Wednesday) detailed plan
**Current Status**: See `WORK_SUMMARY_MAR10.md` for yesterday's work and `KNOWN_ISSUES.md` for bug status

**Target Release**: Friday, March 13, 2026 at 5 PM Pacific
**Status**: On Track - 2 days to demo

**Key Updates**:
- Issue #2 (completion toast) is FIXED ✅
- Issues #4 & #5 are the new critical blockers (agent tagging, archived cleanup)
- See KNOWN_ISSUES.md for all 9 tracked issues

---

NOTE: let's take some time to update this EOD today

## 📋 Release Overview

### v1.0.0 Goals
- Complete multi-agent orchestration dashboard
- Production-ready organization templates
- Comprehensive workflow automation
- Polish and bug fixes
- Professional presentation materials

---

## 🚨 Critical Tasks (Must Fix Before Release)

### 1. Debug Typing Indicators
**File**: `client/src/components/GroupChatPanel.tsx:79-135`
**Status**: 🔴 NOT WORKING
**Priority**: P0

**Investigation Steps**:
- [ ] Add console.log to verify `fetchActiveWorkflows()` is executing
- [ ] Check API response structure for execution participant status
- [ ] Test with 10+ agent workflow for longer execution window
- [ ] Verify channel.members IDs match participant agentIds exactly
- [ ] Use React DevTools to inspect `typingAgents` state changes

**Root Cause Options**:
1. Timing: Workflow completes before first poll (< 5 seconds)
2. API Response: Execution details may not include real-time participant status
3. State Management: `typingAgents` state not updating correctly
4. Channel Matching: Agent IDs mismatch between workflow participants and channel members
5. Polling Not Active: useEffect dependency issue

**Time Estimate**: 2-3 hours

---

### 2. Debug Completion Toast
**File**: `client/src/pages/Workflows.tsx:860-895, 131-226`
**Status**: 🔴 NOT WORKING
**Priority**: P0

**Investigation Steps**:
- [ ] Add console.log in `checkRunningWorkflows` to verify polling is active
- [ ] Log `trackedExecutions` Map contents before/after trigger
- [ ] Verify executionId format matches between trigger and list endpoints
- [ ] Test with React DevTools state inspection
- [ ] Verify `showSuccess` function is available in scope

**The Key Insight** (from your logs):
The execution IS detected as `completed`, BUT `wasTracked: false`! This means:
- We add the execution to `trackedExecutions` Map when triggering
- But when polling checks it, the Map doesn't have it (or key doesn't match)
- So no transition is detected (can't transition if it was never tracked)
- **Root cause**: Map key mismatch or state loss between renders

**Next step**: Log the EXACT keys being added vs checked to see the format difference.

**Root Cause Options**:
1. Tracking Not Working: `trackedExecutions` Map not updating correctly
2. Key Mismatch: Execution ID from `/trigger` doesn't match ID in `/executions` list
3. Timing: Workflow completes before next poll cycle (< 5 seconds)
4. Polling Stopped: `checkRunningWorkflows` interval may not be running
5. Toast Context: `useToast()` may not be available in polling callback

**Time Estimate**: 2-3 hours

---

## 🎯 High Priority Tasks (Required for v1.0.0)

### 3. Create QA Team Organization Template
**Status**: ⏳ NOT STARTED
**Priority**: P1

**Requirements**:
- 3 agents: qa-engineer, github-triager, release-coordinator
- 4 workflows: PR Review, Issue Triage, CI/CD Monitor, Status Report to PM
- Location: `TEMPLATES/organizations/qa-team/`
- Follow structure of existing templates (small-startup-team, engineering-team)

**Deliverables**:
- [ ] Create `template.json` with metadata
- [ ] Create agent files: IDENTITY.md, SOUL.md, TOOLS.md for each
- [ ] Define 4 workflows with proper targeting
- [ ] Test import with prefix to verify functionality

**Time Estimate**: 1-2 hours

---

### 4. Test Organization Template Import/Export
**Status**: ⏳ NOT TESTED
**Priority**: P1

**Test Plan**:
- [ ] Export current org as template ("My Team Structure")
- [ ] Import with prefix (e.g., "demo-") to verify no workspace pollution
- [ ] Test Small Startup Team template import
- [ ] Test Engineering Team template import
- [ ] Test QA Team template import (once created)
- [ ] Verify workflows are included and functional
- [ ] Test conflict resolution (duplicate agent IDs)

**Time Estimate**: 1 hour

---

### 5. Create Blog Post Assets
**Status**: ⏳ NOT STARTED
**Priority**: P1

**Required Screenshots**:
- [ ] Dashboard home page showing agent/workflow counts
- [ ] Agent detail view with IDENTITY/SOUL/TOOLS tabs
- [ ] Workflow execution detail with participant timeline
- [ ] Organization structure view (communities/groups hierarchy)
- [ ] Template browser showing both agents and organizations
- [ ] Execution history with running executions sorted first
- [ ] Communication view with group chat

**Optional Video**:
- [ ] 30-90 second walkthrough of triggering workflow and watching execution

**Storage**:
- Save to: `SYSTEM/dashboard/docs/assets/`
- Format: PNG for screenshots, MP4 for video
- Naming: `screenshot-{feature}-{number}.png`

**Time Estimate**: 1 hour

---

### 6. Create System AI Agents
**Status**: ⏳ NOT STARTED
**Priority**: P1 (mentioned in blog)

**Agents to Create**:
- [ ] **ClawMax Assistant**: Helps create optimized workflows and agents
- [ ] **Template Optimizer**: Analyzes and suggests improvements to templates
- [ ] **Organization Architect**: Recommends community/group structures based on usage
- [ ] **Workflow Debugger**: Identifies common issues and suggests fixes

**Implementation**:
- Create agents in `AGENTS/` directory
- Give them skills to read/analyze ClawMax APIs
- Add to special "System" community
- Document in blog post

**Time Estimate**: 2-3 hours

---

## ✅ Medium Priority Tasks (Nice to Have)

### 7. Documentation Updates
**Status**: ⏳ IN PROGRESS
**Priority**: P2

**Files to Update**:
- [ ] Review TESTING_GUIDE.md for accuracy
- [ ] Update KNOWN_ISSUES.md if bugs are fixed
- [ ] Create user-facing README for ClawMax in `SYSTEM/dashboard/README.md`
- [ ] Add CONTRIBUTING.md guidelines

**Time Estimate**: 1 hour

---

### 8. Production Hardening Prep
**Status**: ⏳ DOCUMENTATION ONLY
**Priority**: P2

**Documentation Tasks** (don't implement, just document):
- [ ] Document TLS/encryption requirements for remote deployments
- [ ] Document RBAC design for future work
- [ ] Document secrets management approach
- [ ] Add deployment guide outline
- [ ] Create `PRODUCTION.md` with hardening checklist

**Time Estimate**: 30 minutes

---

### 9. Final Testing Pass
**Status**: ⏳ ONGOING
**Priority**: P2

**Test Checklist**:
- [ ] Run `./test.sh` - verify all 92 tests pass (106 actual tests)
- [ ] Test agent creation (manual + AI-assisted)
- [ ] Test workflow creation and execution
- [ ] Test Communication view with group/community chat
- [ ] Test execution detail view with logs
- [ ] Test template browsing and application
- [ ] Test organization template export/import
- [ ] Verify all navigation links work
- [ ] Check for console errors in browser

**Time Estimate**: 1 hour

---

## 📝 Pre-Launch Tasks

### 10. Blog Post Final Review
**Status**: ✅ DRAFT COMPLETE
**Priority**: P0

**Checklist**:
- [x] All NOTEs addressed and removed
- [ ] Proofread for typos and grammar
- [ ] Verify all features mentioned are working
- [ ] Update version numbers if needed
- [ ] Add screenshots/videos to placeholders
- [ ] Get final approval
- [ ] Format for Substack publication

**Time Estimate**: 30 minutes

---

### 11. Create Presentation
**Status**: ⏳ NOT STARTED
**Priority**: P0

**Format**: 10-15 minute presentation
**Audience**: Technical stakeholders, potential users

**Outline**:
1. **Problem** (2 min): Why managing many agents is hard
2. **Solution** (3 min): ClawMax overview with live demo
3. **Features** (5 min): Dashboard, workflows, templates, execution tracking
4. **Demo** (3 min): Run a workflow, show execution detail, apply template
5. **Roadmap** (2 min): What's next for ClawMax

**Deliverables**:
- [ ] Create presentation deck (Keynote/PowerPoint/Google Slides)
- [ ] Prepare live demo environment
- [ ] Script key talking points
- [ ] Practice run-through (timing)
- [ ] Export to PDF for sharing

**Time Estimate**: 2-3 hours

---

### 12. Git Commit & Tag
**Status**: ⏳ NOT STARTED
**Priority**: P0

**Tasks**:
- [ ] Review all changes with `git status` and `git diff`
- [ ] Commit all changes: `git commit -m "feat: ClawMax v1.0.0 release"`
- [ ] Tag release: `git tag -a v1.0.0 -m "ClawMax v1.0.0: Multi-agent orchestration dashboard"`
- [ ] Push to GitHub: `git push && git push --tags`
- [ ] Verify git status is clean
- [ ] Create GitHub release with changelog

**Time Estimate**: 15 minutes

---

## 🗓️ Timeline & Schedule

### Monday (March 10 - Today)
**Duration**: 4-6 hours
**Focus**: 🚨 Critical Bug Fixes

- [ ] Debug typing indicators (#1) - 2-3 hours
- [ ] Debug completion toast (#2) - 2-3 hours
- [ ] Run test pass (#9) - 30 minutes
- [ ] Documentation updates if time permits

**Deliverable**: Both critical bugs resolved

---

### Tuesday (March 11)
**Duration**: 4-6 hours
**Focus**: 🎯 **THE KILLER DEMO** - Complete Working Org from Template

**Goal**: Stand up a complete organization from template in 30 seconds with agents, workflows, groups, communities - and have them actually work!

- [ ] Create QA Team template (#3) - 2-3 hours
  - 3 agents with full IDENTITY.md, SOUL.md, TOOLS.md
  - 4 workflows with proper targeting
  - Community and group structure
  - **Test end-to-end**: Import → Agents online → Run workflow → See results
- [ ] Create system AI agents (#6) - 2-3 hours
  - ClawMax Assistant
  - Template Optimizer
  - Organization Architect
  - Workflow Debugger
  - Add to "System" community
- [ ] Test all org templates (#4) - 1 hour
  - Small Startup Team: Import, verify, test workflow
  - Engineering Team: Import, verify, test workflow
  - QA Team: Import, verify, test workflow

**Deliverable**: Complete working org templates - the killer demo ready!

---

### Wednesday (March 12)
**Duration**: 4-5 hours
**Focus**: 📸 Assets & Testing

- [ ] Capture screenshots for blog (#5) - 1-2 hours
  - Dashboard home
  - Workflow execution
  - Organization view
  - Template library
  - Execution detail
- [ ] Optional: Record demo video - 30-60 minutes
- [ ] Final comprehensive test pass (#9) - 2 hours
- [ ] Update documentation (#7) - 1 hour

**Deliverable**: All assets captured, comprehensive testing complete

---

### Thursday (March 13)
**Duration**: 5-6 hours
**Focus**: 📦 Public Repo Migration + 🎤 Presentation Preparation

- [ ] **Prepare public repo (maximilien-ai/clawmax)** - 2-3 hours
  - Repo: https://github.com/Maximilien-ai/clawmax (currently private)
  - Copy code from private maxclaw repo
  - Verify peg to OpenClaw version at `/Users/maximilien/github/maximilien/openclaw`
  - Test clean clone and installation
  - Update README with installation instructions
  - Verify all tests pass on clean clone
  - Push to GitHub
  - **Make public Friday before 5pm talk**
- [ ] Create presentation deck (#11) - 2 hours
- [ ] Practice demo run-through - 1 hour
- [ ] Add screenshots to blog (#10) - 30 minutes
- [ ] Proofread blog post - 30 minutes

**Deliverable**: Public repo ready, presentation deck complete, blog polished

---

### Friday (March 14 - Launch Day!)
**Duration**: 2-3 hours
**Focus**: 🚀 Launch & Present

**Morning** (9am-11am):
- [ ] Final blog review and format for Substack - 30 minutes
- [ ] Verify all features working - 30 minutes
- [ ] Git commit and tag v1.0.0 (#12) - 15 minutes
- [ ] Prepare demo environment - 15 minutes

**Afternoon** (2pm-4pm):
- [ ] Publish blog post - 15 minutes
- [ ] Push git tags to GitHub - 5 minutes
- [ ] Create GitHub release - 15 minutes
- [ ] **Give presentation** (10-15 min) 🎉
- [ ] Announce on social media - 15 minutes

**Deliverable**: v1.0.0 launched and presented!

---

## 📊 Progress Tracking

### Completed ✅
- Organization template system with workflow support
- Pre-built templates (Small Startup Team, Engineering Team)
- Workflow completion toast implementation (needs debugging)
- Smart execution sorting
- Template export/import bug fixes
- Blog draft with all NOTEs addressed
- Test infrastructure (92 tests, 106 actual)

### In Progress 🔄
- Debugging typing indicators
- Debugging completion toast
- QA Team template creation
- Documentation updates

### Not Started ⏳
- System AI agents
- Blog assets (screenshots/video)
- Presentation deck
- Git tagging

---

## 🎯 Success Criteria

### Must Have (v1.0.0 Blocker)
- [ ] Typing indicators working
- [ ] Completion toast working
- [ ] QA Team template created
- [ ] Blog post published with assets
- [ ] Presentation delivered
- [ ] Git tagged v1.0.0

### Nice to Have (Post-Launch OK)
- [ ] System AI agents functional
- [ ] All documentation updated
- [ ] Production hardening documented
- [ ] User-facing README complete

---

## ⚠️ Risks & Mitigation

### Risk: Critical bugs not fixed in time
**Impact**: HIGH
**Mitigation**: Prioritize bugs today (Thursday PM), if not fixed by Friday AM, document as known issues and move to v1.0.1

### Risk: Presentation not ready
**Impact**: HIGH
**Mitigation**: Prepare presentation Friday midday, keep it simple (10 slides max), focus on live demo

### Risk: System AI agents not complete
**Impact**: LOW
**Mitigation**: Already mentioned as "Beta" in blog, can launch with placeholders and complete post-launch

### Risk: Screenshots/video not captured
**Impact**: MEDIUM
**Mitigation**: Prioritize Friday AM, can publish blog without media and add later

---

## 📞 Communication Plan

### Internal Updates
- Monday EOD: Progress report on critical bugs
- Tuesday EOD: Status on system agents and QA template
- Wednesday EOD: Confirm all assets captured
- Thursday EOD: Presentation deck review
- Friday morning: Final checklist before launch

### External Announcement
- Blog post published: Friday 2pm
- GitHub release: Friday 2:30pm
- Social media: Friday 3pm
- Mailing list: Friday 3:30pm

---

## 📚 Reference Documents

### General Documentation (`SYSTEM/docs/`)
- `BLOG_POST_DRAFT.md` - Blog post (ready for assets)
- `TESTING_GUIDE.md` - Testing procedures
- `PRESENTATION_OUTLINE.md` - Presentation deck outline
- `PLAN.md` - This file (complete release plan)
- `TASK_SUMMARY.md` - Daily task breakdown
- `ROADMAP.md` - Long-term roadmap
- `STATUS.md` - Project status

### Dashboard-Specific (`SYSTEM/dashboard/docs/`)
- `KNOWN_ISSUES.md` - Active dashboard bugs

---

**Last Updated**: March 10, 2026
**Next Review**: Monday EOD (after bug fixes)

---

**Total Estimated Time**: 18-26 hours
**Available Time**:
- Monday: 4-6 hours
- Tuesday: 4-6 hours
- Wednesday: 4-5 hours
- Thursday: 4-5 hours
- Friday: 2-3 hours
- **Total**: ~20-25 hours

**Buffer**: ~0-5 hours (comfortable pace!)

🚀 **Let's ship it!**
