# ClawMax Dashboard - Current Limitations & Roadmap

**Last Updated**: March 7, 2026
**Version**: v0.9.2
**Status**: Pre-release (OpenClaw integration in progress)

---

## Executive Summary

ClawMax Dashboard provides a complete **orchestration layer** for OpenClaw multiagent systems. The dashboard, workflow templates, and targeting system are **fully functional**. However, **live workflow execution** requires enhancements to OpenClaw's gateway architecture that are currently in discussion with OpenClaw maintainers.

**What This Means for Demos**: You can demonstrate the complete vision, show the infrastructure, and explain that execution is pending OpenClaw gateway enhancements.

---

## ✅ What Works NOW (Demo-Ready)

### 1. Multiagent Dashboard
**Status**: ✅ Fully Functional

- Real-time agent status (online/offline via port detection)
- Agent cards with identity, skills, communities, groups, tags
- Activity timeline (file modifications)
- Filter by status, communities, groups, tags
- Agent detail views with TODOs, activity, configuration

**Demo Value**: Show managing 16+ agents as a cohesive team

---

### 2. Organizational Structure
**Status**: ✅ Fully Functional

- **Communities**: High-level groupings (Engineering, Product, Customer Success)
- **Groups**: Cross-functional teams (Daily Standup, Project Teams, Legal)
- **Tags**: Flexible labels (engineer, manager, qa, release-manager)
- Visual hierarchy and member management
- Workflow association display

**Demo Value**: Show how agents are organized like a real company

---

### 3. Workflow Templates Library
**Status**: ✅ Fully Functional

**8 Pre-Built Templates**:
1. Daily Standup
2. Weekly Status Report
3. Code Review Reminder
4. Sprint Planning
5. Security Audit
6. Customer Feedback Review
7. Onboarding Checklist
8. Release Preparation

**Demo Value**: Show ready-to-use workflows for common scenarios

---

### 4. Workflow Editor & Targeting
**Status**: ✅ Fully Functional

- Create/edit workflows with markdown content
- YAML frontmatter for metadata
- Targeting rules:
  - By community (e.g., "Engineering Team")
  - By group (e.g., "Daily check-ins")
  - By tags (e.g., "engineer", "manager")
  - By specific agents
- Schedule configuration (cron expressions)
- Execution modes (automated vs managed)

**Demo Value**: Show sophisticated targeting and scheduling capabilities

---

### 5. Document Workspace
**Status**: ✅ Fully Functional

- Markdown editor for all workspace files
- File browser (ORG, AGENTS, WORKFLOWS, SYSTEM)
- YAML frontmatter support
- Real-time file system sync

**Demo Value**: Show centralized knowledge base

---

### 6. Communication Integration (UI)
**Status**: ✅ UI Complete

- WhatsApp, Slack, Discord tabs
- Agent communication channel associations
- Multi-channel support display

**Demo Value**: Show vision for multi-channel agent communication

---

## ⏳ What Requires OpenClaw Gateway Enhancements

### 1. Multiagent Parallel Workflow Execution
**Status**: ⏳ Blocked by OpenClaw Architecture

**Current Limitation**:
- OpenClaw's gateway uses a **global lock** - only one gateway can run at a time
- This prevents multiple agents from having active gateways simultaneously
- Workflow CLI cannot connect to multiple agents in parallel

**Required OpenClaw Changes**:
- **Option A**: Remove global gateway lock, allow multiple gateway instances per agent
- **Option B**: Add agent routing to shared gateway (preferred)
  - Gateway accepts `targetAgent` parameter in RPC calls
  - Gateway routes messages to correct agent context
  - Single gateway serves all agents

**Impact**: Multiagent workflows can be **defined** but not **executed** until OpenClaw gateway is enhanced

**Workaround for Demos**:
- Show workflow definitions and targeting
- Explain execution flow (conceptually)
- Demonstrate single-agent execution if needed

---

### 2. Automated Workflow Scheduling
**Status**: ⏳ Requires Gateway + Daemon

**Current Limitation**:
- Cron scheduling is defined but not active
- Requires long-running scheduler daemon
- Depends on multiagent execution (above)

**Required Components**:
1. OpenClaw gateway enhancements (see above)
2. ClawMax scheduler daemon (planned v1.0.0)
3. Execution queue management

**Workaround for Demos**:
- Show schedule definitions (cron expressions)
- Explain automated execution vision
- Manual trigger works for demonstration

---

### 3. Real-Time Execution Tracking
**Status**: ⏳ Partial (File-based tracking works, live updates require gateway)

**Current State**:
- Execution records created (JSON files)
- Participant status tracked (pending/running/completed/failed)
- Logs captured

**Missing**:
- Live progress updates during execution
- Agent response streaming
- Real-time status changes in dashboard

**Required**: Gateway status callbacks or SSE from CLI to dashboard

**Workaround for Demos**:
- Show execution history (post-execution)
- Show execution JSON structure
- Explain live tracking is in progress

---

## 🔄 Execution Flow (As Designed)

### Current Design
```
Dashboard UI
    ↓ (trigger workflow)
Dashboard Server
    ↓ (spawn CLI process)
openclaw workflow run <id>
    ↓ (for each agent)
    ↓ (connect to agent gateway)
Agent Gateway (WebSocket)
    ↓ (chat.send RPC)
Agent Runtime
    ↓ (process workflow)
Response
    ↓ (captured by CLI)
Execution JSON (updated)
    ↓ (polled by dashboard)
Dashboard UI (shows status)
```

### Blocking Issue
**Step**: "connect to agent gateway"
**Problem**: OpenClaw gateway global lock prevents multiple agent gateways

---

## 🎯 Demo Strategy for This Week

### Recommended Demo Flow (15 minutes)

**1. Dashboard Overview** (3 min)
- Show 16 agents with real-time status
- Filter by communities, groups, tags
- Navigate to agent details

**2. Organizational Structure** (3 min)
- Show communities (Engineering, Product, Customer Success)
- Show groups (Daily Standup, Project Teams)
- Explain flexible membership

**3. Workflow Templates** (5 min) ⭐ KEY FEATURE
- Browse template library (8 templates)
- Open Daily Standup template
- Show YAML frontmatter (targeting, schedule)
- Show markdown content (instructions)
- Explain tag-based targeting

**4. Workflow Editor** (3 min)
- Create new workflow from template
- Customize targeting rules
- Set schedule (cron expression)
- Save workflow

**5. Vision & Roadmap** (1 min)
- "Execution requires OpenClaw gateway enhancements"
- "Working with OpenClaw maintainers to add agent routing"
- "Complete orchestration layer ready for when gateway is enhanced"

### Key Talking Points

✅ **"We've built mission control for AI agent teams"**
- Complete infrastructure for multiagent orchestration
- 16 agents organized like a real company
- 8 ready-to-use workflow templates

✅ **"The vision is fully designed and partially implemented"**
- Workflow definitions: ✅ Complete
- Targeting system: ✅ Complete
- Templates library: ✅ Complete
- Execution engine: ⏳ Requires OpenClaw gateway routing

✅ **"We're partnering with OpenClaw maintainers"**
- Submitted workflow execution to OpenClaw fork
- Discussing gateway architecture enhancements
- Two options: multiple gateways OR agent routing

---

## 📋 Short-Term Roadmap (Next 2 Weeks)

### Week 1 (March 10-14)
**OpenClaw Gateway Discussion**
- [ ] Meet with OpenClaw maintainer
- [ ] Present gateway routing proposal
- [ ] Agree on implementation approach
- [ ] Create OpenClaw PR for gateway changes

**Dashboard Polish**
- [x] Workflow templates in Templates view
- [ ] Execution history viewer (for manual tests)
- [ ] Better error messages
- [ ] Demo video recording

### Week 2 (March 17-21)
**Gateway Implementation** (depends on OpenClaw maintainer)
- [ ] Implement agreed gateway approach
- [ ] Test multiagent execution
- [ ] Update workflow CLI for new gateway API
- [ ] End-to-end integration testing

**Dashboard v1.0.0 Prep**
- [ ] Workflow scheduler daemon
- [ ] Execution analytics
- [ ] Performance optimizations

---

## 🚀 Long-Term Roadmap (Q2 2026)

### v1.0.0 - Full Workflow Automation
**Target**: April 2026

- ✅ Multiagent parallel execution
- ✅ Automated scheduling (cron daemon)
- ✅ Real-time execution tracking
- ✅ Agent health monitoring
- ✅ Execution analytics dashboard

### v1.1.0 - Advanced Features
**Target**: June 2026

- Workflow dependencies and chaining
- Conditional execution rules
- Agent rotation and failover
- Execution rollback and retry
- Custom skill integration
- Multi-workspace support

---

## 💬 Q&A for Demos

**Q: Can I run a workflow right now?**
A: You can **define** workflows and **trigger** them, but execution requires OpenClaw gateway enhancements (in progress with maintainers).

**Q: When will execution work?**
A: We're meeting with OpenClaw maintainers next week. Implementation timeline depends on their roadmap and agreed approach (estimated 2-4 weeks).

**Q: What's the blocker?**
A: OpenClaw's gateway architecture currently allows only one gateway globally. Multiagent execution needs either (1) multiple gateways or (2) agent routing in shared gateway.

**Q: Is this a ClawMax bug or OpenClaw limitation?**
A: OpenClaw design choice. The gateway was designed for single-agent use. ClawMax is the first multiagent orchestration layer, so we're working with maintainers to enhance the gateway.

**Q: What can I use today?**
A: Full agent management, organizational structure, workflow definitions, templates, and document workspace. Everything except live multiagent execution.

**Q: Is this still valuable without execution?**
A: Absolutely! The infrastructure, templates, and targeting system are complete. Execution is the final piece. Think of it as "designed and ready for connection."

---

## 🔧 Technical Notes

### For OpenClaw Maintainer Discussion

**Proposed Gateway Enhancement: Agent Routing**

**Current RPC Call**:
```json
{
  "jsonrpc": "2.0",
  "id": "workflow-123",
  "method": "chat.send",
  "params": {
    "message": "# Workflow: Daily Standup\n\nPlease provide your status...",
    "sessionId": "workflow-123"
  }
}
```

**Proposed Enhancement**:
```json
{
  "jsonrpc": "2.0",
  "id": "workflow-123",
  "method": "chat.send",
  "params": {
    "targetAgent": "agent0",  // NEW: Agent ID to route to
    "message": "# Workflow: Daily Standup\n\nPlease provide your status...",
    "sessionId": "workflow-123-agent0"
  }
}
```

**Gateway Behavior**:
1. Receive RPC call with `targetAgent` parameter
2. Load agent context (IDENTITY.md, SOUL.md, TOOLS.md) from `~/.openclaw/workspace/AGENTS/{targetAgent}/`
3. Process message in agent's context
4. Return response

**Benefits**:
- Single gateway serves all agents
- No global lock issues
- Simpler architecture than multiple gateways
- Better resource utilization

---

## 📊 Current Status Summary

| Feature | Status | Demo-Ready | Notes |
|---------|--------|-----------|-------|
| Agent Management | ✅ Complete | Yes | Full CRUD, status, details |
| Organizations | ✅ Complete | Yes | Communities, groups, tags |
| Workflow Templates | ✅ Complete | Yes | 8 templates ready |
| Workflow Editor | ✅ Complete | Yes | Full YAML + markdown |
| Targeting System | ✅ Complete | Yes | Community/group/tag/agent |
| Schedule Config | ✅ Complete | Yes | Cron expressions |
| Document Workspace | ✅ Complete | Yes | Markdown editor |
| Communication UI | ✅ Complete | Yes | Multi-channel display |
| **Workflow Execution** | ⏳ **Blocked** | **Partial** | **Requires OpenClaw gateway** |
| Execution Tracking | ⏳ Partial | Limited | File-based only |
| Automated Scheduling | ⏳ Not Started | No | Requires execution first |

---

## ✅ Conclusion

ClawMax Dashboard is a **production-ready orchestration platform** with one dependency: OpenClaw gateway enhancements for multiagent execution. The infrastructure, UX, and workflow system are complete and demo-ready.

**For this week's demos**: Focus on the vision, infrastructure, and templates. Position execution as "in progress with OpenClaw maintainers."

**For next week**: Gateway discussion with maintainers will determine execution timeline.

---

**Built with ❤️ by Maximilien.ai Team**
**Powered by OpenClaw**
