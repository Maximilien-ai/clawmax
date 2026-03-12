# Work Plan: March 12-13, 2026

**Status**: Active Plan
**Created**: March 11, 2026 (Evening)
**Target**: Demo-ready by Friday March 14, 2026

## 🚀 Quick Reference

**Critical Deliverables**:
- 📝 Blog post review & publish → **Tonight (train)**
- 🧪 Test all org templates → **Thursday AM**
- 🔧 Push code to GitHub (private) → **Thursday PM**
- 🌐 Deploy ClawMax.ai website → **Friday AM**
- 🎬 Demo ready → **Friday PM**

**Key URLs**:
- GitHub (code): `Maximilien-ai/maxclaw` (PRIVATE)
- GitHub (website): `Maximilien-ai/clawmax-ai-web`
- Website: https://ClawMax.ai (GoDaddy → Vercel)
- Blog: https://maximilien.substack.com

**Time Budget**: ~12-17 hours over 2.5 days

---

## 🎯 Current Status (End of Day - March 11)

### ✅ Completed Today
1. **Multi-workspace workflow execution** - Fully working
2. **Workspace editing** - Name, tags, color updates
3. **Workspace creation with tags** - Complete
4. **Blog post media** - All 5 images + 1 video + 2 SVG diagrams
5. **OpenClaw favicon** - 🦞 emoji added
6. **Clean logs** - Suppressed noisy Gateway errors
7. **Debug logging** - Workspace metadata updates

### 📊 Blog Post Status
- ✅ Content complete (1800-2200 words)
- ✅ All media captured (5 PNG, 1 MOV, 2 SVG)
- ✅ Technical accuracy verified
- ⏳ **Pending**: Final review and copyedit (tonight on train)
- ⏳ **Pending**: Publish to Substack

### 🐛 Known Issues Status
- ✅ Issue #1-10: All documented, most FIXED
- 🟡 Issue #1: Typing indicators (timing limitation - accepted)
- 🟡 Issue #3: @all messages (needs investigation)
- 🟡 Issue #8: Navigation highlight (low priority)
- 🟡 Gateway RPC scope limitation (documented)

---

## 🚂 Tonight (Train - 1-2 hours)

### Priority 1: Blog Post Review
**Goal**: Final review and publish

**Tasks**:
- [ ] Read blog post end-to-end on phone/laptop
- [ ] Check for typos, grammar, clarity
- [ ] Verify technical accuracy
- [ ] Verify all image/video references work
- [ ] Check word count (target: 1800-2200)
- [ ] Make final edits if needed
- [ ] **Optional**: Publish to Substack if satisfied

**Time estimate**: 45-60 minutes

### Priority 2: Demo Planning
**Goal**: Outline Friday demo flow

**Tasks**:
- [ ] Review PRESENTATION_OUTLINE.md
- [ ] Identify key features to showcase
- [ ] Plan demo flow (5-10 minute walkthrough)
- [ ] List talking points for each feature
- [ ] Note any risky areas that might fail

**Time estimate**: 30-45 minutes

**Output**: Update PRESENTATION_OUTLINE.md with demo script

---

## 📅 Thursday March 12, 2026

### Morning Session (9 AM - 12 PM)

#### Priority 1: Test All Org Templates 🧪
**Goal**: Verify all pre-built templates work correctly

**Templates to test**:
1. **Small Startup Team** (3 agents + 2 workflows)
   - [ ] Import to test workspace
   - [ ] Verify agents created with correct tags
   - [ ] Verify groups/communities populated
   - [ ] Trigger "Daily Standup" workflow
   - [ ] Trigger "Weekly Status Report" workflow
   - [ ] Check execution logs

2. **Engineering Team** (3 agents + 3 workflows)
   - [ ] Import to test workspace
   - [ ] Verify all agents online
   - [ ] Test all 3 workflows
   - [ ] Check group messaging

3. **QA Team** (3 agents + 4 workflows)
   - [ ] Import to test workspace
   - [ ] Test PR Review workflow
   - [ ] Test Issue Triage workflow
   - [ ] Test CI/CD Monitor workflow
   - [ ] Test Status Report workflow

**Documentation**:
- [ ] Record any bugs found
- [ ] Update KNOWN_ISSUES.md if needed
- [ ] Create testing notes for demo

**Time estimate**: 2-3 hours

#### Priority 2: Investigate @all Messages Issue 🔍
**Goal**: Fix or document Issue #3

**Investigation steps**:
1. [ ] Add debug logging to group message endpoint
2. [ ] Test @all with all agents online
3. [ ] Test @all with some agents offline
4. [ ] Check Gateway responses
5. [ ] Verify message routing logic

**Outcomes**:
- **If fixable**: Implement fix and test
- **If complex**: Document workaround for demo
- **If timing**: Defer to post-demo

**Time estimate**: 1-2 hours

### Afternoon Session (1 PM - 5 PM)

#### Priority 1: Demo Preparation 🎬
**Goal**: Practice demo flow

**Tasks**:
1. [ ] Create fresh demo workspace
2. [ ] Import "Small Startup Team" template
3. [ ] Practice demo flow from PRESENTATION_OUTLINE.md
4. [ ] Time each section (target: 8-10 minutes total)
5. [ ] Identify any slow/buggy areas
6. [ ] Prepare backup plan for demo fails

**Demo flow checklist**:
- [ ] Dashboard overview (1 min)
- [ ] Create agent with AI (1 min)
- [ ] Import org template (1 min)
- [ ] Trigger workflow (2 min)
- [ ] Show execution tracking (1 min)
- [ ] Communication groups (1 min)
- [ ] Templates library (1 min)
- [ ] Multi-workspace switch (1 min)
- [ ] Q&A buffer (2-3 min)

**Time estimate**: 2-3 hours

#### Priority 2: GitHub Repository Setup 🔧
**Goal**: Move code to private GitHub repo

**Repository**: `Maximilien-ai/maxclaw` (PRIVATE)

**Tasks**:
1. [ ] Create new **PRIVATE** repo on GitHub (Maximilien-ai/maxclaw)
2. [ ] Add comprehensive README.md with:
   - Project description and goals
   - Installation instructions
   - Quick start guide
   - Link to blog post
   - Link to ClawMax.ai website
3. [ ] Create .gitignore (exclude node_modules, .env, workspace data)
4. [ ] Add LICENSE (MIT or appropriate for private repo)
5. [ ] Push all dashboard code to repo
6. [ ] Push OpenClaw enhancements (CLI changes)
7. [ ] Set repo description and website URL (ClawMax.ai)

**Files to prepare**:
- [ ] Root README.md (project overview)
- [ ] SYSTEM/dashboard/README.md (dashboard setup)
- [ ] CONTRIBUTING.md (if accepting contributions)
- [ ] CHANGELOG.md (version history)

**Commands**:
```bash
cd /Users/maximilien/.openclaw/workspace
git remote add github git@github.com:Maximilien-ai/maxclaw.git
git push -u github main
```

**Time estimate**: 1-2 hours

#### Priority 3: Polish & Bug Fixes 🐛
**Goal**: Fix any critical issues found during testing

**Potential tasks** (based on testing results):
- [ ] Fix bugs found in template testing
- [ ] Improve error messages
- [ ] Add loading states if needed
- [ ] Fix UI glitches

**Time estimate**: 1-2 hours

---

## 📅 Friday March 13, 2026

### Morning Session (9 AM - 12 PM)

#### Priority 1: Final Testing 🧪
**Goal**: Verify everything works

**Tasks**:
1. [ ] Restart dashboard fresh
2. [ ] Run through entire demo flow
3. [ ] Test edge cases
4. [ ] Verify all workflows execute
5. [ ] Check all images/videos load
6. [ ] Test on different browser (if time)

**Time estimate**: 1-2 hours

#### Priority 2: Website Deployment 🌐
**Goal**: Deploy ClawMax.ai website to Vercel with GoDaddy DNS

**Website**: https://ClawMax.ai (GoDaddy domain)
**Hosting**: Vercel
**Repo**: https://github.com/Maximilien-ai/clawmax-ai-web

**Tasks**:
1. [ ] Verify website code is pushed to GitHub repo (Maximilien-ai/clawmax-ai-web)
2. [ ] Connect repo to Vercel:
   - [ ] Sign in to Vercel with GitHub
   - [ ] Import project
   - [ ] Configure build settings
   - [ ] Deploy to production
3. [ ] Get Vercel deployment URL and DNS settings
4. [ ] Configure GoDaddy DNS:
   - [ ] Log in to GoDaddy.com
   - [ ] Navigate to ClawMax.ai DNS settings
   - [ ] Add Vercel DNS records:
     - A record: `@` → Vercel IP
     - CNAME: `www` → Vercel domain
   - [ ] Save DNS changes
5. [ ] Verify domain in Vercel:
   - [ ] Add custom domain: ClawMax.ai
   - [ ] Add www.ClawMax.ai
   - [ ] Wait for DNS propagation (5-10 min)
6. [ ] Enable HTTPS/SSL in Vercel (auto)
7. [ ] Test website loads at ClawMax.ai

**Resources**:
- Vercel docs: https://vercel.com/docs/concepts/projects/custom-domains
- GoDaddy DNS: https://dcc.godaddy.com/domains

**DNS Records to add** (from Vercel):
```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

**Time estimate**: 45-60 minutes (including DNS propagation wait)

#### Priority 3: Demo Environment Setup 🎬
**Goal**: Prepare perfect demo state

**Tasks**:
1. [ ] Create dedicated demo workspace
2. [ ] Import "Small Startup Team" template
3. [ ] Pre-run one workflow (for execution history)
4. [ ] Clear any old test data
5. [ ] Verify all agents online
6. [ ] Set up screen share / recording

**Time estimate**: 30-60 minutes

#### Priority 3: Documentation Cleanup 📝
**Goal**: Archive old docs, finalize current docs

**Tasks**:
- [ ] Archive dated docs (see list below)
- [ ] Update README.md if needed
- [ ] Ensure KNOWN_ISSUES.md is current
- [ ] Create DEMO_NOTES.md with backup plans

**Time estimate**: 30-60 minutes

### Afternoon Session (Demo Time)

#### Demo Delivery 🚀
**Time**: TBD (confirm with team)
**Duration**: 10-15 minutes
**Attendees**: TBD

**Checklist before demo**:
- [ ] Dashboard running and responding
- [ ] All agents online
- [ ] Demo workspace active
- [ ] Screen sharing tested
- [ ] Recording started (if needed)
- [ ] Browser zoom set appropriately
- [ ] No embarrassing tabs open 😅

**Demo backup plans**:
- If workflow fails → Show pre-recorded execution
- If agent offline → Switch to demo workspace
- If UI glitch → Reload page (have it ready in another tab)
- If complete failure → Show screenshots/video from blog post

---

## 📦 Docs Cleanup Plan

### Files to Archive (Move to archive/)

**Dated summaries** (completed work):
- `MORNING_START_MAR11.md` → archive/
- `SUMMARY_MAR10.md` → archive/
- `WORK_SUMMARY_MAR10.md` → archive/
- `WORK_SUMMARY_MAR11.md` → archive/
- `TASKS_MAR11.md` → archive/

**Completed guides** (one-time use):
- `TRAIN_NOTES.md` → archive/ (or delete if empty)
- `TRAIN_REVIEW_GUIDE.md` → archive/
- `DOCS_REVIEW_CHECKLIST.md` → archive/ (if done)

### Files to Keep (Active)

**Current reference**:
- `BLOG_POST_DRAFT.md` ✅ (ready for publish)
- `PRESENTATION_OUTLINE.md` 🔄 (update with demo script)
- `PLAN.md` 🔄 (update if roadmap changes)
- `ROADMAP.md` ✅ (current)
- `README.md` ✅ (entry point)
- `STATUS.md` 🔄 (update after demo)

**Technical docs**:
- `WORKFLOWS.md` ✅
- `TESTING_GUIDE.md` ✅
- `SECURITY.md` ✅
- `SECURITY_ISSUES.md` ✅

**Dashboard subdirectory**:
- `SYSTEM/dashboard/docs/KNOWN_ISSUES.md` ✅ (comprehensive)

### New Files to Create

**For Friday**:
- `DEMO_NOTES.md` - Demo script with backup plans
- `DEMO_CHECKLIST.md` - Pre-demo setup checklist
- `POST_DEMO_NOTES.md` - Feedback and action items

---

## 🎯 Success Criteria

### For Thursday EOD
- [ ] All 3 org templates tested and working
- [ ] @all message issue investigated (fixed or documented)
- [ ] Demo flow practiced and timed (8-10 minutes)
- [ ] All critical bugs fixed
- [ ] **Code pushed to GitHub (Maximilien-ai/maxclaw)**
- [ ] Blog post published to Substack (or ready to publish Friday AM)

### For Friday Pre-Demo
- [ ] Fresh demo environment set up
- [ ] All agents online and responding
- [ ] **ClawMax.ai website live on Vercel**
- [ ] Demo flow rehearsed at least once
- [ ] Backup plans prepared
- [ ] Screen sharing tested

### For Friday Post-Demo
- [ ] Demo delivered successfully
- [ ] Feedback collected
- [ ] Action items documented
- [ ] Blog post shared (if not already)

---

## 🚨 Risk Areas & Mitigations

### Risk 1: Workflow Execution Fails During Demo
**Likelihood**: Low (tested today, working)
**Impact**: High
**Mitigation**:
- Pre-run workflow before demo to verify
- Have pre-recorded execution ready to show
- Know how to quickly restart agents if needed

### Risk 2: @all Messages Not Working
**Likelihood**: Medium (Issue #3 unresolved)
**Impact**: Medium
**Mitigation**:
- Test thoroughly on Thursday
- Document workaround (send to individual agents)
- Avoid demonstrating @all if unreliable

### Risk 3: Agent Offline During Demo
**Likelihood**: Low
**Impact**: Medium
**Mitigation**:
- Verify all agents online before demo
- Have `openclaw gateway start` commands ready
- Use demo workspace with known-good agents

### Risk 4: UI Glitch or Slow Response
**Likelihood**: Low
**Impact**: Low
**Mitigation**:
- Restart dashboard before demo
- Have second browser tab ready with dashboard
- Clear browser cache if needed

### Risk 5: Template Import Issues
**Likelihood**: Low (tested today)
**Impact**: Medium
**Mitigation**:
- Use pre-imported template in demo workspace
- Don't do live import during demo
- Show template library instead

---

## 📊 Time Budget

### Tonight (Train): 1-2 hours
- Blog review: 45-60 min
- Demo planning: 30-45 min

### Thursday: 7-10 hours
- Template testing: 2-3 hours
- @all investigation: 1-2 hours
- Demo practice: 2-3 hours
- **GitHub repo setup: 1-2 hours**
- Bug fixes: 1-2 hours

### Friday AM: 3-5 hours
- Final testing: 1-2 hours
- **Website deployment: 45-60 min**
- Demo setup: 30-60 min
- Docs cleanup: 30-60 min

### Friday PM: Demo + Wrap-up
- Demo: 15-30 min
- Feedback: 15-30 min
- Documentation: 30-60 min

**Total**: ~12-17 hours over 2.5 days

**Critical deliverables before demo**:
- ✅ Dashboard code on GitHub (Maximilien-ai/maxclaw)
- ✅ ClawMax.ai website live (Vercel + GoDaddy)
- ✅ Blog post published (Substack)
- ✅ Demo environment ready

---

## 📝 Notes

**Demo target audience**: TBD (team? investors? public?)
**Recording needed**: TBD (confirm with user)
**Blog publish timing**: Tonight or Friday AM before demo

**Key message for demo**:
> ClawMax makes managing 100 AI agents as easy as managing 10. Multi-workspace support, visual dashboard, workflow automation, and templates - all built on top of OpenClaw's solid foundation.

---

**Last updated**: March 11, 2026 (Evening)
**Next review**: Thursday AM before starting work
