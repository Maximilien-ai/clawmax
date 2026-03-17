# Two-Week Sprint: ClawMax Self-Management
**March 17-28, 2026**

## 🎯 Mission: ClawMax Managing ClawMax

**The Vision**: Deploy ClawMax on Mac Mini with agent teams that build, test, review, and release ClawMax itself. Live demo next week showing agents autonomously managing development.

**Key Demos**:
- **Thursday Mar 27**: Presentation showing ClawMax self-management
- **Friday Mar 28**: Hackathon demo with live agent workflows

---

## ✅ Week 1: Foundation (Mar 17-21)

### Critical Path: Get ClawMax Self-Managing

**Goal**: By end of Week 1, have agents actively managing ClawMax repo on Mac Mini

---

### Monday (8h): OpenClaw Compatibility + CI/CD Foundation

**Morning (4h): OpenClaw Version Support**
- ✅ Document current setup: OpenClaw bleeding edge (your fork)
- Create version detection utility
  ```typescript
  // SYSTEM/dashboard/server/lib/openclaw-version.ts
  export async function getOpenClawVersion(): Promise<{
    installed: string,    // from `openclaw --version`
    gitCommit?: string,   // if installed from git
    recommended: string   // latest official release
  }>
  ```
- Add version check on dashboard startup (log warning if mismatch)
- Update README.md with tested versions section

**Afternoon (4h): Basic CI/CD**
- Create `.github/workflows/test.yml`
  ```yaml
  name: Tests
  on: [push, pull_request]
  jobs:
    test:
      runs-on: ubuntu-latest
      strategy:
        matrix:
          openclaw-version:
            - 'latest'     # Latest official npm release
            - 'bleeding'   # Main branch HEAD
      steps:
        - Checkout ClawMax
        - Setup Node.js
        - Install OpenClaw (${{ matrix.openclaw-version }})
        - npm install
        - Run test suite (95 tests)
        - Report results
  ```
- Test locally with `act` or push to GitHub
- Ensure all 95 tests pass

**Deliverable**: CI running on every PR, testing against 2 OpenClaw versions

---

### Tuesday (8h): Skills Sync + Agent Templates (Iteration Focus)

**IMPORTANT**: Build templates iteratively - create, test, refine, repeat

**Morning (4h): Skills Catalog Sync**
- Add "Sync Skills" button to Skills page
- Implement sync logic:
  ```typescript
  // server/lib/skills.ts
  async function syncOpenClawSkills() {
    // 1. Detect OpenClaw installation (which openclaw)
    // 2. Read from src/skills/builtin or fetch from GitHub
    // 3. Merge with existing custom skills
    // 4. Handle conflicts: offer to rename custom skills
    // 5. Update skills cache
  }
  ```
- UI: Show last sync timestamp
- Handle conflicts: Modal asking user to rename conflicting custom skill

**Afternoon (4h): Core Agent Templates (Iterative Approach)**

**Process**: Create → Test → Refine → Template
- Don't create all templates at once
- Create one agent, test it thoroughly
- Refine based on real behavior
- Then template it
- Repeat for next agent

Create essential templates for ClawMax development:

1. **qa-engineer** (Quality Assurance)
   ```markdown
   # IDENTITY.md
   Name: qa-engineer
   Role: Quality Assurance Engineer
   Responsibilities:
   - Review pull requests for code quality
   - Run test suites and report failures
   - Verify dark mode styling
   - Check TypeScript types
   - Test on multiple browsers

   # TOOLS.md
   - github (read/write issues, PRs)
   - bash (run tests)
   - read/write files

   # SOUL.md
   You are meticulous and detail-oriented.
   You never let bugs slip through.
   You write clear, actionable feedback.
   ```

2. **release-engineer** (Release Management)
   ```markdown
   # IDENTITY.md
   Name: release-engineer
   Role: Release Engineering
   Responsibilities:
   - Merge approved PRs
   - Create version tags
   - Generate release notes
   - Publish to npm (future)
   - Update CHANGELOG.md

   # TOOLS.md
   - github (merge, tag, release)
   - bash (git commands)
   - read/write files
   ```

3. **github-triage** (Issue Triage)
   ```markdown
   # IDENTITY.md
   Name: github-triage
   Role: GitHub Issue & PR Triage
   Responsibilities:
   - Monitor new issues and PRs
   - Label issues (bug, feature, docs, etc.)
   - Assign to appropriate engineer
   - Request missing information
   - Close duplicates

   # TOOLS.md
   - github (issues, PRs, labels)
   ```

**Deliverable**: Skills sync working, 3 agent templates ready

---

### Wednesday (8h): GitHub Workflows + Cron Testing

**Goal**: Create workflows AND test cron automation (CRITICAL)

**Morning (4h): Core Workflows**

1. **daily-github-triage.md**
   ```markdown
   ---
   name: daily-github-triage
   description: Monitor and triage GitHub issues and PRs
   schedule: "0 9 * * *"  # 9am daily
   community: ClawMax Development
   groups:
     - Engineering
   tags:
     - github-triage
   ---

   # Daily GitHub Triage

   ## Objective
   Keep the ClawMax repository organized and responsive

   ## Tasks
   1. Check new issues (created in last 24h)
      - Add labels (bug/feature/docs/question)
      - Assign if obvious owner
      - Request clarification if unclear

   2. Check new PRs
      - Verify tests pass
      - Request qa-engineer review
      - Label as ready-for-review

   3. Check stale issues (no activity 14+ days)
      - Comment asking for update
      - Close if no response in 7 days

   ## Output
   - Comment on each new issue/PR
   - Post summary to #engineering channel
   ```

2. **pr-review.md**
   ```markdown
   ---
   name: pr-review
   description: Review pull requests for code quality
   schedule: manual  # Triggered when PR labeled "ready-for-review"
   tags:
     - qa-engineer
   ---

   # Pull Request Review

   ## Tasks
   1. Checkout PR branch
   2. Run test suite: `./SYSTEM/test.sh`
   3. Check for:
      - TypeScript errors
      - Dark mode styling
      - Test coverage
      - Breaking changes
   4. Test manually:
      - Agent creation
      - Skills assignment
      - Workflow execution
      - Chat functionality
   5. Provide feedback or approve

   ## Output
   - GitHub review comment (approve/request changes)
   - Test results summary
   ```

3. **release-prep.md**
   ```markdown
   ---
   name: release-prep
   description: Prepare and create new release
   schedule: manual  # Triggered when ready to release
   tags:
     - release-engineer
   ---

   # Release Preparation

   ## Tasks
   1. Review merged PRs since last release
   2. Update CHANGELOG.md
   3. Bump version in package.json
   4. Create git tag (e.g., v1.2.0)
   5. Generate release notes
   6. Push tag to trigger release workflow
   7. Monitor CI/CD for release build

   ## Output
   - Updated CHANGELOG.md
   - New version tag
   - GitHub release created
   ```

**Afternoon (4h): Cron Automation Testing ⚠️ CRITICAL**

**IMPORTANT**: We've never tested automated cron execution - only manual triggers!

1. **Test Cron Scheduling** (2h)
   - Create test workflow with schedule: `*/5 * * * *` (every 5 min)
   - Enable the workflow
   - Verify OpenClaw cron daemon picks it up
   - Watch for automatic execution
   - Check execution logs
   - Confirm agents respond automatically

2. **Test Managed Workflows** (1h)
   - Create workflow that requires approval
   - Assign managing agent (e.g., release-engineer)
   - Test managing agent can trigger workflow
   - Verify workflow executes for target agents

3. **Workflow Execution Integration** (1h)
   - Update execution to use agent's github skill
   - Test manual trigger of each workflow
   - Verify agents can interact with GitHub

**CRITICAL SUCCESS CRITERIA**:
- ✅ Cron workflows execute automatically (without manual trigger)
- ✅ Managed workflows work (agent triggers workflow for other agents)
- ✅ Both modes work reliably

**Deliverable**: 3 workflows ready, cron + managed execution verified

---

### Thursday (8h): Mac Mini Setup + Agent Deployment

**Morning (4h): Mac Mini Environment**

1. **Install ClawMax on Mac Mini**
   ```bash
   # On Mac Mini
   git clone https://github.com/Maximilien-ai/clawmax-private.git
   cd clawmax-private
   npm install
   ./SYSTEM/start.sh
   ```

2. **Create ClawMax Development Workspace**
   - Workspace name: "ClawMax Development"
   - Import Small Startup template as base
   - Replace generic agents with our templates

3. **Provision Agent Team**
   ```bash
   # Via Dashboard UI:
   # 1. Create qa-engineer (from template)
   # 2. Create release-engineer (from template)
   # 3. Create github-triage (from template)
   # 4. Assign github skill to all
   # 5. Configure GitHub PAT in each agent's config
   ```

**Afternoon (4h): GitHub Integration Setup**

1. **Create GitHub Personal Access Token**
   - Scopes: repo, issues, pull_requests
   - Store in each agent's openclaw.json

2. **Test GitHub Access**
   - github-triage: List recent issues
   - qa-engineer: Get PR diff
   - release-engineer: Create test tag (delete after)

3. **Configure WhatsApp Notifications**
   - Link agents to WhatsApp (optional for demos)
   - Test sending workflow results to WhatsApp

**Deliverable**: Agent team running on Mac Mini, GitHub access working

---

### Friday (8h): Testing + Polish

**Morning (4h): End-to-End Testing**

1. **Test Full Workflow Cycle**
   - Create test PR in ClawMax repo
   - Trigger daily-github-triage workflow
   - Verify github-triage labels it
   - Trigger pr-review workflow
   - Verify qa-engineer reviews it
   - Manually approve
   - Trigger release-prep workflow (test mode)

2. **Performance Testing**
   - Measure workflow execution time
   - Test with multiple concurrent workflows
   - Verify agent responses in reasonable time

**Afternoon (4h): Documentation + Demo Prep**

1. **Update Documentation**
   - README.md: Add "ClawMax Managing ClawMax" section
   - Create DEMO.md with talking points
   - Screenshot agent workflows in action

2. **Create Demo Script**
   ```markdown
   # ClawMax Self-Management Demo

   ## Setup (before demo)
   - Mac Mini running ClawMax dashboard
   - 3 agents online (qa-engineer, release-engineer, github-triage)
   - ClawMax repo open in browser

   ## Demo Flow (5 minutes)
   1. Show Dashboard (30s)
      - 3 agents online with skills
      - Workflows tab with 3 workflows
      - Activity feed showing recent agent actions

   2. Trigger GitHub Triage (1min)
      - Click "Run" on daily-github-triage workflow
      - Show real-time execution
      - Agent comments on recent issues

   3. Create Test PR (2min)
      - Push simple change to test branch
      - Create PR
      - Show github-triage automatically labels it
      - Trigger pr-review workflow
      - qa-engineer reviews code, runs tests, comments

   4. Show Agent Chat (1min)
      - Chat with qa-engineer: "What tests are failing?"
      - Get intelligent response about test status

   5. Future Vision (30s)
      - Explain autonomous release cycle
      - Show roadmap for full CI/CD
   ```

**Deliverable**: Demo-ready ClawMax installation, documentation complete

---

## ✅ Week 2: Scale & Polish (Mar 24-28)

### Monday (8h): Additional Templates + Weave CLI

**Morning (4h): More Agent Templates**

1. **docs-engineer** (Documentation)
   - Reviews docs for clarity
   - Updates README.md
   - Maintains CHANGELOG.md
   - Writes user guides

2. **security-engineer** (Security)
   - Scans for vulnerabilities
   - Reviews security-related PRs
   - Updates dependencies
   - Monitors CVEs

3. **performance-engineer** (Performance)
   - Tracks response times
   - Identifies bottlenecks
   - Runs benchmarks
   - Suggests optimizations

**Afternoon (4h): Weave CLI Setup**

Apply same pattern to weave-cli project:
- Create weave-cli workspace
- Import agent templates
- Create weave-cli specific workflows
- Test on Mac Mini

**Deliverable**: 3 more templates, weave-cli agents running

---

### Tuesday (8h): Advanced Workflows

**Morning (4h): Automated PR Merge**

Create workflow for autonomous PR merging:
```markdown
---
name: auto-merge-approved
description: Merge approved PRs automatically
schedule: "0 */2 * * *"  # Every 2 hours
tags:
  - release-engineer
---

# Auto-Merge Approved PRs

## Conditions
- PR has "approved" review
- All tests passing
- No merge conflicts
- Not labeled "do-not-merge"

## Tasks
1. List approved PRs
2. For each PR:
   - Verify conditions met
   - Merge using squash
   - Delete branch
   - Comment with merge confirmation
3. Post summary to #engineering
```

**Afternoon (4h): Monitoring & Alerting**

Create workflow for system health:
```markdown
---
name: system-health-check
description: Monitor ClawMax health and alert on issues
schedule: "*/30 * * * *"  # Every 30 minutes
tags:
  - ops
---

# System Health Check

## Tasks
1. Check dashboard status
2. Verify all agents online
3. Check test suite status
4. Monitor error logs
5. Alert if issues detected
```

**Deliverable**: Auto-merge working, health monitoring active

---

### Wednesday (8h): Organization Templates

**Full Day: Create Production Templates**

Package complete setups for different use cases:

1. **Software Development Team**
   - qa-engineer
   - release-engineer
   - docs-engineer
   - github-triage
   - Workflows: daily-triage, pr-review, release-prep
   - Community: Engineering

2. **Startup Operations**
   - ceo (strategic)
   - ops (operational)
   - support (customer)
   - marketing (growth)
   - Workflows: daily-standup, weekly-planning
   - Community: Leadership

3. **Open Source Project**
   - maintainer
   - contributor
   - community-manager
   - security
   - Workflows: issue-triage, contribution-review
   - Community: Contributors

**Export as Templates**:
- Save to `WORKSPACES/default/TEMPLATES/`
- Test import on fresh workspace
- Document in README.md

**Deliverable**: 3 production-ready templates

---

### Thursday (8h): Demo Day Prep

**THE BIG DAY**: Presentation

**Morning (4h): Final Polish**
- Test all demo flows
- Prepare backup scenarios
- Create presentation slides
- Record backup demo video (in case live fails)

**Afternoon (4h): Presentation Delivery**
- Show ClawMax dashboard
- Live demo of agent workflows
- Q&A about architecture
- Share roadmap

**Key Talking Points**:
1. "ClawMax is managing its own development"
2. "3 agents reviewing PRs, triaging issues, preparing releases"
3. "Fully autonomous - they work while we sleep"
4. "Same pattern applies to any project"
5. "Templates let you deploy agent teams in minutes"

---

### Friday (8h): Hackathon Demo

**Morning (4h): Hackathon Improvements**

Based on feedback from Thursday:
- Add requested features
- Fix any bugs found
- Improve UI/UX
- Polish rough edges

**Afternoon (4h): Hackathon Presentation**
- Show latest improvements
- Live coding session
- Help others deploy ClawMax
- Gather feedback for future work

---

## 📊 Success Metrics

By end of 2 weeks:

### Technical
- ✅ CI/CD running on every commit
- ✅ Tests passing against 2 OpenClaw versions
- ✅ Skills sync working
- ✅ 6+ agent templates
- ✅ 5+ workflows for ClawMax management
- ✅ Mac Mini running agent team 24/7

### Demo
- ✅ Live demo of agents managing ClawMax
- ✅ Autonomous PR review working
- ✅ GitHub integration functional
- ✅ Agent chat responsive
- ✅ Clean, professional UI

### Documentation
- ✅ README.md updated
- ✅ DEMO.md with talking points
- ✅ Template documentation
- ✅ Setup guide for Mac Mini

### Templates
- ✅ 3 organization templates ready
- ✅ Tested and working
- ✅ Exportable/importable

---

## 🎯 The Killer Demo Flow

**Total Time: 7 minutes**

1. **Opening** (1min)
   - "ClawMax is an AI agent management platform"
   - "Today I'm showing ClawMax managing its own development"
   - "3 agents working as a development team"

2. **Dashboard Tour** (1min)
   - Show agents online
   - Show workflows configured
   - Show activity feed (real agent actions)

3. **Live GitHub Triage** (2min)
   - Trigger daily-github-triage workflow
   - Show agent scanning issues
   - Watch it label and comment
   - Show before/after of GitHub issues

4. **PR Review Demo** (2min)
   - Create test PR (prepared beforehand)
   - Trigger pr-review workflow
   - Watch qa-engineer:
     - Check out code
     - Run tests
     - Review changes
     - Post review comment

5. **Agent Chat** (1min)
   - Chat with qa-engineer
   - Ask: "What's the status of PR #123?"
   - Get intelligent, contextual response

6. **Vision & Roadmap** (30s)
   - Explain autonomous release cycle
   - Show templates for other projects
   - Mention weave-cli deployment
   - Open for questions

---

## 🚧 Risks & Mitigation

### Risk 1: OpenClaw Breaking Changes
**Mitigation**:
- Test against both latest and bleeding edge
- Have rollback plan to pinned version
- Document exact working version

### Risk 2: GitHub API Rate Limits
**Mitigation**:
- Use authenticated requests (higher limits)
- Cache responses
- Implement retry logic
- Test with realistic load

### Risk 3: Agent Response Time
**Mitigation**:
- Use gpt-4o (fast) not codex (slow)
- Pre-warm agents before demo
- Have backup responses prepared
- Show "thinking" indicators

### Risk 4: Network Issues During Demo
**Mitigation**:
- Record backup video
- Test on venue WiFi beforehand
- Have mobile hotspot ready
- Prepare offline slides

### Risk 5: Mac Mini Availability
**Mitigation**:
- Set up week 1, test all week 2
- Have local backup on laptop
- Document setup for quick recovery
- Run stability tests

---

## 📝 Daily Checklist Template

Each day:
- [ ] Check agent status (all online?)
- [ ] Review workflow executions
- [ ] Monitor GitHub for new issues/PRs
- [ ] Test chat functionality
- [ ] Check logs for errors
- [ ] Update STATUS.md
- [ ] Commit & push changes

---

## 🎓 Learning Outcomes

By end of sprint:
1. Proven ClawMax can manage real development
2. Template pattern validated
3. Workflow system battle-tested
4. GitHub integration robust
5. Demo-ready platform
6. Clear roadmap for v2.0

---

## 🚀 Post-Sprint (Week 3+)

### Immediate (Week 3)
- Incorporate feedback from presentations
- Add requested features
- Fix reported bugs
- Publish templates to public repo

### Short-term (Month 2)
- Add more integrations (Slack, Discord, Linear)
- Performance monitoring dashboard
- Advanced scheduling (dependencies, retries)
- Multi-workspace management UI

### Long-term (Q2 2026)
- SaaS offering (hosted ClawMax)
- Marketplace for templates
- Agent analytics & insights
- Mobile app for monitoring

---

**Status**: Planning - Ready to Execute
**Owner**: Max + Claude Code
**Timeline**: March 17-28, 2026
**Success Criteria**: Live demo of ClawMax managing itself autonomously
