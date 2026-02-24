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
- Skills references (no SKILLS.md file - just skill names in template.json)
  - OpenClaw doesn't have SKILLS.md - skills live in `skills/` directories with SKILL.md
  - TOOLS.md remains human-readable documentation (not executable)
  - Template stores skill names: `["github", "golang", "create-pr"]`
- Creation metadata:
  - AI prompt used to create the agent
  - Model used (e.g., claude-3-opus-20240229)
  - Tags and settings
  - Creation timestamp
- No communities or groups

**Why include creation metadata?**
Users can see the original AI prompt and refine it when cloning or creating from template, making iteration easier.

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

**Design Decision:** No separate Groups/Communities templates
- Organization templates include agents + communities + groups together
- Reason: Groups and communities don't have meaning without agents
- If needed later, users can extract groups/communities from organization templates

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
- Collection of agent definitions (SOUL, TOOLS, IDENTITY) as well as tags and settings: llm and AI prompt
- Communities with descriptions, tags, channels
- Groups with descriptions, tags, membership rules
- Workflows (reserved for future, see below)

**Design Decision:** Workflows implementation AFTER templates
- **Phase 1-2**: Ship templates without workflows (agents, communities, groups only)
- **Phase 3**: Investigate and design workflows system
- **Phase 4**: Add workflows to existing templates (non-breaking extension)
- **Reason**: Workflows is a major feature requiring refinement; templates deliver value independently

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
- Validated with JSON schemas (see Section 1.3.1 below)

### 1.3.1 Template Validation with JSON Schema

**Agent Template Schema** (`schemas/agent-template.schema.json`):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "type", "version", "agents"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "type": { "const": "agent" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "description": { "type": "string" },
    "author": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "agents": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1,
      "items": { "$ref": "#/definitions/agent" }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "aiPrompt": { "type": "string" },
        "model": { "type": "string" },
        "createdAt": { "type": "string", "format": "date-time" }
      }
    }
  },
  "definitions": {
    "agent": {
      "type": "object",
      "required": ["id", "role"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
        "name": { "type": "string" },
        "role": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "skills": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

**Organization Template Schema** (`schemas/organization-template.schema.json`):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "type", "version", "agents"],
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "type": { "const": "organization" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "agents": { "type": "array", "minItems": 1 },
    "communities": { "type": "array" },
    "groups": { "type": "array" }
  }
}
```

**Validation Usage:**
```typescript
// Backend validation before import
import Ajv from 'ajv'
const ajv = new Ajv()
const validate = ajv.compile(agentTemplateSchema)
if (!validate(templateJson)) {
  throw new Error(`Invalid template: ${ajv.errorsText(validate.errors)}`)
}
```

### 1.4 Organization Overview & Visualization

**Problem:** Before exporting an organization as a template, users need to see their complete organization structure at a glance.

**Current Dashboard Structure:**
```
Dashboard Tabs:
├── Agents (all agents in flat list)
├── Communication (communities & groups)
└── Activity (logs)
```

**Missing:** A unified view showing the complete organizational structure (agents + communities + groups + memberships)

**Proposed: Organization Overview Tab (NEW)**

Add a new "Organization" tab that shows the complete structure:

```
┌───────────────────────────────────────────────────────────┐
│  Organization Overview              [Export as Template]  │
├───────────────────────────────────────────────────────────┤
│                                                            │
│  📊 Maximilien.ai                                          │
│  11 agents • 4 communities • 9 groups                      │
│                                                            │
│  Communities & Groups                                      │
│  ├─ 🏢 Maximilien.ai (4 agents)                           │
│  │  └─ 💬 Daily check-ins (4 members)                     │
│  ├─ 🏢 Engineering Team (7 agents)                        │
│  │  ├─ 💬 Maximilien.ai - OpenClaw (7 members)            │
│  │  └─ 💬 Test - ClawMax.ai (2 members)                   │
│  ├─ 🏢 Product & Design (2 agents)                        │
│  └─ 🏢 Customer Success (1 agent)                         │
│                                                            │
│  All Agents                                                │
│  ├─ 👤 ceo (Communities: Maximilien.ai)                   │
│  ├─ 👤 engineer (Communities: Engineering Team)           │
│  ├─ 👤 qa-engineer (Communities: Engineering Team)        │
│  ├─ 👤 product-manager (Communities: Product & Design)    │
│  └─ ... (7 more agents)                                   │
│                                                            │
│  [View Details] [Export as Template]                       │
└───────────────────────────────────────────────────────────┘
```

**Why This Helps:**
1. **Visibility:** See entire org structure before exporting
2. **Validation:** Ensure all relationships are correct
3. **Export Prep:** Know exactly what will be in the template
4. **Demo Value:** Impressive visualization for Thursday demo!

**Implementation Priority:** HIGH
- Build this BEFORE organization template export
- Reuses existing Communication tab data
- 1-2 hours to build

### 1.5 Multi-Organization Navigation & Management (Future)

**Problem:** If users can create multiple organizations from templates, they need a way to manage and navigate between them.

**Current Dashboard Structure (Single Organization):**
```
Dashboard Tabs:
├── Agents (all agents in flat list)
├── Communication (all groups/communities)
└── Activity (logs)
```

**Proposed: Multi-Organization Dashboard Structure:**
```
Dashboard Tabs:
├── Organizations (NEW)
│   ├── Maximilien.ai (11 agents, 4 communities) [Active]
│   ├── Project X Team (5 agents, 2 communities)
│   └── Customer Support (3 agents, 1 community)
├── Agents (filtered by active organization)
├── Communication (filtered by active organization)
├── Docs (filtered by active organization)
├── Templates (library - global)
└── Activity (filtered by active organization)
```

**Organizations Tab UI:**
```
┌─────────────────────────────────────────────────────┐
│  Organizations                     + New From Template │
├─────────────────────────────────────────────────────┤
│                                                       │
│  🏢 Maximilien.ai                         [Active]   │
│  11 agents • 4 communities • 9 groups                │
│  Created: Feb 1, 2026 • From template: Engineering   │
│  [View] [Edit] [Export as Template]                  │
│                                                       │
│  🏢 Project X Team                                    │
│  5 agents • 2 communities • 3 groups                 │
│  Created: Feb 10, 2026 • From template: Startup Core │
│  [Switch to] [View] [Edit] [Archive]                 │
│                                                       │
│  🏢 Customer Support                                  │
│  3 agents • 1 community • 2 groups                   │
│  Created: Feb 15, 2026 • From scratch                │
│  [Switch to] [View] [Edit] [Archive]                 │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Navigation Flow:**
1. User clicks "Organizations" tab → sees all organizations
2. Click "Switch to" on any organization → becomes active
3. Active organization filters Agents, Communication, Docs, Activity tabs
4. Click "Export as Template" → saves current org as reusable template

**Implementation Details:**
- **Active Organization Context**: Stored in browser localStorage
- **Backend Filtering**: All API endpoints accept `?org=<org-name>` query parameter
- **Default Behavior**: If only one organization exists, skip org selection (current behavior)
- **Migration Path**: Existing users start with one organization named "Default"

**Alternative Approach (No Organizations Tab):**
- Keep current flat structure (Agents, Communication, Activity)
- Add organization selector dropdown in top nav bar
- **Pros**: Simpler, less navigation depth
- **Cons**: Less discoverable, harder to manage 5+ organizations

**Recommendation:** Start with organization dropdown in top nav (simpler), add Organizations tab later if users manage 5+ organizations.

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

**Design Decision:** Both Clone AND "Save as Template" coexist
- **Clone**: Quick duplicate for immediate use (creates agent instantly)
- **Save as Template**: For reusable library (creates reusable template)
- Different use cases, both valuable
- No need to choose one over the other

**CLI Alternative:**
```bash
clawmax template save --agent engineer --name "Senior SWE"
```

**Design Decision:** ClawMax CLI first, OpenClaw CLI later
- **Phase 1-2**: Build template commands into ClawMax CLI (our control, ship faster)
- **Phase 3**: Contribute template commands to OpenClaw CLI (community benefit)
- **Reason**: Faster iteration, then upstream contribution when stable

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
clawmax template export --name "My Team" --output ./my-team-template
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
clawmax template create --from "senior-swe" --id engineer2
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
clawmax template import ./my-team-template --prefix "proj1-"
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
└── skills/ (NEW - follows OpenClaw format)
    ├── github/
    │   └── SKILL.md (with YAML frontmatter)
    ├── golang/
    │   └── SKILL.md
    ├── create-pr/
    │   └── SKILL.md
    └── deploy-service/
        └── SKILL.md
```

**Design Decision:** Follow OpenClaw's skill format exactly
- Use SKILL.md with YAML frontmatter (not JSON)
- Include metadata for requirements (bins, env, config)
- Skill precedence: `<workspace>/skills` → `~/.openclaw/skills` → bundled skills
- **Reason**: Full compatibility with OpenClaw's skill system, no custom format needed


### 2.3 Skill Definition Format (OpenClaw Compatible)

**Example: `skills/github/SKILL.md`**
```markdown
---
name: github
description: GitHub API integration for repository operations
metadata: { "openclaw": { "requires": { "bins": ["gh"], "env": ["GITHUB_TOKEN"] }, "primaryEnv": "GITHUB_TOKEN" } }
---

# GitHub Integration Skill

This skill provides GitHub repository operations including PR creation, issue management, and code review.

## Available Actions

- **create_pr**: Create a new pull request
- **create_issue**: Create a new issue
- **comment_on_pr**: Add comments to pull requests
- **list_issues**: List repository issues
- **merge_pr**: Merge a pull request
- **create_branch**: Create a new branch
- **push_commit**: Push commits to remote

## Usage

To create a PR:
1. Use the `gh pr create` command with title and body
2. Specify head branch and base branch
3. Optionally add labels and reviewers

## Requirements

- GitHub CLI (`gh`) must be installed
- GITHUB_TOKEN environment variable must be set
- Authenticated with `gh auth login`
```

**Example: `skills/golang/SKILL.md`**
```markdown
---
name: golang
description: Golang development environment and tools
metadata: { "openclaw": { "requires": { "bins": ["go"] } } }
---

# Golang Development Skill

This skill provides Golang development capabilities including testing, building, and code quality checks.

## Available Actions

- **run_tests**: Execute Go test suite
- **build**: Build Go binaries
- **format**: Format code with gofmt
- **lint**: Run golangci-lint
- **mod_tidy**: Clean up go.mod dependencies

## Usage

To run tests:
```bash
go test ./... -v
```

To build:
```bash
go build -o output-binary ./cmd/main.go
```

## Requirements

- Go 1.21+ must be installed
```

### 2.4 Workflow Skills (Complex Multi-Step Tasks)

**Example: `skills/create-pr/SKILL.md`** (Workflow skill combining multiple steps)
```markdown
---
name: create-pr
description: Create a pull request with code changes
metadata: { "openclaw": { "requires": { "bins": ["git", "gh", "go"], "env": ["GITHUB_TOKEN"] } } }
---

# Create PR Workflow Skill

This workflow skill orchestrates creating a pull request with automated testing.

## Workflow Steps

1. **Create feature branch** from main
2. **Apply code changes** to files
3. **Run tests** to ensure quality
4. **Commit changes** with descriptive message
5. **Push branch** to remote
6. **Create PR** on GitHub

## Usage

When you ask the agent to "create a PR for X", this skill executes automatically.

Example: "Create a PR to add error handling to the auth service"

## Requirements

- Git repository initialized
- GitHub CLI authenticated
- Go test suite available
- GITHUB_TOKEN configured

## Error Handling

- If tests fail, workflow aborts before creating PR
- If push fails, retries once
- All errors are logged for debugging
```

**Note:** OpenClaw's skill system handles workflow execution via agent prompts. Skills describe capabilities; agents orchestrate workflows intelligently.

### 2.5 Skill Registry & Reference System

**Design Decision:** Agents reference skills by name, not by copy
- Template contains skill names: `["github", "golang", "create-pr"]`
- Skills live in shared registries (workspace, ~/.openclaw, bundled)
- Agent templates don't duplicate skill files
- **Reason**: Single source of truth, skills can be updated centrally

**Skill Resolution:**
```typescript
// Agent template.json
{
  "agents": [{
    "id": "engineer",
    "skills": ["github", "golang", "create-pr"]  // References only
  }]
}

// At runtime, OpenClaw loads skills from:
// 1. <workspace>/skills/github/
// 2. ~/.openclaw/skills/github/
// 3. bundled skills (if not found above)
```

**ClawMax Dashboard Features:**
```bash
# View available skills for an agent
clawmax skills list --agent engineer

# Add skill to agent
clawmax skills add github --agent engineer

# Search skill library
clawmax skills search "github"
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

### Use Case 1: Create Multiple Similar Agents from Template (Bulk Create)

**Scenario:** Need 5 software engineers with same configuration

**Before (without agent templates):**
- Create first engineer manually
- Clone 4 times
- Each clone needs manual customization
- **Time: 15 minutes**

**After Method 1: One-by-One Import (Current Implementation)**
1. Create first engineer, perfect the config
2. Right-click → "Save as Template" → "Senior SWE"
3. For each new engineer:
   - Templates tab → "Senior SWE" → "Create from Template"
   - Change ID: engineer2, engineer3, etc.
   - Click Create
- **Time per additional agent: 30 seconds**
- **Total for 5 agents: 2 minutes**

**After Method 2: Bulk Create (FUTURE - High Priority)**
1. Create first engineer, perfect the config
2. Right-click → "Save as Template" → "Senior SWE"
3. Templates tab → "Senior SWE" → "Bulk Create from Template"
4. Modal appears:
   ```
   ┌─────────────────────────────────────────────┐
   │  Create Multiple Agents from Template       │
   ├─────────────────────────────────────────────┤
   │  Template: Senior Software Engineer         │
   │                                             │
   │  Number of agents: [5] ▼                    │
   │                                             │
   │  Naming strategy:                           │
   │  ⚪ Sequential numbers (engineer-1, -2, -3) │
   │  ⚪ Custom prefix [eng-] + number           │
   │  ⚪ Custom suffix number + [-team]          │
   │  🔘 Manual list:                            │
   │     [engineer-alice  ]                      │
   │     [engineer-bob    ]                      │
   │     [engineer-charlie]                      │
   │     [engineer-dave   ]                      │
   │     [engineer-eve    ]                      │
   │                                             │
   │  Model assignment:                          │
   │  ⚪ Same for all: [claude-3-opus] ▼         │
   │  🔘 Custom per agent:                       │
   │     engineer-alice: [claude-3-opus] ▼       │
   │     engineer-bob: [claude-3-opus] ▼         │
   │     engineer-charlie: [claude-3-sonnet] ▼   │
   │     engineer-dave: [claude-3-sonnet] ▼      │
   │     engineer-eve: [claude-3-haiku] ▼        │
   │                                             │
   │  Communities (optional):                    │
   │  ☑ Add all to "Engineering Team"           │
   │                                             │
   │  [Cancel]              [Create 5 Agents]    │
   └─────────────────────────────────────────────┘
   ```
5. Click "Create 5 Agents"
6. Progress bar shows creation
7. **Time: 30 seconds total**

**Benefit (Bulk Create):**
- **14.5 minutes saved** vs manual
- **1.5 minutes saved** vs one-by-one import
- **Consistent configuration** across all agents
- **Advanced customization** (per-agent models, community assignment)
- **Shows template power** - this is what differentiates templates from cloning!

**Why This Matters:**
This is the **killer feature** that shows why templates are superior to simple cloning:
- **Clone:** 1 source → 1 copy (manual, slow)
- **Template + Bulk Create:** 1 blueprint → 5, 10, 50 agents (automated, fast)

**API Endpoint (Future):**
```typescript
POST /api/templates/agents/bulk-import
{
  templateSlug: "senior-software-engineer",
  agents: [
    { id: "engineer-alice", model: "claude-3-opus" },
    { id: "engineer-bob", model: "claude-3-opus" },
    { id: "engineer-charlie", model: "claude-3-sonnet" },
    { id: "engineer-dave", model: "claude-3-sonnet" },
    { id: "engineer-eve", model: "claude-3-haiku" }
  ],
  addToCommunities: ["Engineering Team"]
}

Response: {
  ok: true,
  created: ["engineer-alice", "engineer-bob", "engineer-charlie", "engineer-dave", "engineer-eve"]
}
```

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

## Part 3: Multiple Workspaces & Organizations

### 3.1 Problem Statement

**Current Architecture: Single Workspace**

Today, OpenClaw/ClawMax supports **one workspace** per installation:
- `~/.openclaw/workspace/` - single root directory
- `AGENTS/` - all agents live here
- `ORG/IDENTITY.md` - one organization identity
- Dashboard shows one organization view

**Limitations:**
1. **Cannot manage multiple organizations** (e.g., "Maximilien.ai" + "Acme Corp")
2. **No isolation between projects** (all agents share same namespace)
3. **Cannot switch contexts** (e.g., work org vs personal org)
4. **Templates can only create agents in current workspace** (no "create new org from template")

**User Needs (Why This Matters):**
- **Consultants:** Manage multiple client organizations separately
- **Agencies:** One org per client project
- **Developers:** Personal projects vs work projects
- **Testing:** Sandbox org to test templates before applying to production
- **Multi-tenancy:** Run multiple isolated organizations on same machine

---

### 3.2 Proposed Solution: Multi-Workspace Architecture

#### **Core Concept: Workspace = Organization**

One workspace = one complete organization with its own:
- Agents (`AGENTS/`)
- Communities + Groups
- Templates (`TEMPLATES/`)
- Configuration (`ORG/IDENTITY.md`)
- State (logs, message archives)

#### **Filesystem Structure**

**Before (Single Workspace):**
```
~/.openclaw/
└── workspace/
    ├── AGENTS/
    ├── ORG/
    ├── TEMPLATES/
    └── SYSTEM/
```

**After (Multi-Workspace):**
```
~/.openclaw/
├── workspaces/
│   ├── maximilien-ai/           # Workspace 1
│   │   ├── AGENTS/
│   │   ├── ORG/
│   │   │   └── IDENTITY.md (Name: Maximilien.ai)
│   │   ├── TEMPLATES/
│   │   └── .workspace-meta.json
│   ├── acme-corp/               # Workspace 2
│   │   ├── AGENTS/
│   │   ├── ORG/
│   │   │   └── IDENTITY.md (Name: Acme Corp)
│   │   ├── TEMPLATES/
│   │   └── .workspace-meta.json
│   └── personal/                # Workspace 3
│       ├── AGENTS/
│       ├── ORG/
│       ├── TEMPLATES/
│       └── .workspace-meta.json
├── SYSTEM/                      # Global (shared across workspaces)
│   └── dashboard/
└── config.json                  # Global workspace registry
```

**Key Files:**

**`~/.openclaw/config.json`** (Global registry)
```json
{
  "version": "1.0.0",
  "activeWorkspace": "maximilien-ai",
  "workspaces": [
    {
      "id": "maximilien-ai",
      "name": "Maximilien.ai",
      "path": "workspaces/maximilien-ai",
      "createdAt": "2026-02-20T10:00:00Z",
      "lastAccessedAt": "2026-02-24T15:30:00Z"
    },
    {
      "id": "acme-corp",
      "name": "Acme Corp",
      "path": "workspaces/acme-corp",
      "createdAt": "2026-02-24T12:00:00Z",
      "lastAccessedAt": "2026-02-24T14:00:00Z"
    }
  ]
}
```

**`.workspace-meta.json`** (Per-workspace metadata)
```json
{
  "id": "maximilien-ai",
  "name": "Maximilien.ai",
  "description": "First ClawMax organization",
  "createdAt": "2026-02-20T10:00:00Z",
  "createdFrom": {
    "type": "template",
    "templateSlug": "engineering-team",
    "importedAt": "2026-02-20T10:00:00Z"
  }
}
```

---

### 3.3 Dashboard UI: Workspace Switcher

#### **Option A: Top-Level Workspace Selector (Recommended)**

```
┌─────────────────────────────────────────────────────────────┐
│ 🏢 Maximilien.ai ▾  │  Agents  Templates  Organizations  … │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Current org content here]                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Click dropdown:
┌─────────────────────────┐
│ 🏢 Maximilien.ai   ✓    │ ← Active
│ 🏢 Acme Corp            │
│ 🏢 Personal             │
├─────────────────────────┤
│ + Create New Workspace  │
│ 📦 Import from Template │
└─────────────────────────┘
```

**Behavior:**
- Switching workspace **reloads dashboard** with new workspace data
- URL becomes: `http://localhost:5173/?workspace=acme-corp`
- Active workspace persists in localStorage + backend config

#### **Option B: Dedicated Workspaces Page**

New top-level tab: "Workspaces" (🌍 icon)

```
┌─────────────────────────────────────────────────────────────┐
│  Workspaces                                                  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ 🏢 Max.ai    │  │ 🏢 Acme Corp │  │ 🏢 Personal  │       │
│  │ 11 agents    │  │ 5 agents     │  │ 2 agents     │       │
│  │ 4 communities│  │ 2 communities│  │ 1 community  │       │
│  │ Last: 5m ago │  │ Last: 2h ago │  │ Last: 1d ago │       │
│  │ [Open →]     │  │ [Open →]     │  │ [Open →]     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  [+ Create New Workspace]  [📦 Import from Template]         │
└─────────────────────────────────────────────────────────────┘
```

**Recommendation:** Use **Option A** (top dropdown) - faster switching, less clicks

---

### 3.4 Backend Implementation

#### **Phase 1: Refactor to Workspace-Aware**

**Current:**
```typescript
export const WORKSPACE = process.env.OPENCLAW_WORKSPACE ||
  path.join(process.env.HOME || '', '.openclaw', 'workspace')
export const AGENTS_DIR = path.join(WORKSPACE, 'AGENTS')
```

**New:**
```typescript
// Global config
export const OPENCLAW_ROOT = path.join(process.env.HOME || '', '.openclaw')
export const WORKSPACES_DIR = path.join(OPENCLAW_ROOT, 'workspaces')
export const GLOBAL_CONFIG_PATH = path.join(OPENCLAW_ROOT, 'config.json')

// Active workspace (from request context or global state)
export function getActiveWorkspacePath(workspaceId?: string): string {
  const config = loadGlobalConfig()
  const id = workspaceId || config.activeWorkspace
  const workspace = config.workspaces.find(w => w.id === id)
  if (!workspace) throw new Error(`Workspace not found: ${id}`)
  return path.join(OPENCLAW_ROOT, workspace.path)
}

export function getAgentsDir(workspaceId?: string): string {
  return path.join(getActiveWorkspacePath(workspaceId), 'AGENTS')
}
```

**API Changes:**
```typescript
// All routes accept optional ?workspace= query param
GET /api/agents?workspace=acme-corp
GET /api/templates?workspace=maximilien-ai
POST /api/agents?workspace=acme-corp

// New workspace management routes
GET  /api/workspaces                  // List all workspaces
POST /api/workspaces                  // Create new workspace
GET  /api/workspaces/:id              // Get workspace details
PUT  /api/workspaces/:id/activate     // Switch active workspace
DELETE /api/workspaces/:id            // Delete workspace
```

#### **Phase 2: Workspace Creation from Templates**

**New Flow:**
1. User clicks "📦 Import from Template" on Workspaces page
2. Select organization template (e.g., "Engineering Team")
3. Modal:
   ```
   New Workspace from Template

   Template: Engineering Team (11 agents)

   Workspace ID: [acme-corp]  (lowercase, alphanumeric, dashes)
   Workspace Name: [Acme Corp]
   Description: [New client project]

   Agent Prefix: [acme-]  (optional)

   [Cancel] [Create Workspace]
   ```
4. Backend creates:
   - `workspaces/acme-corp/` directory
   - Imports all agents from template
   - Creates `ORG/IDENTITY.md` with workspace name
   - Adds entry to global `config.json`
5. Dashboard switches to new workspace

**API:**
```typescript
POST /api/workspaces/from-template
{
  "templateSlug": "engineering-team",
  "workspaceId": "acme-corp",
  "workspaceName": "Acme Corp",
  "description": "New client project",
  "agentPrefix": "acme-"
}

Response:
{
  "ok": true,
  "workspace": {
    "id": "acme-corp",
    "name": "Acme Corp",
    "agentCount": 11,
    "path": "workspaces/acme-corp"
  }
}
```

---

### 3.5 Migration Strategy

#### **Step 1: Grandfather Existing Workspace**

On first launch with multi-workspace code:
1. Detect old single workspace at `~/.openclaw/workspace/`
2. Automatically migrate:
   ```bash
   mv ~/.openclaw/workspace ~/.openclaw/workspaces/default
   ```
3. Create `config.json`:
   ```json
   {
     "activeWorkspace": "default",
     "workspaces": [{
       "id": "default",
       "name": "Maximilien.ai",  // Read from ORG/IDENTITY.md
       "path": "workspaces/default",
       "createdAt": "2026-02-24T00:00:00Z"
     }]
   }
   ```
4. Dashboard loads as before (no breaking changes for user)

#### **Step 2: Enable Multi-Workspace UI**

- Show workspace switcher dropdown
- "You have 1 workspace. Create more to manage multiple organizations."

#### **Step 3: User Adoption**

Users can now:
1. Create second workspace from template
2. Create blank workspace
3. Switch between workspaces via dropdown

**No disruption to existing workflow.**

---

### 3.6 Use Cases Enabled

#### **Use Case 1: Agency Managing Multiple Clients**

**Before:** All client agents mixed together in one AGENTS/ directory
- `acme-engineer-1`, `acme-engineer-2`
- `beta-pm`, `beta-qa`
- Namespace collisions, hard to organize

**After:** Each client = separate workspace
- Switch to "Acme Corp" workspace → See only Acme agents
- Switch to "Beta Inc" workspace → See only Beta agents
- Clean separation, no naming conflicts

#### **Use Case 2: Testing Templates Safely**

**Before:** Applying template creates agents in production workspace
- No easy way to preview/test
- Risk of polluting production

**After:**
1. Create "sandbox" workspace
2. Import template → test it out
3. If good: Import to production workspace
4. If bad: Delete sandbox workspace

#### **Use Case 3: Personal vs Work Separation**

**Before:** Mix personal experiments with work agents

**After:**
- "Work" workspace: Client agents
- "Personal" workspace: Learning/experiments
- Switch with one click

#### **Use Case 4: Bulk Organization Creation**

**Before:** Manual one-by-one agent creation

**After:**
1. Perfect an organization in "maximilien-ai" workspace
2. Export as template
3. Create 5 new client workspaces from template in 2 minutes each
4. Each client gets isolated, identical starting organization

---

### 3.7 Technical Challenges & Solutions

#### **Challenge 1: Port Conflicts**

**Problem:** Multiple workspaces might have agents with same port numbers

**Solution:**
- Each workspace has isolated port allocation
- Workspace meta stores port range: `{ "portRangeStart": 18789, "portRangeEnd": 19789 }`
- Or: Ports are globally unique (assigned from global pool)

#### **Challenge 2: State Directory Conflicts**

**Problem:** `~/.clawmax/state/` has agent state - how to separate?

**Solution:**
- Move state into workspace: `workspaces/acme-corp/.state/`
- Or: Use namespaced state: `~/.clawmax/state/acme-corp/`

#### **Challenge 3: Running Agents Across Workspaces**

**Problem:** User switches workspace while agents are running in other workspace

**Solution:**
- Dashboard shows **all running agents across all workspaces**
- Workspace switcher shows active agents count: "🏢 Acme Corp (2 running)"
- Switching workspace doesn't stop agents - just changes view

#### **Challenge 4: Global vs Per-Workspace Templates**

**Problem:** Should templates be per-workspace or global?

**Solution A (Recommended):** Per-Workspace Templates
- Each workspace has own `TEMPLATES/` directory
- Export template in workspace A → only visible in workspace A
- **Why:** Templates often context-specific to that organization

**Solution B:** Global Templates + Per-Workspace
- `~/.openclaw/templates/` (global shared)
- `workspaces/acme-corp/TEMPLATES/` (workspace-specific)
- Template browser shows both with labels

**Recommendation:** Start with per-workspace (simpler), add global later if needed

---

### 3.8 Implementation Phases

#### **Phase 1: Backend Refactor (Week 1)**
- ✅ Multi-workspace file structure
- ✅ Global config.json
- ✅ Workspace-aware APIs (`?workspace=` param)
- ✅ Auto-migration of existing workspace
- ✅ Basic workspace CRUD (create, list, delete)

**Deliverable:** Can create/switch workspaces via API

#### **Phase 2: Dashboard UI (Week 1-2)**
- ✅ Workspace dropdown in top nav
- ✅ Workspace switcher logic (reload with new workspace)
- ✅ "Create Workspace" modal
- ✅ Workspace settings page

**Deliverable:** Can switch workspaces in UI

#### **Phase 3: Template Integration (Week 2)**
- ✅ "Import from Template" → creates new workspace
- ✅ Per-workspace template storage
- ✅ Template export includes workspace metadata

**Deliverable:** Can create workspace from org template

#### **Phase 4: Polish & Edge Cases (Week 3)**
- ✅ Running agents indicator per workspace
- ✅ Port allocation strategy
- ✅ State directory isolation
- ✅ Bulk workspace operations
- ✅ Workspace archiving

**Deliverable:** Production-ready multi-workspace

---

### 3.9 Open Questions for Review

1. **Template Storage:** Per-workspace or global? (Leaning per-workspace)
2. **Port Allocation:** Isolated ranges per workspace or global pool?
3. **Active Workspace Persistence:** localStorage only or backend config?
4. **Workspace Deletion:** Soft delete (archive) or hard delete?
5. **Workspace Limits:** Max number of workspaces? (e.g., 50)
6. **Import/Export Workspace:** Export entire workspace as .zip?

---

### 3.10 Future Enhancements

**Phase 5+: Advanced Features**
- **Workspace Cloning:** Duplicate workspace A → workspace B
- **Workspace Snapshots:** Save state, restore later
- **Workspace Sharing:** Export workspace as shareable bundle
- **Cloud Sync:** Sync workspaces across machines
- **Workspace Templates:** Save workspace structure as template (meta-template)
- **Multi-Workspace Dashboard:** View all workspaces side-by-side
- **Workspace Analytics:** Compare metrics across workspaces

---

**End of Design Document**

*Ready for review and feedback.*
