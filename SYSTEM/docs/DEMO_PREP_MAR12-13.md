# Demo Prep Tasks - March 12-13, 2026

**Demo**: Friday March 13 at 5:00 PM
**Ready by**: Friday 4:00 PM
**Time available**: ~16 hours (8hrs Thursday + 8hrs Friday)

---

## 🎯 Critical Path to Demo

### Must-Have by 4 PM Friday
- [ ] All 3 org templates tested and verified working
- [ ] Demo workspace set up with "Small Startup Team" pre-imported
- [ ] All demo agents online and responding
- [ ] Demo flow practiced at least once (8-10 minutes)
- [ ] Blog post published on Substack (or scheduled)

### Nice-to-Have
- [ ] @all messaging issue investigated/documented
- [ ] Code pushed to GitHub public repo (if going public)
- [ ] Any UI polish from testing

---

## 📅 Thursday March 12 - Testing & Polish Day

### Morning (9 AM - 12 PM) - 3 hours

#### Priority 1: Test All Org Templates 🧪
**Time budget**: 2-2.5 hours

**Test Plan**:

1. **Small Startup Team** (CEO, Engineer, PM + 2 workflows)
   - [ ] Import to fresh test workspace
   - [ ] Verify 3 agents created with correct identities
   - [ ] Check communities/groups populated
   - [ ] Run "Daily Standup" workflow → verify all 3 agents respond
   - [ ] Run "Weekly Status Report" workflow → check execution tracking
   - [ ] Document any issues

2. **Engineering Team** (Engineer, QA, Release + 3 workflows)
   - [ ] Import to fresh workspace
   - [ ] Verify all agents created
   - [ ] Test workflow: Code Review Reminder
   - [ ] Test workflow: Sprint Planning
   - [ ] Test workflow: Release Preparation
   - [ ] Check group messaging works

3. **QA Team** (QA, Triager, Coordinator + 4 workflows)
   - [ ] Import to fresh workspace
   - [ ] Test: PR Review workflow
   - [ ] Test: Issue Triage workflow
   - [ ] Test: CI/CD Monitor workflow
   - [ ] Test: Status Report to PM workflow
   - [ ] Verify execution logs captured

**Success criteria**:
- All templates import without errors
- All workflows execute and return responses
- No agent creation failures
- Execution tracking shows all participant responses

**If bugs found**:
- Document in KNOWN_ISSUES.md
- Fix if critical for demo
- Create workaround if complex

#### Priority 2: Quick UI Check ✨
**Time budget**: 30 minutes

- [ ] Dashboard loads all agent cards
- [ ] Workflow execution page updates in real-time
- [ ] Template library displays correctly
- [ ] Communication page shows groups
- [ ] Multi-workspace switcher works

### Afternoon (1 PM - 5 PM) - 4 hours

#### Priority 1: Demo Environment Setup 🎬
**Time budget**: 1.5 hours

**Tasks**:
1. [ ] Create dedicated workspace: `demo-workspace`
2. [ ] Import "Small Startup Team" template
3. [ ] Verify all 3 agents (CEO, Engineer, PM) are online
4. [ ] Pre-run "Daily Standup" workflow (for execution history)
5. [ ] Clear any test/old data from logs
6. [ ] Take screenshot of clean dashboard for backup

**Demo workspace checklist**:
- [ ] ORG/IDENTITY.md has clean mission statement
- [ ] 3 agents with clear, professional identities
- [ ] 2 workflows ready to trigger
- [ ] At least 1 completed execution in history
- [ ] No test/junk data visible

#### Priority 2: Demo Flow Practice 🎭
**Time budget**: 1.5 hours

**Demo Script** (8-10 minutes total):

1. **Dashboard Overview** (1 min)
   - Show all agents with status indicators
   - Point out communities, groups, tags
   - Filter by community/status

2. **Create Agent with AI** (1 min)
   - Click "Create Agent"
   - Use AI generation: "DevOps engineer who monitors infrastructure"
   - Show generated IDENTITY.md

3. **Import Org Template** (1 min)
   - Open Templates page
   - Select "Small Startup Team"
   - Show import with prefix
   - Verify agents created

4. **Trigger Workflow** (2 min)
   - Navigate to Workflows
   - Select "Daily Standup"
   - Show targeting (Engineering Team community)
   - Click "Run Now"
   - Show execution started

5. **Execution Tracking** (1 min)
   - Switch to Executions page
   - Show real-time participant status
   - Display agent responses as they come in
   - Point out completion notification

6. **Communication Groups** (1 min)
   - Navigate to Communication
   - Show Engineering Team group
   - Send message to group
   - Show agent responses

7. **Templates Library** (1 min)
   - Show workflow templates
   - Show agent templates
   - Show org templates
   - Highlight pre-built options

8. **Multi-Workspace** (1 min)
   - Switch between workspaces
   - Show different agent teams
   - Demonstrate isolation

**Practice checklist**:
- [ ] Run through entire flow once
- [ ] Time each section
- [ ] Identify slow/risky parts
- [ ] Prepare what to say for each feature
- [ ] Test on clean browser (clear cache)

#### Priority 3: Backup Plans 🛟
**Time budget**: 30 minutes

**Prepare for demo failures**:

1. **If workflow fails to execute**:
   - Have screenshot of successful execution ready
   - Know how to quickly restart agents
   - Have backup workspace ready

2. **If agent goes offline**:
   - Command ready: `openclaw gateway start <agent-id>`
   - Switch to pre-tested demo workspace

3. **If UI glitches**:
   - Have second browser tab with dashboard loaded
   - Know how to quickly reload without losing state

4. **Complete failure**:
   - Have screenshots/video from blog post ready
   - Can walk through features using static images

**Create**:
- [ ] DEMO_BACKUP_PLAN.md with recovery steps
- [ ] Screenshot folder with key features
- [ ] List of commands to restart agents quickly

#### Priority 4: Optional - Investigate @all Issue 🔍
**Time budget**: 1 hour (only if time permits)

- [ ] Add debug logging to group message endpoint
- [ ] Test @all with all agents online
- [ ] Test @all with mixed online/offline
- [ ] Document findings in KNOWN_ISSUES.md

**Decision point**:
- If fixable in <30 min → fix it
- If complex → document and skip in demo
- If timing issue → defer to post-demo

---

## 📅 Friday March 13 - Demo Day

### Morning (9 AM - 12 PM) - 3 hours

#### Priority 1: Final System Check ✅
**Time budget**: 1 hour

**9:00 AM - Fresh Start**:
- [ ] Restart dashboard: `cd SYSTEM/dashboard && npm run dev`
- [ ] Verify all demo workspace agents are online
- [ ] Check dashboard loads cleanly
- [ ] Run quick workflow to verify system working

**9:15 AM - Run Through Demo**:
- [ ] Execute full demo flow from script
- [ ] Time it (should be 8-10 minutes)
- [ ] Verify no errors/glitches
- [ ] Check all transitions smooth

**9:45 AM - Edge Case Testing**:
- [ ] Try filtering agents
- [ ] Switch workspaces
- [ ] Trigger workflow manually
- [ ] Check execution logs

#### Priority 2: Blog Post Status Check 📝
**Time budget**: 30 minutes

- [ ] Confirm blog post published on Substack (or scheduled)
- [ ] Verify all images/video uploaded correctly
- [ ] Test blog post link works
- [ ] Share link ready to copy/paste

**If not published yet**:
- [ ] Upload to Substack editor
- [ ] Manual video upload
- [ ] Schedule for 12 PM publish (before demo)
- [ ] Preview before scheduling

#### Priority 3: Documentation Cleanup 📚
**Time budget**: 30 minutes

**Archive old docs**:
```bash
mkdir -p SYSTEM/docs/archive
mv SYSTEM/docs/MORNING_START_MAR11.md SYSTEM/docs/archive/
mv SYSTEM/docs/SUMMARY_MAR10.md SYSTEM/docs/archive/
mv SYSTEM/docs/WORK_SUMMARY_MAR10.md SYSTEM/docs/archive/
mv SYSTEM/docs/WORK_SUMMARY_MAR11.md SYSTEM/docs/archive/
mv SYSTEM/docs/TASKS_MAR11.md SYSTEM/docs/archive/
```

**Keep active**:
- BLOG_POST_FINAL.md ✅
- PRESENTATION_OUTLINE.md ✅
- KNOWN_ISSUES.md ✅
- DEMO_PREP_MAR12-13.md ✅ (this file)

#### Priority 4: Demo Dry Run 🎯
**Time budget**: 1 hour

**11:00 AM - Full Dress Rehearsal**:
- [ ] Set up screen sharing (test it)
- [ ] Close all unnecessary applications
- [ ] Clear browser history/cache
- [ ] Load dashboard in fresh browser
- [ ] Run complete demo flow as if presenting
- [ ] Record yourself (optional - for review)

**Talking points to practice**:
- Opening: "ClawMax makes managing 100 agents as easy as managing 10"
- Problem: "I was running 15 agents and hit chaos - terminal windows everywhere"
- Solution: "Built 5 layers on OpenClaw: dashboard, orgs, workflows, templates, tracking"
- Close: "Demo-ready today, blog post live, open source"

### Afternoon (12 PM - 4 PM) - Pre-Demo Buffer

#### 12:00 PM - 2:00 PM: Lunch + Buffer ☕
- Take a break
- Review PRESENTATION_OUTLINE.md
- Read through talking points
- Stay calm 😊

#### 2:00 PM - 3:30 PM: Final Prep 🎬

**2:00 PM - Environment Lock**:
- [ ] Verify demo workspace pristine
- [ ] All 3 agents online (CEO, Engineer, PM)
- [ ] Dashboard running smoothly
- [ ] No errors in console
- [ ] Fresh workflow ready to trigger

**2:30 PM - Tech Setup**:
- [ ] Test screen sharing in Zoom/Meet/Teams
- [ ] Audio check
- [ ] Camera check (if using)
- [ ] Close distracting tabs
- [ ] Browser zoom at 100% or 110% (readable)
- [ ] Hide bookmark bar
- [ ] Full screen mode ready

**3:00 PM - Run Through One More Time**:
- [ ] Complete demo flow (8-10 min)
- [ ] Check timing
- [ ] Smooth transitions
- [ ] Clear, confident delivery

#### 3:30 PM - 4:00 PM: Pre-Flight Checklist ✈️

**30 minutes before demo**:
- [ ] Dashboard running and responsive
- [ ] All demo agents online (check gateway)
- [ ] Demo workspace active
- [ ] Screen sharing tested
- [ ] No embarrassing browser tabs 😅
- [ ] Phone on silent
- [ ] Water nearby
- [ ] DEMO_BACKUP_PLAN.md open (just in case)

**Ready state**:
- Dashboard at http://localhost:5173
- Browser full screen mode
- Demo workspace selected
- First feature (Dashboard) ready to show

---

## 🎬 Demo Day - 5:00 PM

### Demo Flow (8-10 minutes)

**0:00 - Opening** (30 sec)
> "Hi everyone! I'm excited to show you ClawMax - the orchestration layer OpenClaw needed. After running 15+ agents for weeks, I hit chaos - terminal windows everywhere, no visibility, manual coordination. So I built ClawMax to make managing 100 agents as easy as managing 10."

**0:30 - Dashboard** (1 min)
- Show agent cards with online/offline status
- Filter by community/tags
- Highlight real-time updates

**1:30 - Organizations** (1 min)
- Show communities and groups
- Explain structure (Engineering Team → Daily Standup group)
- Click through to Communication

**2:30 - Workflows** (2 min)
- Select "Daily Standup" workflow
- Show targeting (Engineering Team)
- Click "Run Now"
- Watch execution start

**4:30 - Execution Tracking** (1 min)
- Show real-time participant status
- Display agent responses
- Point out completion notification

**5:30 - Templates** (1 min)
- Show template library
- Highlight "Small Startup Team" (3 agents + 2 workflows)
- Explain one-click setup

**6:30 - Communication** (1 min)
- Switch to Communication page
- Show group channels
- Send message to Engineering Team

**7:30 - Multi-Workspace** (1 min)
- Switch between workspaces
- Show different agent teams
- Explain isolation

**8:30 - Closing** (1 min)
> "That's ClawMax - visual management, workflow automation, and execution tracking for your AI agent teams. It's demo-ready today, built on OpenClaw's foundation, and available as open source. Blog post is live on Substack. Questions?"

### Backup Plans 🛟

**If workflow doesn't execute**:
- "Let me show you a completed execution from earlier" → Switch to Executions history

**If agent offline**:
- "Let me switch to my production workspace" → Switch to backup workspace

**If UI freezes**:
- Have second tab ready → Reload quickly

**If complete failure**:
- "Let me walk you through the architecture using these diagrams" → Use blog post screenshots

---

## 📊 Success Metrics

### Must achieve by 4 PM Friday:
- [x] Blog post finalized (DONE - 2,448 words)
- [ ] All 3 org templates tested
- [ ] Demo workspace ready
- [ ] Demo flow practiced
- [ ] Backup plans prepared

### Nice to have:
- [ ] Blog published on Substack
- [ ] @all messaging investigated
- [ ] Code pushed to public GitHub
- [ ] UI polish complete

---

## 🚨 Risk Mitigation

### High Risk: Workflow execution fails during demo
**Mitigation**: Pre-run workflow before demo, have execution history ready, know agent restart commands

### Medium Risk: Agent goes offline
**Mitigation**: Check all agents at 4 PM, have `openclaw gateway start` commands ready, use backup workspace

### Low Risk: UI glitch
**Mitigation**: Restart dashboard at 2 PM, clear cache, have second browser tab ready

---

## ⏱️ Time Budget

### Thursday (8 hours):
- Template testing: 2.5 hours
- UI check: 0.5 hours
- Demo env setup: 1.5 hours
- Demo practice: 1.5 hours
- Backup plans: 0.5 hours
- @all investigation: 1 hour (optional)
- Buffer: 0.5 hours

### Friday (8 hours):
- System check: 1 hour
- Blog status: 0.5 hours
- Docs cleanup: 0.5 hours
- Demo dry run: 1 hour
- Lunch: 2 hours
- Final prep: 1.5 hours
- Pre-flight: 0.5 hours
- Demo: 0.5 hours
- Buffer: 0.5 hours

**Total**: 16 hours across 2 days

---

## 📝 Post-Demo (After 6 PM Friday)

- [ ] Collect feedback
- [ ] Document what went well
- [ ] Note what to improve
- [ ] Create action items for next week
- [ ] Celebrate! 🎉

---

**Last updated**: March 11, 2026 (Evening)
**Next review**: Thursday 9 AM before starting work
