# Weekend Execution Plan - March 8-9, 2026

**Goal**: Get multiagent workflows working reliably for demos
**Timeline**: 2 days (Saturday-Sunday)
**Success Criteria**: 3-5 agents executing workflows consistently

---

## ✅ NOTEs Addressed

All documentation NOTEs have been resolved:

1. ✅ **Tag-based targeting** - Explained in templates/README.md
2. ✅ **Skills extensibility** - Documented in CLAWMAX_FEATURES.md
3. ✅ **Day 2 operations** - Added to roadmap section
4. ✅ **Multi-channel status** - WhatsApp current, others in roadmap
5. ✅ **Use case priorities** - Listed for next week
6. ✅ **Gateway auto-start** - Explained manual approach + roadmap
7. ✅ **Security/limitations** - Added to blog outline
8. ✅ **Demo workspace goals** - Clarified in DEMO_PREP.md

---

## 🎯 Priority 1: Multiagent Workflows (MUST HAVE)

**Objective**: Get 3-5 agents executing workflows reliably

### Saturday Morning (3-4 hours)

**1. Verify Current Setup** (30 min)
```bash
# You are using a SHARED gateway for all agents
# This is configured in ~/.openclaw/openclaw.json
# Port: 18889

# Check if shared gateway is running
lsof -ti:18889
# If not running, start it with:
# openclaw gateway run

# Check gateway config
cat ~/.openclaw/openclaw.json | grep -A 5 gateway
# Should show gateway.port: 18889 and gateway.auth.token
```

**2. Test Status Check Workflow** (1 hour)
```bash
# Gateway should already be running (check with: lsof -ti:18889)
# If not running, start it:
# openclaw gateway run &

# Start dashboard (if not already running)
cd ~/.openclaw/workspace/SYSTEM/dashboard
npm run dev

# Test workflow
1. Open http://localhost:5173
2. Navigate to Workflows
3. Click "Status Check"
4. Click "Trigger Workflow"
5. Watch execution (should see 3 agents: agent0, engineer, max0)
6. Verify all 3 complete successfully
7. Check execution logs
```

**Expected Issues & Fixes**:
- Gateway not found → Check shared gateway is running (lsof -ti:18889)
- Timeout → Increase timeout in workflow-cli.ts if needed (currently 2 min)
- Connection refused → Restart gateway with: openclaw gateway run
- No participants → Verify agents are in "Status" group (check GROUPS.md)

**3. Create Daily Standup with Tags** (1.5 hours)

Update daily-standup template to use tag targeting:

```yaml
---
id: daily-standup-eng
name: Engineering Daily Standup
description: Morning sync for engineering team
schedule: ""
enabled: false
targeting:
  communities: []
  groups: []
  tags:
    - engineer
  agents: []
executionMode: manual
---

# Daily Standup

Please provide your standup update:

**Yesterday**: What did you accomplish?
**Today**: What are your priorities?
**Blockers**: Any blockers or dependencies?

Keep it brief (2-3 sentences per section).
```

**Test**:
1. Copy template to active workflow
2. Ensure agents have "engineer" tag in IDENTITY.md
3. Trigger workflow
4. Verify all engineers participate

**4. Document What Works** (30 min)

Create `WORKFLOWS/WORKING_SETUPS.md`:
- Which agents work reliably
- Which workflows execute successfully
- Any quirks or workarounds needed
- Screenshots of successful executions

### Saturday Afternoon (2-3 hours)

**5. Add 2 More Agents to Test Pool** (1 hour)

Target agents:
- `ceo` (manager tag)
- `product-manager` (product-manager tag)

Ensure they have:
- Gateway configured in openclaw.json
- Proper tags in IDENTITY.md
- Can start gateway successfully

**6. Create Manager Status Workflow** (1 hour)

```yaml
---
id: manager-status
name: Manager Status Check
description: Quick status from management team
schedule: ""
enabled: false
targeting:
  communities: []
  groups: []
  tags:
    - manager
    - product-manager
    - ceo
  agents: []
executionMode: manual
---

# Manager Status

Quick status update:

**Team Health**: How is your team doing?
**Top Priorities**: What's most important this week?
**Escalations**: Anything leadership needs to know?
```

**7. Run Multi-Workflow Test** (1 hour)

Execute all 3 workflows back-to-back:
1. Status Check (agent0, engineer, max0)
2. Daily Standup (all engineers)
3. Manager Status (ceo, product-manager, managers)

**Success = All workflows complete without errors**

---

### Sunday Morning (2-3 hours)

**8. Record Demo Video** (1 hour)

**Script**:
1. Show dashboard with agents (some online, some offline)
2. Navigate to Workflows
3. Show templates library
4. Trigger Status Check workflow
5. Watch real-time execution
6. Show execution results
7. Trigger Daily Standup for engineers
8. Show execution logs
9. Explain tag-based targeting

**Recording**:
- 5-7 minutes total
- Clear narration
- Show real execution, not mocked
- Highlight key features

**9. Write Blog Post First Draft** (2 hours)

Use BLOG_POST_OUTLINE.md as template:
- 1500-2000 words
- Focus on architecture and features
- Include real examples from your working workflows
- Embed demo video
- Add screenshots

**10. Test Failure Scenarios** (30 min)

Deliberately break things to understand failure modes:
- Kill agent gateway mid-execution
- Trigger workflow with no agents online
- Send invalid workflow content
- Test timeout behavior

Document how ClawMax handles failures.

---

### Sunday Afternoon (2-3 hours)

**11. Create Quick Start Guide** (30 min)

Create `SYSTEM/dashboard/QUICKSTART.md`:
```markdown
# ClawMax Dashboard - Quick Start

## Prerequisites
1. Shared gateway running: `lsof -ti:18889` (should return PID)
2. If not running: `openclaw gateway run &`

## Start Dashboard
```bash
cd ~/.openclaw/workspace/SYSTEM/dashboard
npm run dev
```

## First Workflow Test
1. Open http://localhost:5173
2. Go to Workflows → "Status Check"
3. Click "Trigger Workflow"
4. Watch execution in real-time
5. Review results in execution history

## Troubleshooting
- Gateway not found: Check `openclaw.json` has gateway config
- No participants: Verify agents in correct group
- Timeout: Restart gateway and try again
```

**12. Polish Documentation** (1 hour)

- Review blog post draft
- Add any missing screenshots
- Update DEMO_CHECKLIST.md with what works
- Add troubleshooting section

**13. Final End-to-End Test** (1 hour)

Fresh start simulation:
1. Kill all processes
2. Run `scripts/start-test-agents.sh`
3. Start dashboard
4. Execute all 3 workflows
5. Verify everything works
6. Screenshot results for demos

---

## 🎁 Bonus: Template Workspace (If Time Permits)

**QA Organization Template** (3-4 hours if time allows)

`WORKFLOWS/templates/workspace-qa-org.md`:

Structure:
- 3 QA agents (qa1, qa2, qa3)
- 2 communities (QA Team, Engineering Team)
- 3 groups (Test Planning, Bug Triage, Release Testing)
- 3 workflows (Daily QA Standup, Bug Review, Release Checklist)

This is **stretch goal** - only if workflows are solid.

---

## 📊 Success Metrics

By end of weekend, you should have:

✅ **Working Workflows**:
- Status Check (3 agents)
- Daily Standup (engineers)
- Manager Status (leadership)

✅ **Reliable Execution**:
- 80%+ success rate
- Failures are understood and documented
- Can reproduce success reliably

✅ **Demo Assets**:
- 5-7 minute demo video
- Blog post first draft (1500+ words)
- Screenshots of successful executions
- Helper scripts for quick setup

✅ **Documentation**:
- WORKING_SETUPS.md with what works
- Troubleshooting guide
- Failure mode documentation

---

## 🚀 Monday Priorities (For Next Week)

Based on working weekend setup, tackle complex use cases:

### Priority 1: Code Review Reminder (GitHub Integration)
- Use GitHub skill
- Check open PRs via GitHub API
- Remind engineers to review
- Track which PRs need attention

### Priority 2: Sprint Planning Workflow
- Managed workflow (requires approval)
- Collect input from engineers and product
- Generate planning document
- Demonstrate collaboration

### Priority 3: Security Audit Workflow
- Monthly security check
- Scan for vulnerabilities
- Generate prioritized action items
- Demonstrate compliance use case

**Time estimate**: 1 full day per use case

---

## 🔧 Troubleshooting Guide

### Agent Won't Execute Workflow

**Symptoms**: Agent shows "pending" forever

**Checks**:
1. Is gateway running? `lsof -ti:PORT`
2. Is agent in target group/community/tags?
3. Check workflow targeting in YAML frontmatter
4. Check openclaw.json has gateway config

**Fix**:
- Restart gateway
- Verify targeting rules
- Check execution logs for errors

### Workflow Times Out

**Symptoms**: Agent marked "failed" with timeout error

**Checks**:
1. Is agent actually processing? (check agent logs)
2. Is workflow too complex?
3. Is network slow?

**Fix**:
- Increase timeout in workflow-cli.ts (currently 2 min)
- Simplify workflow content
- Check agent performance

### Dashboard Shows Wrong Status

**Symptoms**: Agent shows online but isn't

**Checks**:
1. Dashboard cache (5 second TTL)
2. Port detection vs actual gateway

**Fix**:
- Refresh dashboard
- Restart gateway
- Check port conflicts

---

## 📝 What to Track This Weekend

Keep notes on:
1. Which agents work most reliably
2. Average workflow execution time
3. Common failure modes
4. Workarounds needed
5. Ideas for improvement

These insights will guide Monday's complex use case work.

---

## ✅ Done Criteria

Sunday evening, you can say "DONE" when:

1. ✅ You can run 3 workflows successfully in a row
2. ✅ You have a 5-min demo video showing real execution
3. ✅ Blog post draft is written (doesn't have to be perfect)
4. ✅ You understand what works and what doesn't
5. ✅ You're confident demoing workflows next week

---

**Let's Go! 🚀**

Start with Priority 1 (Multiagent Workflows) Saturday morning. That's the foundation for everything else.

The bonus template workspace is nice-to-have but NOT required for demo success. Focus on getting workflows working first.

**Questions? Check DEMO_CHECKLIST.md or reach out!**
