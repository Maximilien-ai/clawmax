# ClawMax Dashboard - Feature Overview

**Version**: v0.9.2
**Last Updated**: March 6, 2026
**Author**: Maximilien.ai Team

---

## Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Agent Management](#agent-management)
4. [Organization Structure](#organization-structure)
5. [Workflow Automation](#workflow-automation)
6. [Communication Integration](#communication-integration)
7. [Document Management](#document-management)
8. [Use Cases & Demos](#use-cases--demos)
9. [Getting Started](#getting-started)

---

## Overview

**ClawMax Dashboard** is a centralized management interface for OpenClaw AI agent ecosystems. It provides visibility, control, and coordination across multiple AI agents working together as a team.

### Key Value Propositions

1. **Multi-Agent Orchestration** - Coordinate dozens of AI agents as a cohesive team
2. **Visual Organization** - See your entire agent ecosystem at a glance
3. **Workflow Automation** - Schedule and trigger coordinated multi-agent workflows
4. **Communication Hub** - Integrate with WhatsApp, Slack, Discord for agent interactions
5. **Document Workspace** - Centralized knowledge base for organizational context

---

## Core Features

### 🏠 Dashboard Home
- **Agent Status Board**: Real-time online/offline status for all agents
- **Activity Timeline**: Recent file modifications across all agents
- **Quick Stats**: Total agents, communities, groups, workflows
- **Organization Overview**: Name, version, workspace info

### 📊 Agents View
- **Agent Cards**: Visual cards showing status, communities, groups, tags
- **Filtering**: Filter by status (online/offline), communities, groups, tags
- **Quick Actions**: Archive agents, open workspace, view details
- **Agent Details**: View identity, skills, activity, configuration

### 🏢 Organizations View
- **Communities**: High-level organizational units (Engineering, Product, etc.)
- **Groups**: Cross-functional teams or projects
- **Member Management**: Assign agents to communities and groups
- **Workflow Association**: See which workflows target each community/group
- **Visual Indicators**: Agent counts, tags, communication channels

### 🔄 Workflows View
- **Workflow List**: All automated workflows with status and schedule
- **Execution History**: Track past workflow runs with participant status
- **Workflow Editor**: Create/edit workflows with YAML frontmatter
- **Template Library**: Pre-built templates for common scenarios
- **Real-time Tracking**: Monitor workflow execution progress
- **Manual Triggers**: Run workflows on-demand

### 💬 Communication View
- **WhatsApp Integration**: Link agents to WhatsApp conversations
- **Slack Integration**: Connect agents to Slack channels
- **Discord Integration**: Associate agents with Discord servers
- **Multi-Channel Support**: Agents can be in multiple communication platforms
- **Filter by Platform**: View agents by communication channel

### 📄 Documents View
- **Markdown Workspace**: All `.md` files in workspace
- **Section Organization**: ORG, AGENTS, WORKFLOWS, SYSTEM sections
- **File Editor**: Edit markdown files directly in dashboard
- **YAML Frontmatter**: Proper handling of workflow metadata
- **Search & Filter**: Find documents quickly

### ⚙️ Settings View
- **Workspace Management**: Switch between multiple workspaces
- **System Configuration**: OpenClaw integration settings
- **Agent Configuration**: Gateway ports, auth tokens
- **Backup & Export**: Workspace backup and migration

---

## Agent Management

### Agent Lifecycle

**1. Creation**
- Clone from existing agents
- Import from templates
- Create from scratch
- Assign unique ID and workspace path

**2. Configuration**
- **Identity**: Name, creature type, vibe, emoji
- **Skills**: Assign available skills (GitHub, Slack, 1Password, etc.)
- **Communities**: Add to organizational communities
- **Groups**: Assign to cross-functional groups
- **Tags**: Label for flexible targeting (engineer, manager, qa, etc.)
- **Gateway**: Configure WebSocket gateway for workflows

**3. Operations**
- Monitor online/offline status
- View recent activity (file modifications)
- Track TODOs and completed tasks
- Execute workflows on agent
- Review execution results

**4. Archiving**
- Move to archive when no longer active
- Preserve history and metadata
- Restore if needed

### Agent Status Tracking

**Online** 🟢
- Gateway process running
- Port listening confirmed via `lsof`
- Recent file activity (<24h)

**Offline** 🟡
- Gateway not running
- Recent file activity (24h - 7 days)
- Agent exists but not active

**Unknown** ⚪
- No recent activity (>7 days)
- Gateway status unknown
- May need attention

### Agent Skills
Pre-integrated skills available for assignment:
- **github**: GitHub API operations
- **slack**: Slack messaging and management
- **1password**: Password and secrets management
- **apple-notes**: Apple Notes integration
- **bear-notes**: Bear notes integration

---

## Organization Structure

### Communities
**Purpose**: High-level organizational groupings

**Examples**:
- Engineering Team
- Product & Design
- Customer Success
- Leadership

**Features**:
- Assign multiple agents
- Apply tags (org, executive, dev, etc.)
- Link workflows
- Communication channel indicators

### Groups
**Purpose**: Cross-functional teams or projects

**Examples**:
- Daily check-ins
- Maximilien.ai - OpenClaw (project)
- Legal
- Onboarding

**Features**:
- Belong to a parent community
- Mix agents from different communities
- Flexible targeting for workflows
- WhatsApp/Slack/Discord integration

### Tags
**Purpose**: Flexible labeling for targeting and filtering

**Common Tags**:
- Role: `engineer`, `manager`, `ceo`, `advisor`
- Function: `qa`, `security`, `devops`, `release-manager`
- Status: `archived`, `onboarding`, `oncall`
- Technology: `golang`, `typescript`, `python`

---

## Workflow Automation

### What are Workflows?

Workflows are scheduled or manual tasks sent to multiple agents based on targeting rules. They enable coordinated multi-agent operations.

### Workflow Structure

**YAML Frontmatter**:
```yaml
---
id: daily-standup
name: Daily Standup
description: Morning sync for team
schedule: "0 9 * * 1-5"
enabled: true
targeting:
  communities: [Engineering Team]
  groups: []
  tags: [engineer]
  agents: []
executionMode: automated
author: max0
---
```

**Markdown Content**:
Instructions sent to agents (supports full markdown formatting)

### Targeting Rules

Agents participate if they match ANY of:
1. **Community**: Agent is member of listed community
2. **Group**: Agent is member of listed group
3. **Tag**: Agent has any of the listed tags
4. **Agent ID**: Agent ID explicitly listed

### Execution Modes

**Automated**:
- Runs on schedule automatically
- No approval required
- Best for routine tasks

**Managed**:
- Requires owner approval before execution
- Manual trigger via dashboard
- Best for sensitive operations

### Workflow Execution Flow

1. **Trigger**: Schedule or manual trigger
2. **Participant Resolution**: Dashboard identifies target agents
3. **Execution Record**: Creates JSON file with pending participants
4. **CLI Spawn**: Dashboard spawns `openclaw workflow run <id>`
5. **Agent Communication**: CLI connects to each agent's gateway via WebSocket
6. **Workflow Delivery**: Sends workflow content via `chat.send` RPC
7. **Status Updates**: CLI updates participant status (running → completed/failed)
8. **Results Capture**: Stores agent responses in execution record
9. **Dashboard Polling**: Dashboard shows live progress

### Template Library

8 pre-built templates included:
1. **Daily Standup** - Morning team sync
2. **Weekly Status Report** - Leadership visibility
3. **Code Review Reminder** - PR queue management
4. **Sprint Planning** - Sprint preparation
5. **Security Audit** - Monthly security review
6. **Customer Feedback Review** - Product insights
7. **Onboarding Checklist** - New hire workflow
8. **Release Preparation** - Production deploy checklist

---

## Communication Integration

### WhatsApp
- Link agents to WhatsApp numbers
- Visual indicators on agent cards (📱)
- Filter agents by WhatsApp connectivity
- Group chat associations

### Slack
- Connect agents to Slack workspaces
- Channel membership tracking
- Slash command integration
- Message automation

### Discord
- Discord server associations
- Bot account linking
- Community server management

### Multi-Channel Agents
Agents can be active on multiple platforms simultaneously for maximum reach and flexibility.

---

## Document Management

### Workspace Structure

```
~/.openclaw/workspace/
├── ORG/                    # Organizational documents
│   ├── IDENTITY.md
│   ├── MASTER_PLAN.md
│   ├── COMMUNITIES.md
│   └── GROUPS.md
├── AGENTS/                 # Per-agent workspaces
│   ├── agent0/
│   │   ├── IDENTITY.md
│   │   ├── SOUL.md
│   │   ├── TOOLS.md
│   │   └── TODOs.md
│   └── ...
├── WORKFLOWS/              # Workflow definitions
│   ├── daily-standup.md
│   ├── templates/
│   └── executions/
└── SYSTEM/                 # System configuration
    └── dashboard/
```

### Document Sections in Dashboard

**ORG** - Organizational context
**AGENTS** - Per-agent documentation
**WORKFLOWS** - Workflow definitions and templates
**SYSTEM** - System configuration and tools

### Markdown Editor
- Syntax highlighting
- YAML frontmatter support
- Auto-save
- Preview mode
- File system sync

---

## Use Cases & Demos

### Use Case 1: Daily Standup Automation
**Problem**: Distributed team, hard to sync
**Solution**: Automated daily standup workflow

**Setup**:
1. Create workflow from "Daily Standup" template
2. Target "Engineering Team" community
3. Schedule for 9 AM weekdays
4. Enable workflow

**Result**: Every morning, all engineers receive standup prompt, responses collected automatically

---

### Use Case 2: Sprint Planning Coordination
**Problem**: Sprint planning prep is manual and scattered
**Solution**: Managed sprint planning workflow

**Setup**:
1. Create workflow from "Sprint Planning" template
2. Target managers and product owners
3. Set execution mode to "managed"
4. Assign product manager as owner

**Result**: Monday morning, product manager triggers workflow, all stakeholders provide input, centralized planning document generated

---

### Use Case 3: Customer Feedback Analysis
**Problem**: Support tickets and feedback scattered across tools
**Solution**: Weekly customer feedback workflow

**Setup**:
1. Create workflow from "Customer Feedback Review" template
2. Target "Customer Success" community
3. Schedule for Monday 2 PM
4. Enable workflow

**Result**: Weekly feedback summary with action items, fed into product backlog

---

### Use Case 4: Security Compliance
**Problem**: Security audits are manual and time-consuming
**Solution**: Monthly automated security audit

**Setup**:
1. Create workflow from "Security Audit" template
2. Target agents with "security" or "devops" tags
3. Schedule for first of month
4. Review execution results

**Result**: Comprehensive security report with prioritized remediation plan

---

### Use Case 5: Onboarding Consistency
**Problem**: New hires have inconsistent onboarding experience
**Solution**: Structured onboarding checklist workflow

**Setup**:
1. Create workflow from "Onboarding Checklist" template
2. Target agents with "new-hire" tag
3. Manually trigger when new team member joins
4. Track completion via execution logs

**Result**: Every new hire follows same onboarding path, nothing falls through cracks

---

## Getting Started

### Prerequisites
- OpenClaw installed and configured
- At least one agent with gateway running
- ClawMax Dashboard installed

### Quick Start (5 minutes)

**Step 1: Start Dashboard**
```bash
cd ~/.openclaw/workspace/SYSTEM/dashboard
npm install
npm run dev
```

**Step 2: Open Dashboard**
Navigate to `http://localhost:5173`

**Step 3: Explore**
- **Dashboard**: See your agent ecosystem overview
- **Agents**: Browse all agents and their status
- **Organizations**: Review communities and groups
- **Workflows**: Check existing workflows

**Step 4: Create First Workflow**
1. Go to Workflows page
2. Click "New Workflow"
3. Choose "Use Template" → "Daily Standup"
4. Customize targeting to your team structure
5. Set schedule or leave disabled for manual testing
6. Save workflow

**Step 5: Test Workflow**
1. Ensure at least one agent gateway is running:
   ```bash
   openclaw gateway run --agent agent0
   ```
2. Trigger workflow manually from dashboard
3. Watch execution progress in real-time
4. Review results

---

## Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express
- **Communication**: WebSocket (via OpenClaw Gateway)
- **Storage**: File-based (markdown + JSON)
- **Integration**: OpenClaw CLI

### Key Integrations
- **OpenClaw Gateway**: WebSocket RPC for agent communication
- **OpenClaw CLI**: `openclaw workflow run` for execution
- **File System**: Direct read/write to workspace
- **Git**: Version control for all workspace files

---

## Roadmap

### v0.9.x (Current)
✅ Core dashboard features
✅ Workflow execution system
✅ Template library
✅ Real-time execution tracking

### v1.0.0 (Next Release)
- [ ] Workflow scheduler (cron daemon integration)
- [ ] Execution history analytics
- [ ] Workflow templates UI (browse/import from dashboard)
- [ ] Agent health monitoring dashboard
- [ ] Multi-workspace management UI

### v1.1.0 (Future)
- [ ] Workflow dependencies and chaining
- [ ] Conditional execution rules
- [ ] Agent rotation and failover
- [ ] Execution rollback and retry
- [ ] Performance metrics and dashboards

---

## Support & Resources

**Documentation**: [GitHub](https://github.com/Maximilien-ai/maxclaw)
**OpenClaw Docs**: [OpenClaw.org](https://openclaw.org)
**Issues**: [GitHub Issues](https://github.com/Maximilien-ai/maxclaw/issues)
**Community**: Join our Discord or Slack

---

**Built with ❤️ by Maximilien.ai Team**
**Powered by OpenClaw**
