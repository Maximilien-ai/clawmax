# ClawMax Dashboard - Demo Preparation Guide

**Target Date**: Thursday & Friday (March 13-14, 2026)
**Audience**: Potential clients
**Duration**: 15-30 minutes per demo
**Prepared**: March 6, 2026

---

## Pre-Demo Checklist (Tonight/Tomorrow)

### ✅ System Health
- [ ] Dashboard starts without errors (`npm run dev`)
- [ ] All agents show correct online/offline status
- [ ] At least 2-3 agents with gateways running for live demos
- [ ] No console errors in browser
- [ ] API endpoints responding correctly

### ✅ Content Preparation
- [ ] Review CLAWMAX_FEATURES.md (comprehensive feature doc)
- [ ] Review this DEMO_PREP.md (demo flow and talking points)
- [ ] Review workflow templates in `WORKFLOWS/templates/`
- [ ] Practice demo flow (run through once)

### ✅ Demo Data
- [ ] At least 10+ agents visible
- [ ] 3-4 communities configured
- [ ] 5+ groups configured
- [ ] 2-3 workflows (at least one enabled)
- [ ] Clean execution history (old test runs removed ✅)
- [ ] Workflow templates available

### ✅ Technical Setup
- [ ] Dashboard accessible at `http://localhost:5173`
- [ ] Screen recording software ready (for creating demo videos)
- [ ] Browser window clean (close unnecessary tabs)
- [ ] Terminal ready for live CLI demonstrations
- [ ] Backup plan if demo breaks (screenshots/video)

---

## Demo Flow (15-minute Version)

### 1. Opening (1 minute)
**Hook**: "What if your entire team was AI agents that work 24/7, coordinate automatically, and never miss a deadline?"

**Intro**:
- ClawMax Dashboard manages multiple OpenClaw AI agents as a cohesive team
- Think: GitHub for AI agents, Slack for agent communication, Jira for agent workflows
- Already managing [X] agents across [Y] communities

### 2. Dashboard Overview (2 minutes)
**Navigate to Home**

**Show**:
- Total agent count
- Communities and groups overview
- Activity timeline (recent file modifications)
- Organization name and version

**Talking Points**:
- "This is our agent ecosystem at a glance"
- "Real-time visibility into what every agent is doing"
- "Like a mission control center for AI"

### 3. Agent Management (3 minutes)
**Navigate to Agents**

**Show**:
- Agent cards with status indicators
- Filter by online/offline
- Filter by communities, groups, tags
- Click into an agent to show details

**Talking Points**:
- "Each agent has its own identity, skills, and responsibilities"
- "Green means actively running, yellow means offline but recent activity"
- "Agents can belong to multiple communities and groups"
- "Skills like GitHub, Slack, 1Password are assigned per agent"

**Demo**:
- Filter by "Engineering Team" community
- Show an agent's IDENTITY.md, skills, recent activity
- Show TODOs and completed tasks

### 4. Organization Structure (3 minutes)
**Navigate to Organizations**

**Show**:
- Communities (Engineering, Product, Customer Success)
- Groups within communities
- Agent assignments
- Workflow associations

**Talking Points**:
- "Communities are like departments: Engineering, Product, Customer Success"
- "Groups are cross-functional teams: daily standup, project teams, onboarding"
- "Flexible membership - agents can be in multiple groups"
- "This structure drives workflow targeting"

**Demo**:
- Expand "Engineering Team" to show member agents
- Show workflow associations
- Click into a group to see members

### 5. Workflow Automation (5 minutes) ⭐ **KEY FEATURE**
**Navigate to Workflows**

**Show**:
- List of workflows with schedules
- Create new workflow button
- Templates available
- Execution history

**Talking Points**:
- "This is where the magic happens - coordinating multiple agents"
- "Workflows can be scheduled (daily standup) or manual (release prep)"
- "Target by community, group, tags, or specific agents"
- "Real-time execution tracking shows each agent's progress"

**Demo**:
- Show "Daily Standup" workflow
  - Click to view details
  - Show YAML frontmatter (targeting, schedule)
  - Show markdown content (instructions)
- Click "Templates" to show library
  - Scroll through 8 pre-built templates
  - Open "Sprint Planning" or "Security Audit"
- Show execution history
  - Open a past execution
  - Show participant list with status
  - Show logs

**Optional Live Demo** (if time and agents ready):
- Trigger a simple workflow
- Watch execution progress in real-time
- Show agent response

### 6. Communication Integration (1 minute)
**Navigate to Communication**

**Show**:
- WhatsApp, Slack, Discord tabs
- Agent associations with communication platforms
- Multi-channel support

**Talking Points**:
- "Agents aren't isolated - they integrate with your existing communication tools"
- "WhatsApp for mobile, Slack for teams, Discord for communities"
- "Agents can participate in group chats, respond to mentions"

### 7. Closing & Next Steps (2 minutes)

**Recap**:
- ✅ Multi-agent visibility and management
- ✅ Organizational structure (communities/groups)
- ✅ Automated workflow coordination
- ✅ Real-time execution tracking
- ✅ Communication platform integration

**Value Proposition**:
- "Coordinate 10, 50, 100 agents as easily as managing a small team"
- "Automate routine coordination (standups, status reports, security audits)"
- "24/7 operation - workflows run on schedule even when you're offline"
- "Built on OpenClaw - open source, self-hosted, extensible"

**Call to Action**:
- "Would you like to see a specific use case for your team?"
- "I can walk through setting up your first workflow"
- "Happy to discuss integration with your existing tools"

---

## Demo Flow (30-minute Version)

Use the 15-minute flow above, plus:

### Additional Sections (add 15 minutes):

**8. Document Workspace** (+3 minutes)
- Navigate to Documents
- Show ORG, AGENTS, WORKFLOWS, SYSTEM sections
- Open an IDENTITY.md file
- Show inline editing
- Explain markdown-based knowledge base

**9. Workflow Template Deep Dive** (+5 minutes)
- Open each template
- Explain use case for each
- Show customization options (targeting, schedule)
- Discuss how to create custom templates

**10. Live Workflow Creation** (+5 minutes)
- Create a new workflow from template
- Customize targeting rules
- Set schedule (or leave manual)
- Save and show in workflow list
- Optionally trigger execution

**11. Q&A and Use Case Discussion** (+2 minutes)
- Answer specific questions
- Discuss client's use cases
- Custom workflow ideas
- Integration possibilities

---

## Backup Scenarios

### If Live Demo Fails:
1. **Screenshots Ready**: Have screenshots of key screens
2. **Video Recording**: Pre-record a 5-minute demo walkthrough
3. **Static Demo**: Walk through features without clicking
4. **Documentation Fallback**: Show CLAWMAX_FEATURES.md

### If Agents Aren't Running:
- Focus on dashboard features (agents, organizations, documents)
- Show workflow templates and execution history
- Explain execution flow without live demo
- Offer to schedule follow-up with live execution

### If Questions Go Technical:
- Reference OPENCLAW_CHANGES.md for implementation details
- Explain OpenClaw architecture
- Discuss WebSocket gateway communication
- Show CLI integration (`openclaw workflow run`)

---

## Common Questions & Answers

**Q: How many agents can it handle?**
A: Currently managing [X] agents. Architecture scales to hundreds. File-based storage is efficient, WebSocket communication is lightweight.

**Q: Can workflows fail gracefully?**
A: Yes. Each agent's execution is independent. If one fails, others continue. Execution logs show success/failure per agent. Failed agents can be retried.

**Q: How do you prevent workflow spam?**
A: Cron schedules are configurable. Managed workflows require approval. Agents can be opted out via targeting rules. Users control frequency.

**Q: What if an agent goes offline during execution?**
A: Execution times out after 2 minutes per agent. Marked as failed with timeout error. Workflow continues with other agents. Can manually retry failed agents.

**Q: Can workflows have dependencies?**
A: Not yet (roadmap for v1.1.0). Current workaround: chain workflows manually or use managed mode for sequential execution.

**Q: How do you secure agent communication?**
A: WebSocket connections use auth tokens. Local-only by default (127.0.0.1). Can configure TLS for remote agents. OpenClaw handles authentication.

**Q: Can workflows trigger other workflows?**
A: Roadmap feature. Current workaround: agents can be instructed to trigger workflows via CLI in their response.

**Q: How do you handle agent responses?**
A: Captured in execution logs. Full markdown response stored. Can be viewed in dashboard. Future: structured output parsing.

**Q: Is this open source?**
A: Dashboard is currently private (Maximilien.ai). Built on OpenClaw (open source). Working with OpenClaw maintainers to upstream workflow features. May open-source dashboard later.

**Q: What's the pricing model?**
A: TBD. Dashboard is free for OpenClaw users currently. May offer hosted version or enterprise features.

---

## Demo Recording Checklist

### For Demo Videos:

**Before Recording**:
- [ ] Close unnecessary browser tabs
- [ ] Clean desktop (hide personal files)
- [ ] Set browser zoom to 100%
- [ ] Clear browser console
- [ ] Restart dashboard for clean logs
- [ ] Prepare script/talking points
- [ ] Test audio levels

**During Recording**:
- [ ] Introduce yourself and ClawMax
- [ ] Follow 15-minute demo flow
- [ ] Speak clearly and at moderate pace
- [ ] Point out key features with cursor
- [ ] Show real data (not lorem ipsum)
- [ ] End with clear call to action

**After Recording**:
- [ ] Review video for errors
- [ ] Add title card and end card
- [ ] Export in 1080p MP4
- [ ] Upload to YouTube (unlisted or public)
- [ ] Create thumbnail
- [ ] Write description with feature list

**Video Title Ideas**:
- "ClawMax Dashboard: Manage 100+ AI Agents as a Team"
- "Automated Workflows for OpenClaw AI Agents"
- "ClawMax Demo: Multi-Agent Coordination Made Easy"
- "Building an AI Agent Team with ClawMax"

---

## Blog Post Outline (To Write)

**Title**: "Introducing ClawMax Dashboard: Mission Control for AI Agent Teams"

**Structure**:
1. **Problem**: Managing multiple AI agents is chaos
2. **Solution**: ClawMax Dashboard - centralized management
3. **Key Features**: (use CLAWMAX_FEATURES.md as source)
4. **Use Cases**: Daily standups, sprint planning, security audits
5. **Demo**: Link to video
6. **Architecture**: Built on OpenClaw
7. **Roadmap**: v1.0.0 features
8. **Call to Action**: Try it, contribute, contact

**Target Length**: 1500-2000 words
**Target Audience**: OpenClaw users, AI/ML engineers, DevOps teams
**Publish On**: Maximilien.ai blog, Dev.to, Medium, Hacker News

---

## Weekend Plan (March 8-9)

### Saturday
- [ ] Record 5-minute demo walkthrough video
- [ ] Create 3-5 screenshots for social media
- [ ] Write blog post draft
- [ ] Test all workflows with live agents
- [ ] Clean up any UI bugs

### Sunday
- [ ] Review and edit blog post
- [ ] Publish blog post
- [ ] Share on Twitter/LinkedIn
- [ ] Prepare demo script (printed notes)
- [ ] Final system health check

---

## Next Week Plan (March 10-13)

### Monday-Tuesday
- [ ] Practice demo 2-3 times
- [ ] Refine talking points based on practice
- [ ] Prepare client-specific customizations
- [ ] Set up backup demos (video, screenshots)

### Wednesday
- [ ] Final dress rehearsal
- [ ] Confirm all systems operational
- [ ] Prepare Q&A responses
- [ ] Review feature doc one more time

### Thursday-Friday (DEMO DAYS)
- [ ] Start dashboard early morning
- [ ] Check agent statuses
- [ ] Have backup video ready
- [ ] Deliver awesome demos!
- [ ] Collect feedback after each demo
- [ ] Iterate based on feedback

---

## Success Metrics

**During Demos**:
- [ ] No system crashes
- [ ] At least one workflow executed live
- [ ] Clients ask "how do I get this?"
- [ ] Positive reactions to workflow templates
- [ ] Interest in specific use cases

**After Demos**:
- [ ] Follow-up meetings scheduled
- [ ] Feature requests collected
- [ ] Blog post engagement (shares, comments)
- [ ] Demo video views (>100 in first week)
- [ ] Leads generated

---

## Files to Review (Priority Order)

### ⭐ MUST REVIEW TONIGHT:
1. **This file** (`DEMO_PREP.md`) - Demo flow and talking points
2. `CLAWMAX_FEATURES.md` - Comprehensive feature list
3. `WORKFLOWS/templates/README.md` - Template overview

### ⭐ REVIEW TOMORROW:
4. `WORKFLOWS/templates/daily-standup.md` - Most common use case
5. `WORKFLOWS/templates/sprint-planning.md` - High-value workflow
6. `PLANNING.md` - Current project status
7. `OPENCLAW_CHANGES.md` - Technical implementation details

### Optional (If Time):
8. Other workflow templates (security-audit, code-review-reminder, etc.)
9. Dashboard UI (click around, familiarize)
10. Agent IDENTITY.md files (know your agents)

---

**You've got this! The dashboard is solid, the features are impressive, and the demos will be great. 🚀**

**Questions before the demos? Review this guide and reach out.**

**Good luck! 🎯**
