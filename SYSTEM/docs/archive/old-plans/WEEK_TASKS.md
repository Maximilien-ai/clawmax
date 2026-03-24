# Week Tasks Until Friday Launch

**Today**: Monday, March 10, 2026
**Launch**: Friday, March 14, 2026 (5pm presentation)
**Days Remaining**: 4 days

---

## 🚨 CRITICAL BUGS (Must Fix or Document)

### Tuesday AM - Debug Session (2-3 hours)

1. **Completion Toast Bug** 🔴
   - Status: Still broken after first fix attempt
   - Need: More granular logging to see exact execution IDs
   - Next: Add detailed logging, compare execution IDs, check API response timing
   - Goal: Working toast OR documented root cause

2. **@all Group Messaging** 🔴 NEW
   - Status: Works but not reliably
   - Issue: Messages to @all in Status group sometimes don't reach all agents
   - Need: Log message routing, check agent availability, verify @all expansion
   - Goal: Reliable @all messaging OR workaround documented

3. **Typing Indicators** 🟡
   - Status: May have gotten worse (need to verify)
   - Check: Re-test in Communication view during workflow
   - Goal: Confirm if regression or same timing issue

**Deliverable**: All 3 bugs either fixed OR thoroughly documented with workarounds

---

## 🎯 TUESDAY (March 11) - THE KILLER DEMO

**Focus**: Complete working org from template in 30 seconds!

### Tasks (4-6 hours)

1. **Create QA Team Organization Template** (2-3 hours) - **PRIORITY 1**
   - Location: `TEMPLATES/organizations/qa-team/`
   - 3 agents with full config:
     - `qa-engineer`: IDENTITY.md, SOUL.md, TOOLS.md
     - `github-triager`: IDENTITY.md, SOUL.md, TOOLS.md
     - `release-coordinator`: IDENTITY.md, SOUL.md, TOOLS.md
   - 4 workflows:
     - PR Review: Automated code review reminders
     - Issue Triage: Daily issue classification
     - CI/CD Monitor: Build status tracking
     - Status Report to PM: Weekly progress summary
   - Community: "QA Team"
   - Groups: "QA", "Release"

2. **Test End-to-End** (1 hour)
   ```
   1. Import QA Team template with prefix "demo-qa-"
   2. Start agents (verify they come online)
   3. Run "Status Report to PM" workflow
   4. Watch execution complete
   5. Review agent responses
   6. TIME IT: Should be <60 seconds from import to results
   ```

3. **Create System AI Agents** (2-3 hours)
   - **ClawMax Assistant**: Helps create optimized workflows and agents
   - **Template Optimizer**: Analyzes and suggests improvements
   - **Organization Architect**: Recommends community/group structures
   - **Workflow Debugger**: Identifies common issues and suggests fixes
   - Add to "System" community
   - Give them appropriate skills and tools

4. **Test All Org Templates** (1 hour)
   - **Small Startup Team**: Import → Agents online → Run workflow → Verify
   - **Engineering Team**: Import → Agents online → Run workflow → Verify
   - **QA Team**: Import → Agents online → Run workflow → Verify
   - Document any issues

**Deliverable**: THE KILLER DEMO READY! Show complete org deployment in 30 seconds.

---

## 📸 WEDNESDAY (March 12) - Assets & Testing

**Focus**: Capture assets + comprehensive testing

### Tasks (4-5 hours)

1. **Capture Screenshots** (1-2 hours)
   - Dashboard home (agent cards, stats)
   - Workflow execution (live with participants)
   - Organization view (hierarchy)
   - Template library (all 3 types)
   - Execution detail (logs and responses)
   - System agents (meta-agents view)
   - Communication view (group chat)
   - Save to: `SYSTEM/docs/assets/`
   - Format: PNG, 1920x1080+

2. **Optional: Record Demo Video** (30-60 min)
   - 60-90 second walkthrough
   - Show: Dashboard → Trigger workflow → Watch execution → Results
   - Format: MP4, 1080p

3. **Comprehensive Test Pass** (2 hours)
   - Run `./test.sh` - verify 92 tests pass
   - Test all user flows:
     - Agent creation (manual + AI-assisted)
     - Workflow creation and execution
     - Template browsing and application
     - Organization template import/export
     - Communication view with groups
     - Execution detail with logs
   - Test edge cases:
     - Workflow with no agents
     - Import template with existing agent IDs
     - Archive/unarchive agents
   - Document any new issues

4. **Update Documentation** (1 hour)
   - Review TESTING_GUIDE.md
   - Update KNOWN_ISSUES.md with latest status
   - Add user-facing README if time permits

**Deliverable**: All assets captured, full test pass complete, docs updated

---

## 📦 THURSDAY (March 13) - Public Repo & Presentation

**Focus**: Public repo migration + presentation deck

### Tasks (5-6 hours)

1. **Prepare Public Repo** (2-3 hours) - **CRITICAL**
   - Repo: https://github.com/Maximilien-ai/clawmax (currently private)
   - Copy code from private maxclaw repo
   - Verify peg to OpenClaw at `/Users/maximilien/github/maximilien/openclaw`
   - Create clean README with:
     - Installation instructions
     - Prerequisites
     - Quick start guide
     - Link to documentation
   - Test clean clone:
     ```bash
     git clone https://github.com/Maximilien-ai/clawmax.git
     cd clawmax
     npm install
     npm run dev
     ```
   - Run all tests on clean clone
   - Verify dashboard starts and connects
   - Push to GitHub
   - **Make public Friday before 5pm talk**

2. **Create Presentation Deck** (2 hours)
   - Tool: Keynote, PowerPoint, or Google Slides
   - 10 slides (see PRESENTATION_OUTLINE.md):
     1. Title slide
     2. The Problem
     3. The Solution
     4. Live Demo - Dashboard
     5. Live Demo - THE KILLER DEMO (org template!)
     6. Templates
     7. System AI Agents
     8. Technical Highlights
     9. Roadmap
     10. Get Involved
   - Add screenshots from Wednesday
   - Create QR code to GitHub repo
   - Export to PDF

3. **Practice Demo** (1 hour)
   - Run through complete demo:
     - Dashboard overview (1 min)
     - **THE KILLER DEMO**: Import QA Team template (30 sec)
     - Trigger workflow (30 sec)
     - Watch execution (1 min)
   - Time the demo (target: 3-4 minutes)
   - Have backup screenshots ready
   - Verify all agents online

4. **Polish Blog Post** (1 hour)
   - Add screenshots to BLOG_POST_DRAFT.md
   - Proofread for typos
   - Verify all features mentioned work
   - Format for Substack

**Deliverable**: Public repo ready, presentation deck complete, blog polished

---

## 🚀 FRIDAY (March 14) - LAUNCH DAY!

**Focus**: Launch + 5pm presentation

### Morning (9am-11am) - 2 hours

1. **Final Checklist** (30 min)
   - Review blog one last time
   - Verify all features working
   - Test demo environment
   - Ensure 10+ agents online
   - Close unnecessary apps/tabs

2. **Git Tag & Commit** (15 min)
   - Review all changes
   - Commit: `git commit -m "feat: ClawMax v1.0.0 release"`
   - Tag: `git tag -a v1.0.0 -m "ClawMax v1.0.0: Multiagent orchestration dashboard"`
   - **Don't push yet** - wait for blog

3. **Prepare Demo Environment** (15 min)
   - Start dashboard
   - Verify agents online
   - Open presentation deck
   - Test screen sharing if remote

4. **Make Repo Public** (15 min)
   - Go to https://github.com/Maximilien-ai/clawmax
   - Settings → Danger Zone → Make Public
   - Verify public access works
   - Update blog with correct public URL

### Afternoon (2pm-5pm) - 3 hours

5. **Publish Blog** (15 min)
   - Publish to Substack: https://maximilien.substack.com
   - Cross-post to Medium (optional)
   - **Blog live!**

6. **Push to GitHub** (10 min)
   - `git push origin main`
   - `git push --tags`
   - Create GitHub release with changelog
   - Verify v1.0.0 tag is visible

7. **Pre-Presentation Buffer** (1-2 hours)
   - Final practice run
   - Relax, have coffee
   - Review talking points

8. **Give Presentation** (5pm - 15-20 min) 🎉
   - 10-15 minute presentation
   - **THE KILLER DEMO** (import org in 30 seconds!)
   - Q&A
   - **v1.0.0 LAUNCHED!**

9. **Announce** (15 min)
   - Twitter/X post with blog link
   - LinkedIn post
   - GitHub Discussions
   - Email mailing list

**Deliverable**: v1.0.0 LAUNCHED AND PRESENTED! 🎉

---

## ⏱️ Time Budget Summary

| Day | Duration | Focus | Key Deliverable |
|-----|----------|-------|-----------------|
| **Tue AM** | 2-3h | Debug 3 bugs | Bugs fixed or documented |
| **Tue PM** | 4-6h | Killer demo | QA template + system agents |
| **Wed** | 4-5h | Assets + testing | Screenshots + test pass |
| **Thu** | 5-6h | Repo + presentation | Public repo + deck |
| **Fri** | 3-4h | Launch | v1.0.0 shipped! |
| **TOTAL** | **18-24h** | - | - |

---

## 🎯 Critical Path

```
Tue AM ──► Debug bugs (toast, @all, typing indicators)
              │
Tue PM ──► Create QA Team template (THE KILLER DEMO)
              │
Wed ───► Capture screenshots + comprehensive testing
              │
Thu ───► Public repo + presentation deck
              │
Fri ───► LAUNCH v1.0.0 + 5pm presentation! 🚀
```

---

## ⚠️ Risk Mitigation

### If bugs not fixed by Tuesday:
- Document thoroughly in KNOWN_ISSUES.md
- Add to "Known Limitations" section in presentation
- Plan v1.0.1 for next week

### If killer demo not perfect:
- Have Small Startup Team template as backup
- Use screenshots if live demo fails
- Emphasize what DOES work

### If screenshots not captured:
- Use simple diagrams
- Focus on live demo
- Add to blog post later

### If presentation not polished:
- Keep it simple (5 slides minimum)
- Rely on THE KILLER DEMO
- Enthusiasm > polish

---

## ✅ Success Criteria for v1.0.0

### Must Have
- [ ] THE KILLER DEMO works (import org → agents online → run workflow → see results in <60s)
- [ ] Blog post published with screenshots
- [ ] Presentation delivered at 5pm Friday
- [ ] Git tagged v1.0.0 and repo public
- [ ] Critical bugs either fixed OR documented

### Nice to Have
- [ ] System AI agents functional
- [ ] Demo video recorded
- [ ] All 92 tests passing
- [ ] Completion toast working
- [ ] @all messaging reliable

---

## 📞 Daily Check-ins

- **Tuesday EOD**: Killer demo status + bug resolution
- **Wednesday EOD**: Asset review + test results
- **Thursday EOD**: Presentation deck review
- **Friday 9am**: Final launch checklist
- **Friday 5pm**: PRESENTATION! 🎉

---

**Current Focus**: Rest tonight, review docs, leave notes. Tomorrow AM: debug session, then THE KILLER DEMO!

🚀 **Let's ship v1.0.0!**
