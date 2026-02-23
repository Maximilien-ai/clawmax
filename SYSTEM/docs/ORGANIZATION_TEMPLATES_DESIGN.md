# Organization Templates & Tools/Skills System - Design Document

**Version:** 1.0
**Date:** February 23, 2026
**Status:** DRAFT FOR REVIEW

---

## Executive Summary

This document proposes a comprehensive **Organization Templates** system that allows users to:
1. Export entire organizational structures (agents + communities + groups + memberships) as reusable templates
2. Import templates to quickly recreate proven team configurations
3. Add executable **Tools & Skills** to agents to enable real actions (coding, GitHub operations, etc.)
4. Build a marketplace/library of templates for common use cases

### Why This Matters

Users like you are building curated agent organizations (Maximilien.ai with engineers, PMs, QA, etc.). Once perfected, these should be:
- **Exportable** as templates for reuse
- **Shareable** with others facing similar challenges
- **Actionable** - agents should be able to execute real tasks, not just chat

---

## Part 1: Organization Templates System

### 1.1 Current State

**What exists today:**
- Individual agents with SOUL.md, TOOLS.md, IDENTITY.md
- COMMUNITIES.md and GROUPS.md defining organizational structure
- Agent cloning (copies individual agent)
- Community/Group membership management in dashboard

**Limitations:**
- Can only clone individual agents, not entire organizations
- No way to export/import a tested organizational structure
- No template library or sharing mechanism
- TOOLS.md is text-only, not executable

### 1.2 Two Types of Templates: Agent vs Organization

We support **two template types** using the **same unified system**:

#### **Type 1: Agent Templates** (Single Agent)
**Purpose:** Reusable agent configurations for creating similar agents quickly

**Contains:**
- 1 agent (SOUL.md, TOOLS.md, IDENTITY.md)
- Agent skills configuration
- No communities or groups

**Use Cases:**
- "I want to create 3 more engineers just like this one"
- Template library: "Senior SWE", "Junior SWE", "DevOps Engineer"
- Building blocks for organization templates

**Example: Senior Software Engineer Template**
```json
{
  "name": "Senior Software Engineer",
  "type": "agent",
  "version": "1.0.0",
  "agents": [{
    "id": "engineer",
    "role": "Golang developer focusing on backend services",
    "skills": ["github", "golang", "coding-agent", "gh-issues"]
  }],
  "communities": [],
  "groups": []
}
```

#### **Type 2: Organization Templates** (Full Teams)
**Purpose:** Complete team/organization structures with agents, communities, and groups

**Contains:**
- Multiple agents (typically 3-20)
- Communities (organizational units)
- Groups (communication channels)
- Agent-to-group memberships

**Use Cases:**
- "Replicate this entire engineering team for a new project"
- "Bootstrap a startup with a proven team structure"
- "Share a working organizational pattern"

**Example: Engineering Team Template**
```json
{
  "name": "Maximilien.ai Engineering Team",
  "type": "organization",
  "version": "1.0.0",
  "agents": [
    { "id": "engineer" },
    { "id": "qa-engineer" },
    { "id": "product-manager" },
    // ... 8 more agents
  ],
  "communities": [
    { "name": "Engineering Team" },
    { "name": "Product & Design" }
  ],
  "groups": [
    { "name": "Daily check-ins" },
    { "name": "Maximilien.ai - OpenClaw" }
  ]
}
```

#### **Unified System, Different UX**

**Backend:** Same format, same storage, same APIs
**Frontend:** Separate UI sections for clarity

```
Dashboard → Templates Tab:
├── Agent Templates (147)
│   ├── 👨‍💻 Senior Software Engineer
│   ├── 🧪 QA Engineer
│   ├── 📊 Product Manager
│   └── ... (browse all)
│
└── Organization Templates (23)
    ├── 🏢 Startup Core Team (5 agents, 2 communities)
    ├── 🏢 Maximilien.ai Engineering (11 agents, 4 communities)
    ├── 🏢 Customer Support Team (3 agents, 1 community)
    └── ... (browse all)
```

**Key Insight:** Agent Templates = Organization Templates with 1 agent. Same infrastructure, different presentation.

### 1.3 Proposed Solution: Template System Architecture

An **Organization Template** bundles:
- Collection of agent definitions (SOUL, TOOLS, IDENTITY)
- Communities with descriptions, tags, channels
- Groups with descriptions, tags, membership rules
- Workflows (optional, for advanced use)

**Example Template:** "Maximilien.ai Engineering Team"
```
├── agents/
│   ├── engineer/ (SOUL.md, TOOLS.md, IDENTITY.md)
│   ├── qa-engineer/
│   ├── product-manager/
│   ├── ceo/
│   └── ...
├── communities/
│   ├── engineering-team.md
│   ├── product-design.md
│   └── customer-success.md
├── groups/
│   ├── daily-checkins.md
│   ├── general.md
│   ├── maximilien-ai-openclaw.md
│   └── ...
└── template.json (metadata + structure)
```

### 1.3 Template Format

**template.json:**
```json
{
  "name": "Maximilien.ai Engineering Team",
  "version": "1.0.0",
  "description": "Complete engineering organization with PM, engineers, QA, and leadership",
  "author": "maximilien",
  "tags": ["engineering", "saas", "agile", "golang"],
  "agents": [
    {
      "id": "engineer",
      "name": "Software Engineer",
      "role": "Golang developer focusing on backend services",
      "tags": ["engineer", "golang"],
      "tools": ["github", "golang", "git", "testing"],
      "communities": ["Engineering Team", "Maximilien.ai"],
      "groups": ["Daily check-ins", "Maximilien.ai - OpenClaw"]
    },
    {
      "id": "qa-engineer",
      "name": "QA Engineer",
      "role": "Testing and quality assurance specialist",
      "tags": ["qa", "testing"],
      "tools": ["testing", "automation", "ci-cd"],
      "communities": ["Engineering Team"],
      "groups": ["Daily check-ins", "Test - ClawMax.ai"]
    }
  ],
  "communities": [
    {
      "name": "Maximilien.ai",
      "description": "Main organizational community",
      "tags": ["org", "executive", "leadership"],
      "channels": ["whatsapp"]
    },
    {
      "name": "Engineering Team",
      "description": "Core development and technical discussions",
      "tags": ["dev", "engineering"]
    }
  ],
  "groups": [
    {
      "name": "Daily check-ins",
      "description": "Morning standup and daily sync",
      "tags": ["standup", "daily"],
      "community": "Maximilien.ai",
      "channels": ["whatsapp"]
    },
    {
      "name": "Maximilien.ai - OpenClaw",
      "description": "OpenClaw project development",
      "tags": ["dev", "openclaw", "ai"],
      "community": "Engineering Team",
      "channels": ["whatsapp", "slack"]
    }
  ],
  "workflows": []
}
```

### 1.4 Storage Structure

**Filesystem Layout:**
```
~/.openclaw/workspace/TEMPLATES/
├── agents/                              # Agent Templates
│   ├── senior-software-engineer/
│   │   ├── template.json (type: "agent")
│   │   ├── agents/
│   │   │   └── engineer/
│   │   │       ├── SOUL.md
│   │   │       ├── TOOLS.md
│   │   │       └── IDENTITY.md
│   │   └── README.md
│   ├── qa-engineer/
│   ├── product-manager/
│   └── ... (147 agent templates)
│
└── organizations/                       # Organization Templates
    ├── maximilien-ai-engineering/
    │   ├── template.json (type: "organization")
    │   ├── agents/
    │   │   ├── engineer/
    │   │   ├── qa-engineer/
    │   │   ├── product-manager/
    │   │   └── ... (11 agents)
    │   ├── README.md
    │   └── CHANGELOG.md
    ├── startup-core-team/
    ├── customer-support-team/
    └── ... (23 organization templates)
```

**Why this structure?**
- Human-readable and editable (markdown + JSON)
- Version controllable (git-friendly)
- Easy to share (zip and distribute)
- Inspectable before import

### 1.5 User Workflows

#### A. Create Agent Template (Single Agent)

**Dashboard UI:**
1. Agents page → Right-click agent card → "Save as Template"
2. Modal appears: "Create Agent Template"
   - Template name: [input] (e.g., "Senior Software Engineer")
   - Description: [textarea]
   - Tags: [tag input] (auto-populated from agent)
   - Skills included: [readonly list showing github, golang, etc.]
3. Click "Save" → adds to Template Library under "Agent Templates"

**Alternative:** Clone button → "Save as Template" checkbox

**CLI Alternative:**
```bash
openclaw template create-agent --agent engineer --name "Senior SWE"
```

#### B. Create Organization Template (Full Team)

**Dashboard UI:**
1. Communication tab → "Export as Template" button
2. Modal appears: "Create Organization Template"
   - Template name: [input] (e.g., "My Engineering Team")
   - Description: [textarea]
   - **Select agents to include:** [checkboxes with preview]
   - **Select communities:** [checkboxes]
   - **Select groups:** [checkboxes]
   - Preview shows: "11 agents, 4 communities, 9 groups"
3. Click "Export" → downloads `template.zip` or saves to workspace

**CLI Alternative:**
```bash
openclaw template export --name "My Team" --output ./my-team-template
```

#### C. Import Agent Template (Create from Template)

**Dashboard UI - Method 1: From Template Library**
1. New "Templates" tab → "Agent Templates" section
2. Browse templates, click one → detail view
3. Preview shows SOUL.md excerpt, skills, tags
4. Click "Create Agent from Template"
5. Customize:
   - Agent ID: [input] (default: template name + random suffix)
   - Name: [input]
   - Optional: Edit SOUL.md before creating
6. Click "Create" → new agent appears in roster

**Dashboard UI - Method 2: From Create Agent Flow**
1. Agents page → "+ New Agent" button
2. Modal shows two tabs:
   - **From Scratch** (existing flow)
   - **From Template** (NEW)
3. "From Template" tab:
   - Grid of agent templates
   - Click one → fills form with template data
   - Customize as needed → Create

**CLI Alternative:**
```bash
openclaw template create-from-agent --template "senior-swe" --id engineer2
```

#### D. Import Organization Template (Full Team Setup)

**Dashboard UI:**
1. Templates tab → "Organization Templates" section
2. Browse templates:
   - **Maximilien.ai Engineering** (11 agents, 4 communities, 9 groups) ⭐ Featured
   - **Startup Core Team** (5 agents, 2 communities, 3 groups)
   - **Customer Support** (3 agents, 1 community, 2 groups)
3. Click template → detail view with:
   - Description
   - List of agents with roles
   - Community/group structure visualization
   - Reviews/ratings (future)
4. Click "Use This Template"
5. Customize before import:
   - **Agent prefix:** [input] (e.g., "proj1-" → proj1-engineer, proj1-qa)
   - **Agent suffix:** [input] (e.g., "-v2" → engineer-v2, qa-v2)
   - **Community name customization:** [editable list]
6. Preview: "Will create 11 agents, 4 communities, 9 groups"
7. Click "Import" → progress bar → Done!

**CLI Alternative:**
```bash
openclaw template import ./my-team-template --prefix "proj1-"
```

#### E. Browse Template Library

**Dashboard UI:**
1. New "Templates" tab with two sections:

```
┌─────────────────────────────────────────────┐
│  Templates                        🔍 Search  │
├─────────────────────────────────────────────┤
│                                              │
│  Agent Templates (147)         [View All →] │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 👨‍💻 Senior │ │ 🧪 QA     │ │ 📊 Product│    │
│  │ SWE      │ │ Engineer │ │ Manager  │    │
│  │ ⭐⭐⭐⭐⭐   │ │ ⭐⭐⭐⭐☆   │ │ ⭐⭐⭐⭐⭐   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  Organization Templates (23)   [View All →] │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🏢 Startup│ │ 🏢 Max.ai│ │ 🏢 Support│    │
│  │ Core (5) │ │ Eng (11) │ │ Team (3) │    │
│  │ ⭐ Featured│ │ ⭐⭐⭐⭐⭐   │ │ ⭐⭐⭐⭐☆   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
└─────────────────────────────────────────────┘
```

2. Filters:
   - By tags (engineering, qa, product, customer-support)
   - By author (me, community, featured)
   - By rating
3. Search across names, descriptions, tags

---

## Part 2: Tools & Skills System

### 2.1 Problem Statement

**Current TOOLS.md limitations:**
- Text-only descriptions of what tools an agent "knows"
- No executable capabilities
- Agent says "I'll create a GitHub PR" but can't actually do it
- No structured tool configuration

**Example from current TOOLS.md:**
```markdown
As a software engineer, proficiency in Golang programming language is essential.
The use of Github for code repositories, issue tracking, and version control is paramount.
```

**What we need:**
- Executable tool definitions
- Structured configuration (API keys, credentials)
- Skills that combine tools into workflows

### 2.2 Proposed Solution: Structured Tools & Skills

**Tool:** A specific capability with executable code
**Skill:** A combination of tools to accomplish a task

**New File Structure:**
```
AGENTS/engineer/
├── SOUL.md (unchanged)
├── IDENTITY.md (unchanged)
├── TOOLS.md (human-readable overview, unchanged)
├── tools/ (NEW)
│   ├── github.json
│   ├── golang.json
│   ├── git.json
│   └── slack.json
└── skills/ (NEW)
    ├── create-pr.json
    ├── run-tests.json
    └── deploy-service.json
```

### 2.3 Tool Definition Format

**Example: `tools/github.json`**
```json
{
  "name": "github",
  "version": "1.0.0",
  "description": "GitHub API integration for repository operations",
  "provider": "github",
  "capabilities": [
    "create_issue",
    "create_pr",
    "comment_on_pr",
    "list_issues",
    "merge_pr",
    "create_branch",
    "push_commit"
  ],
  "config": {
    "auth_type": "token",
    "token_env_var": "GITHUB_TOKEN",
    "default_repo": "maximilien/openclaw",
    "default_branch": "main"
  },
  "actions": {
    "create_pr": {
      "description": "Create a new pull request",
      "parameters": {
        "title": {"type": "string", "required": true},
        "body": {"type": "string", "required": true},
        "head": {"type": "string", "required": true},
        "base": {"type": "string", "default": "main"}
      },
      "implementation": "github_api_create_pr"
    },
    "create_issue": {
      "description": "Create a new issue",
      "parameters": {
        "title": {"type": "string", "required": true},
        "body": {"type": "string", "required": true},
        "labels": {"type": "array", "default": []}
      },
      "implementation": "github_api_create_issue"
    }
  }
}
```

**Example: `tools/golang.json`**
```json
{
  "name": "golang",
  "version": "1.0.0",
  "description": "Golang development environment and tools",
  "provider": "local",
  "capabilities": [
    "run_tests",
    "build",
    "format",
    "lint",
    "mod_tidy"
  ],
  "config": {
    "go_version": "1.21",
    "workspace_path": "${WORKSPACE}/code"
  },
  "actions": {
    "run_tests": {
      "description": "Run Go tests",
      "parameters": {
        "package": {"type": "string", "default": "./..."},
        "verbose": {"type": "boolean", "default": false}
      },
      "implementation": "exec_command",
      "command": "go test ${verbose ? '-v' : ''} ${package}"
    },
    "build": {
      "description": "Build Go binary",
      "parameters": {
        "output": {"type": "string", "required": true},
        "ldflags": {"type": "string", "default": ""}
      },
      "implementation": "exec_command",
      "command": "go build -o ${output} ${ldflags ? '-ldflags \"' + ldflags + '\"' : ''}"
    }
  }
}
```

### 2.4 Skill Definition Format

**Example: `skills/create-pr.json`**
```json
{
  "name": "create-pr",
  "description": "Create a pull request with code changes",
  "version": "1.0.0",
  "requires_tools": ["git", "github", "golang"],
  "workflow": [
    {
      "step": "create_branch",
      "tool": "git",
      "action": "create_branch",
      "params": {
        "branch_name": "${pr_branch}"
      }
    },
    {
      "step": "make_changes",
      "tool": "local",
      "action": "write_files",
      "params": {
        "files": "${code_changes}"
      }
    },
    {
      "step": "run_tests",
      "tool": "golang",
      "action": "run_tests",
      "params": {
        "verbose": true
      },
      "on_failure": "abort"
    },
    {
      "step": "commit_changes",
      "tool": "git",
      "action": "commit",
      "params": {
        "message": "${commit_message}"
      }
    },
    {
      "step": "push_branch",
      "tool": "git",
      "action": "push",
      "params": {
        "branch": "${pr_branch}"
      }
    },
    {
      "step": "create_pr",
      "tool": "github",
      "action": "create_pr",
      "params": {
        "title": "${pr_title}",
        "body": "${pr_body}",
        "head": "${pr_branch}",
        "base": "main"
      }
    }
  ],
  "outputs": {
    "pr_url": "${step.create_pr.result.html_url}",
    "pr_number": "${step.create_pr.result.number}"
  }
}
```

### 2.5 Tool Registry & Standard Library

**OpenClaw Standard Tools Library:**
```
openclaw-tools/
├── github/
│   ├── github.json
│   └── impl.js (or impl.go)
├── slack/
├── git/
├── golang/
├── python/
├── docker/
├── kubernetes/
├── aws/
├── gcp/
├── anthropic-api/
└── ...
```

**Installation:**
```bash
# Install a tool for an agent
openclaw tool add github --agent engineer

# List available tools
openclaw tool list

# Search tools
openclaw tool search "ci/cd"
```

### 2.6 Security & Safety

**Permissions Model:**
- Tools declare required permissions (filesystem, network, API calls)
- Agent IDENTITY.md includes `permissions:` section
- User explicitly approves permissions on install
- Sandbox execution for untrusted tools

**Example IDENTITY.md with permissions:**
```markdown
# IDENTITY.md - Who Am I?

- **Name:** engineer
- **Creature:** Software Engineer
- **Tags:** engineer, golang
- **Permissions:**
  - filesystem.read: `/workspace/code/**`
  - filesystem.write: `/workspace/code/**`
  - network.http: `api.github.com`
  - exec.allow: `["go", "git", "docker"]`
  - secrets.access: `["GITHUB_TOKEN"]`
```

---

## Part 3: Implementation Plan

### Phase 1: Organization Templates (Week 1-2)

**Backend:**
1. Template export API: `POST /api/templates/export`
   - Accepts: list of agent IDs, community names, group names
   - Returns: template.json + agent files bundled
2. Template import API: `POST /api/templates/import`
   - Accepts: template.json + agent files
   - Creates agents, communities, groups atomically
3. Template validation service
4. Template storage in `~/.openclaw/workspace/TEMPLATES/`

**Dashboard:**
1. "Export as Template" modal on Communication tab
2. "Import Template" modal on Agents tab
3. Template preview component
4. Agent/community/group selection UI

**Testing:**
1. Export Maximilien.ai setup as template
2. Import to fresh workspace
3. Verify all agents, communities, groups created correctly

### Phase 2: Tools & Skills Foundation (Week 3-4)

**Core System:**
1. Tool definition schema (JSON schema validation)
2. Tool registry and loader
3. Tool execution engine with sandboxing
4. Permissions system

**Standard Tools:**
1. Implement 5 core tools:
   - `github` - PR creation, issues, comments
   - `git` - branch, commit, push
   - `golang` - test, build, lint
   - `slack` - send messages, threads
   - `local` - file operations

**Dashboard:**
1. Tools tab showing installed tools per agent
2. "Add Tool" modal with tool library browser
3. Tool configuration UI (API keys, settings)
4. Permissions approval flow

### Phase 3: Skills & Workflows (Week 5-6)

**Skills Engine:**
1. Skill definition schema
2. Workflow executor (step-by-step with rollback)
3. Error handling and retry logic
4. Output capture and chaining

**Example Skills:**
1. `create-pr` - End-to-end PR creation
2. `deploy-service` - Build, test, deploy workflow
3. `triage-issues` - Fetch, categorize, assign issues

**Dashboard:**
1. Skills library browser
2. Skill execution monitoring
3. Workflow logs and debugging

### Phase 4: Template Library & Marketplace (Week 7-8)

**Template Library:**
1. Featured templates (curated by OpenClaw team)
2. Community templates (user submissions)
3. Template rating and reviews
4. Version management

**Dashboard:**
1. Templates tab with grid view
2. Template detail pages
3. "Use Template" one-click setup
4. Template customization before import

---

## Part 4: Example Use Cases

### Use Case 1: Create Multiple Similar Agents from Template

**Scenario:** Need 5 software engineers with same configuration

**Before (without agent templates):**
- Create first engineer manually
- Clone 4 times
- Each clone needs manual customization
- **Time: 15 minutes**

**After (with agent templates):**
1. Create first engineer, perfect the config
2. Right-click → "Save as Template" → "Senior SWE"
3. For each new engineer:
   - Templates tab → "Senior SWE" → "Create from Template"
   - Change ID: engineer2, engineer3, etc.
   - Click Create
- **Time per additional agent: 30 seconds**
- **Total for 5 agents: 2 minutes**

**Benefit:** 13 minutes saved, consistent configuration

### Use Case 2: Replicate Maximilien.ai for New Project

**Before:**
- Manually create 11 agents
- Configure SOUL, TOOLS, IDENTITY for each
- Create 4 communities
- Create 9 groups
- Assign memberships
- **Time: 3-4 hours**

**After (with templates):**
1. Export Maximilien.ai as template (one-time, 2 minutes)
2. For new project: Import template (30 seconds)
3. Customize agent names if needed (optional, 1 minute)
4. **Total time: 1 minute**

### Use Case 3: Engineer Agent Creates PRs

**Before:**
- Agent says "I'll create a PR for you"
- User must manually:
  - Create branch
  - Write code
  - Run tests
  - Commit changes
  - Push branch
  - Open GitHub and create PR

**After (with tools & skills):**
```
User: "Create a PR to add error handling to the auth service"
Engineer Agent:
  1. [uses 'github' tool] Fetches current code
  2. [uses 'golang' tool] Analyzes codebase
  3. [writes code changes]
  4. [uses 'create-pr' skill] Executes workflow:
     - Creates branch: feature/auth-error-handling
     - Applies code changes
     - Runs tests: ✅ Passed
     - Commits: "Add comprehensive error handling to auth service"
     - Pushes to GitHub
     - Creates PR: #42
  5. Responds: "✅ Created PR #42: Add error handling to auth service
     https://github.com/max/openclaw/pull/42

     Tests passed. Ready for review."
```

### Use Case 4: Startup Bootstraps Team from Template

**Scenario:** New startup wants to set up agent team

1. Browse template library
2. Find "Startup Core Team" template:
   - CEO (strategic planning, fundraising)
   - CTO (technical architecture)
   - Engineer (full-stack development)
   - Designer (UI/UX)
   - Customer Success (support, onboarding)
3. Click "Use Template"
4. Customize:
   - Change community name to "MyStartup.ai"
   - Add company-specific context to SOUL files
5. Import → 5 agents ready in 1 minute

---

## Part 5: Technical Architecture

### 5.1 Database Schema Changes

**New Tables:**

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  version TEXT,
  tags JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  is_public BOOLEAN DEFAULT FALSE,
  downloads INTEGER DEFAULT 0,
  rating REAL,
  file_path TEXT
);

CREATE TABLE agent_tools (
  agent_id TEXT,
  tool_name TEXT,
  tool_version TEXT,
  config JSON,
  enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMP,
  PRIMARY KEY (agent_id, tool_name)
);

CREATE TABLE agent_skills (
  agent_id TEXT,
  skill_name TEXT,
  skill_version TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMP,
  PRIMARY KEY (agent_id, skill_name)
);
```

### 5.2 API Endpoints

**Templates:**
- `GET /api/templates` - List all templates (agents + organizations)
  - Query params: `?type=agent` or `?type=organization` to filter
  - Returns: `{ agents: [...], organizations: [...] }`
- `GET /api/templates/agents` - List agent templates only
- `GET /api/templates/organizations` - List organization templates only
- `GET /api/templates/:type/:id` - Get template details
  - `type` = "agents" or "organizations"
  - Returns full template.json + agent files
- `POST /api/templates/agents/:agentId/save` - Save agent as template
  - Body: `{ name, description, tags }`
  - Exports single agent to template library
- `POST /api/templates/organizations/export` - Export org as template
  - Body: `{ name, description, agentIds, communityNames, groupNames }`
  - Exports multiple agents + communities + groups
- `POST /api/templates/agents/import` - Create agent from template
  - Body: `{ templateId, newAgentId, customizations }`
  - Returns new agent ID
- `POST /api/templates/organizations/import` - Import org template
  - Body: `{ templateId, prefix, suffix, customizations }`
  - Returns list of created agent IDs, community names, group names
- `DELETE /api/templates/:type/:id` - Delete template

**Tools:**
- `GET /api/tools` - List available tools
- `GET /api/tools/:name` - Get tool details
- `POST /api/agents/:id/tools` - Install tool for agent
- `DELETE /api/agents/:id/tools/:name` - Uninstall tool
- `PATCH /api/agents/:id/tools/:name/config` - Update tool config

**Skills:**
- `GET /api/skills` - List available skills
- `GET /api/skills/:name` - Get skill details
- `POST /api/agents/:id/skills` - Install skill
- `POST /api/agents/:id/skills/:name/execute` - Execute skill
- `GET /api/agents/:id/skills/:name/logs` - Get execution logs

### 5.3 File System Structure

```
~/.openclaw/
├── workspace/
│   ├── AGENTS/ (existing)
│   ├── ORG/ (existing)
│   ├── TEMPLATES/ (NEW)
│   └── SYSTEM/ (existing)
├── tools/ (NEW)
│   ├── registry.json
│   └── installed/
│       ├── github@1.0.0/
│       ├── slack@1.2.0/
│       └── ...
├── skills/ (NEW)
│   ├── registry.json
│   └── installed/
│       ├── create-pr@1.0.0/
│       └── ...
└── agents/ (existing runtime)
```

---

## Part 6: Migration Strategy

### 6.1 Backward Compatibility

**Existing agents continue to work:**
- TOOLS.md remains text-only (human-readable reference)
- New `tools/` directory is optional
- Dashboard shows "Add Tools" CTA for agents without tools

### 6.2 Gradual Adoption

**Phase 1:** Templates without tools
- Users can export/import org structures
- Agents still text-only TOOLS.md

**Phase 2:** Add tools to existing agents
- One-by-one install tools for agents
- Start with simple tools (github, slack)

**Phase 3:** Community shares templates
- Template library grows organically
- Users discover and reuse templates

---

## Part 7: Open Questions for Review

### 7.1 Template Versioning
**Q:** How do we handle template updates?
- Option A: Semantic versioning (1.0.0 → 1.1.0)
- Option B: Snapshot-only (no updates, create new template)
- **Recommendation:** Option A with upgrade paths

### 7.2 Tool Implementation Language
**Q:** JavaScript, Go, or both?
- Option A: Pure Go (type-safe, fast, single binary)
- Option B: JavaScript (easier community contributions)
- Option C: Both (Go for core, JS for community)
- **Recommendation:** Option C

### 7.3 Tool Sandboxing
**Q:** How strict should sandboxing be?
- Option A: No sandbox (full trust)
- Option B: Filesystem + network isolation
- Option C: Full VM isolation
- **Recommendation:** Option B initially, Option C for marketplace tools

### 7.4 Pricing for Template Marketplace
**Q:** Should premium templates be paid?
- Option A: All free, community-driven
- Option B: Freemium (basic free, premium paid)
- Option C: Revenue share with template creators
- **Recommendation:** Start with Option A, explore B/C later

---

## Part 8: Success Metrics

### 8.1 Templates
- Number of templates created by users
- Template import/export frequency
- Time saved (vs manual setup)
- User satisfaction (survey)

### 8.2 Tools & Skills
- Number of tools installed per agent
- Tool execution success rate
- Skills used per day
- Agent productivity improvement (qualitative)

### 8.3 Community Engagement
- Template marketplace visits
- Community template submissions
- Template ratings and reviews
- Fork and customization rate

---

## Conclusion

This design proposes a comprehensive system that:
1. **Saves time:** Export/import tested organizational structures
2. **Enables sharing:** Template marketplace for community knowledge
3. **Makes agents productive:** Real tool execution (GitHub, Slack, etc.)
4. **Maintains safety:** Permissions and sandboxing

**Next Steps:**
1. Review this doc with Max and team
2. Prioritize phases based on user feedback
3. Start Phase 1 (templates) implementation
4. Iterate based on real-world usage

**Timeline:** ~8 weeks for full implementation (all 4 phases)

---

## Appendix A: Alternative Approaches Considered

### A.1 Single JSON Config File
❌ Rejected - Less human-readable, harder to version control

### A.2 Database-Only Storage
❌ Rejected - Not git-friendly, harder to share

### A.3 Docker Containers for Tools
❌ Rejected - Too heavy, slower startup

### A.4 Cloud-Only Template Library
❌ Rejected - Users want local control

---

**End of Design Document**

*Ready for review and feedback.*
