# Agent Templates - Organizational Structure Templates

**Status:** Planned → **SCHEDULED FOR NEXT WEEK** (Feb 24-28)
**Priority:** High
**Estimated Effort:** 3-4 hours
**Created:** 2026-02-19
**Scheduled Start:** 2026-02-24

**Why Next Week:**
This is a BIG feature that enables rapid agent creation and organizational scaling. Builds on schema validation infrastructure being completed this weekend.

## Overview

Create **reusable templates** that define entire organizational structures (communities + groups of agents) that can be instantiated as a unit. Think "org chart templates" or "team blueprints" for agents - enabling rapid deployment of proven agent configurations.

## Problem Statement

Currently, users must:
- Create agents one-by-one manually
- Manually configure groups and communities
- Repeat the same setup across projects/teams
- Rebuild proven team structures from scratch

**Challenge:** No way to codify and reuse successful agent organizational patterns.

**Opportunity:** Enable template-based deployment of entire agent organizations.

## Key Benefits

- ✅ **Repeatable structures** - Deploy proven team configurations instantly
- ✅ **Organizational patterns** - Codify best practices for agent collaboration
- ✅ **Rapid scaling** - Spin up entire departments/teams at once
- ✅ **Versioned evolution** - Templates evolve, instances can upgrade
- ✅ **Knowledge sharing** - Share templates across teams/orgs
- ✅ **Consistency** - Ensure standard team structures
- ✅ **Marketplace potential** - Community-contributed templates (future)

## Use Cases

### 1. Software Development Team
**Scenario:** Need a complete dev team for new project
**Template:** `dev-team`

```
Community: Engineering
├─ Group: Backend Team
│  ├─ backend-lead (senior-engineer template)
│  ├─ backend-dev-1 (engineer template)
│  └─ backend-dev-2 (engineer template)
├─ Group: Frontend Team
│  ├─ frontend-lead (senior-engineer template)
│  └─ frontend-dev (engineer template)
└─ Group: DevOps
   ├─ devops-lead (devops-engineer template)
   └─ sre (reliability-engineer template)
```

**Value:** Deploy 7-agent development org in 2 minutes vs 30+ minutes manual

### 2. Product Organization
**Scenario:** Launching new product line, need PM team
**Template:** `product-org`

```
Community: Product
├─ Group: Product Management
│  ├─ product-manager
│  └─ product-owner
├─ Group: Design
│  ├─ ux-designer
│  └─ ui-designer
└─ Group: Research
   └─ user-researcher
```

**Value:** Complete product org with research, design, and management

### 3. Customer Success
**Scenario:** Scale support as user base grows
**Template:** `customer-success`

```
Community: Customer Success
├─ Group: Support Tier 1
│  ├─ support-agent-1
│  ├─ support-agent-2
│  └─ support-agent-3
├─ Group: Support Tier 2
│  ├─ technical-support-1
│  └─ technical-support-2
└─ Group: Account Management
   └─ account-manager
```

**Value:** Multi-tier support structure with escalation paths

### 4. Startup MVP Team
**Scenario:** New startup needs complete tech + product team
**Template:** `startup-mvp`

```
Community: Startup Core
├─ Group: Product
│  ├─ product-manager
│  └─ designer
├─ Group: Engineering
│  ├─ fullstack-engineer
│  └─ devops-engineer
└─ Group: Growth
   └─ growth-hacker
```

**Value:** Minimum viable team to launch and iterate

## Template Structure

### Directory Layout

```
TEMPLATES/
├─ README.md                      # Template system overview
│
├─ dev-team/                      # Template: Development Team
│  ├─ TEMPLATE.md                # Metadata & documentation
│  ├─ structure.yaml             # Community/group/agent hierarchy
│  ├─ agents/                    # Agent definitions
│  │  ├─ backend-lead/
│  │  │  ├─ IDENTITY.md
│  │  │  ├─ SOUL.md
│  │  │  └─ TOOLS.md
│  │  ├─ backend-dev/
│  │  │  ├─ IDENTITY.md
│  │  │  ├─ SOUL.md
│  │  │  └─ TOOLS.md
│  │  ├─ frontend-lead/
│  │  │  └─ ...
│  │  ├─ frontend-dev/
│  │  │  └─ ...
│  │  ├─ devops-lead/
│  │  │  └─ ...
│  │  └─ sre/
│  │     └─ ...
│  └─ routing-rules.yaml         # WhatsApp routing (optional)
│
├─ product-org/                   # Template: Product Organization
│  ├─ TEMPLATE.md
│  ├─ structure.yaml
│  └─ agents/
│     └─ ...
│
└─ customer-success/              # Template: Customer Success
   ├─ TEMPLATE.md
   ├─ structure.yaml
   └─ agents/
      └─ ...
```

### Template Metadata (`TEMPLATE.md`)

```markdown
# Dev Team Template

**Version:** 1.0.0
**Author:** Maximilien
**Created:** 2026-02-19
**Last Updated:** 2026-02-19
**Description:** Full-stack development team with backend, frontend, and DevOps groups

## Overview
Complete software development team suitable for web/mobile application development. Includes specialized roles for backend, frontend, and infrastructure.

## Structure
- **Communities:** 1 (Engineering)
- **Groups:** 3 (Backend Team, Frontend Team, DevOps)
- **Agents:** 7 total
  - 2 Senior/Lead roles
  - 5 Individual contributor roles

## Prerequisites
- OpenAI API key or Anthropic API key
- Recommended models:
  - Leads: `anthropic/claude-sonnet-4-5`
  - ICs: `openai/gpt-4o`
- Optional: WhatsApp numbers for group routing

## Customization Points
- **Team sizes:** Adjust number of backend/frontend devs via variables
- **Models:** Change per agent role or use single model for all
- **Expertise:** Modify SOUL.md to specialize (e.g., Python vs Node.js)
- **Tools:** Add custom tools per agent in TOOLS.md

## Variables
- `instance_name`: Prefix for agent IDs (default: "dev")
- `backend_team_size`: Number of backend devs (default: 2)
- `frontend_team_size`: Number of frontend devs (default: 1)
- `default_model`: Model for all agents (default: "openai/gpt-4o")
- `lead_model`: Model for lead agents (default: "anthropic/claude-sonnet-4-5")

## Usage
1. Click "Use Template" in dashboard
2. Configure instance name and variables
3. Review agent roster
4. Instantiate (creates all agents + groups)
5. Optional: Link WhatsApp numbers for group chat

## Cost Estimate
- ~7 agents × ~$0.10/1000 tokens = Low cost for experimentation
- Scale up team sizes as needed
```

### Structure Definition (`structure.yaml`)

```yaml
# Template Definition
template:
  name: dev-team
  version: 1.0.0
  description: Full-stack development team
  author: Maximilien

# Variables (user-configurable)
variables:
  instance_name:
    type: string
    default: dev
    description: Prefix for agent IDs

  backend_team_size:
    type: integer
    default: 2
    min: 1
    max: 10
    description: Number of backend developers

  frontend_team_size:
    type: integer
    default: 1
    min: 1
    max: 10
    description: Number of frontend developers

  default_model:
    type: string
    default: openai/gpt-4o
    options:
      - openai/gpt-4o
      - openai/gpt-4o-mini
      - anthropic/claude-sonnet-4-5
      - anthropic/claude-opus-4
    description: Model for most agents

  lead_model:
    type: string
    default: anthropic/claude-sonnet-4-5
    options:
      - anthropic/claude-sonnet-4-5
      - anthropic/claude-opus-4
      - openai/gpt-4o
    description: Model for lead/senior agents

# Community & Group Structure
communities:
  - name: Engineering
    description: Software development community

    groups:
      # Backend Team
      - name: Backend Team
        description: Backend infrastructure and APIs

        agents:
          - id: "{{instance_name}}-backend-lead"
            name: Backend Lead
            template: agents/backend-lead
            model: "{{lead_model}}"
            tags: [engineering, backend, lead]

          - id: "{{instance_name}}-backend-dev-{{index}}"
            name: Backend Developer {{index}}
            template: agents/backend-dev
            model: "{{default_model}}"
            tags: [engineering, backend]
            count: "{{backend_team_size}}"  # Creates N instances

      # Frontend Team
      - name: Frontend Team
        description: UI/UX and frontend development

        agents:
          - id: "{{instance_name}}-frontend-lead"
            name: Frontend Lead
            template: agents/frontend-lead
            model: "{{lead_model}}"
            tags: [engineering, frontend, lead]

          - id: "{{instance_name}}-frontend-dev-{{index}}"
            name: Frontend Developer {{index}}
            template: agents/frontend-dev
            model: "{{default_model}}"
            tags: [engineering, frontend]
            count: "{{frontend_team_size}}"

      # DevOps Team
      - name: DevOps
        description: Infrastructure and reliability

        agents:
          - id: "{{instance_name}}-devops-lead"
            name: DevOps Lead
            template: agents/devops-lead
            model: "{{lead_model}}"
            tags: [engineering, devops, lead]

          - id: "{{instance_name}}-sre"
            name: Site Reliability Engineer
            template: agents/sre
            model: "{{default_model}}"
            tags: [engineering, devops, sre]

# Optional: WhatsApp Routing
routing:
  - group: Backend Team
    whatsapp: +1234567890  # Optional
    route_to:
      - "{{instance_name}}-backend-lead"
      - "{{instance_name}}-backend-dev-1"

  - group: Frontend Team
    whatsapp: +1234567891  # Optional
    route_to:
      - "{{instance_name}}-frontend-lead"
```

### Agent Template Example (`agents/backend-lead/IDENTITY.md`)

```markdown
# IDENTITY.md - Who Am I?

- **Name:** {{agent_name}}
- **Role:** Backend Lead Engineer
- **Team:** Backend Team
- **Community:** Engineering
- **Expertise:** System architecture, API design, database optimization
- **Vibe:** Authoritative yet collaborative, detail-oriented
- **Experience:** 10+ years building scalable backend systems
- **Tags:** {{tags}}

## Responsibilities
- Lead backend architecture decisions
- Mentor backend developers
- Review PRs and ensure code quality
- Design scalable API patterns
- Optimize database performance
- Set backend best practices

## Communication Style
- Clear technical explanations
- Proactive problem identification
- Collaborative decision-making
- Mentorship-oriented
```

## Dashboard Integration

### 1. Templates Tab in Dashboard

Add new top-level tab: **"Templates"**

```
┌─────────────────────────────────────────────┐
│  Agents | Templates | Activity | Docs       │
├─────────────────────────────────────────────┤
│ 📋 Agent Templates                          │
│                                             │
│ Browse and deploy organizational templates │
│                            [Create Template]│
│                                             │
│ ┌─────────────────────────────────────┐   │
│ │ 👨‍💻 Dev Team                   v1.0.0 │   │
│ │ Full-stack development team           │   │
│ │ 1 community • 3 groups • 7 agents     │   │
│ │ By: Maximilien                        │   │
│ │                                       │   │
│ │              [View] [Use Template]   │   │
│ └─────────────────────────────────────┘   │
│                                             │
│ ┌─────────────────────────────────────┐   │
│ │ 📦 Product Org                v1.0.0 │   │
│ │ Product management organization       │   │
│ │ 1 community • 3 groups • 5 agents     │   │
│ │ By: Maximilien                        │   │
│ │                                       │   │
│ │              [View] [Use Template]   │   │
│ └─────────────────────────────────────┘   │
│                                             │
│ ┌─────────────────────────────────────┐   │
│ │ 🎧 Customer Success          v1.0.0 │   │
│ │ Multi-tier support organization       │   │
│ │ 1 community • 3 groups • 6 agents     │   │
│ │ By: Maximilien                        │   │
│ │                                       │   │
│ │              [View] [Use Template]   │   │
│ └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 2. Template Instantiation Wizard

**Step 1: Configure**
```
┌─────────────────────────────────────────────┐
│ Use Template: Dev Team                   × │
├─────────────────────────────────────────────┤
│ Step 1 of 3: Configure                      │
│                                             │
│ Instance Name:                              │
│ [platform-team____________]                 │
│ (Used as prefix for agent IDs)             │
│                                             │
│ Customize team sizes:                       │
│ Backend devs:  [▼] [2]                     │
│ Frontend devs: [▼] [1]                     │
│                                             │
│ Model Configuration:                        │
│ Lead agents:    [claude-sonnet-4-5    ▼]   │
│ Other agents:   [gpt-4o               ▼]   │
│                                             │
│ Optional WhatsApp Integration:              │
│ ☐ Configure WhatsApp group routing         │
│                                             │
│                    [Cancel] [Next: Review] │
└─────────────────────────────────────────────┘
```

**Step 2: Review**
```
┌─────────────────────────────────────────────┐
│ Use Template: Dev Team                   × │
├─────────────────────────────────────────────┤
│ Step 2 of 3: Review                         │
│                                             │
│ The following will be created:             │
│                                             │
│ Communities: 1                              │
│ └─ Engineering                              │
│                                             │
│ Groups: 3                                   │
│ ├─ Backend Team (3 agents)                 │
│ ├─ Frontend Team (2 agents)                │
│ └─ DevOps (2 agents)                       │
│                                             │
│ Agents: 7                                   │
│ ☑ platform-backend-lead                    │
│ ☑ platform-backend-dev-1                   │
│ ☑ platform-backend-dev-2                   │
│ ☑ platform-frontend-lead                   │
│ ☑ platform-frontend-dev-1                  │
│ ☑ platform-devops-lead                     │
│ ☑ platform-sre                             │
│                                             │
│ Deselect agents to skip                    │
│                                             │
│              [Back] [Cancel] [Instantiate] │
└─────────────────────────────────────────────┘
```

**Step 3: Provisioning**
```
┌─────────────────────────────────────────────┐
│ Creating: Dev Team                        × │
├─────────────────────────────────────────────┤
│ Step 3 of 3: Provisioning                   │
│                                             │
│ Creating agents...                          │
│                                             │
│ ✓ platform-backend-lead         [Complete] │
│ ✓ platform-backend-dev-1        [Complete] │
│ ⟳ platform-backend-dev-2        [Creating] │
│ ○ platform-frontend-lead        [Pending]  │
│ ○ platform-frontend-dev-1       [Pending]  │
│ ○ platform-devops-lead          [Pending]  │
│ ○ platform-sre                  [Pending]  │
│                                             │
│ Progress: 2/7 agents (28%)                 │
│ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░                  │
│                                             │
│                                [Cancel]     │
└─────────────────────────────────────────────┘
```

### 3. Create Template Flow

**Save Current Setup as Template**
```
┌─────────────────────────────────────────────┐
│ Create Template from Current Agents       × │
├─────────────────────────────────────────────┤
│                                             │
│ Template Name:                              │
│ [my-custom-team________]                   │
│                                             │
│ Description:                                │
│ [Our proven team structure for...     ]   │
│ [                                      ]   │
│                                             │
│ Version:                                    │
│ [1.0.0_____]                               │
│                                             │
│ Select agents to include:                   │
│ ☑ engineer         [engineering]           │
│ ☑ product-manager  [product]               │
│ ☑ qa-engineer      [engineering, qa]       │
│ ☐ max0             [assistant]             │
│                                             │
│ Group Structure (detected):                 │
│ Community: Engineering                      │
│ ├─ Group: Backend (2 agents)               │
│ └─ Group: QA (1 agent)                     │
│                                             │
│ Community: Product                          │
│ └─ Group: Management (1 agent)             │
│                                             │
│              [Cancel] [Create Template]    │
└─────────────────────────────────────────────┘
```

## Technical Architecture

### Backend API

#### Endpoint: `GET /api/templates`

**Response:**
```json
{
  "templates": [
    {
      "name": "dev-team",
      "version": "1.0.0",
      "description": "Full-stack development team",
      "author": "Maximilien",
      "communities": 1,
      "groups": 3,
      "agents": 7,
      "path": "TEMPLATES/dev-team"
    }
  ]
}
```

**Implementation:**
```typescript
router.get('/templates', (_req, res) => {
  const templatesDir = path.join(WORKSPACE, 'TEMPLATES')
  const templates: TemplateInfo[] = []

  const dirs = fs.readdirSync(templatesDir, { withFileTypes: true })
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue

    const structurePath = path.join(templatesDir, dir.name, 'structure.yaml')
    if (!fs.existsSync(structurePath)) continue

    const structure = yaml.parse(fs.readFileSync(structurePath, 'utf-8'))
    templates.push({
      name: structure.template.name,
      version: structure.template.version,
      description: structure.template.description,
      // ... count communities/groups/agents
    })
  }

  res.json({ templates })
})
```

#### Endpoint: `POST /api/templates/instantiate`

**Request:**
```json
{
  "templateName": "dev-team",
  "instanceName": "platform-team",
  "variables": {
    "backend_team_size": 2,
    "frontend_team_size": 1,
    "default_model": "openai/gpt-4o",
    "lead_model": "anthropic/claude-sonnet-4-5"
  },
  "selectedAgentIds": [
    "backend-lead",
    "backend-dev",
    "frontend-lead"
  ]
}
```

**Response:** SSE stream
```
data: {"type":"start","total":7}
data: {"type":"agent","agentId":"platform-backend-lead","status":"creating"}
data: {"type":"agent","agentId":"platform-backend-lead","status":"complete"}
data: {"type":"agent","agentId":"platform-backend-dev-1","status":"creating"}
...
data: {"type":"done","created":7}
```

**Implementation:**
```typescript
router.post('/templates/instantiate', async (req, res) => {
  const { templateName, instanceName, variables, selectedAgentIds } = req.body

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Load template
  const templatePath = path.join(WORKSPACE, 'TEMPLATES', templateName)
  const structure = yaml.parse(
    fs.readFileSync(path.join(templatePath, 'structure.yaml'), 'utf-8')
  )

  // Resolve variables
  const resolved = resolveVariables(structure, variables)

  // Create agents in parallel
  const agentsToCreate = expandAgentDefinitions(resolved, selectedAgentIds)

  send({ type: 'start', total: agentsToCreate.length })

  for (const agentDef of agentsToCreate) {
    send({ type: 'agent', agentId: agentDef.id, status: 'creating' })

    try {
      // Copy template files
      await copyAgentTemplate(
        path.join(templatePath, 'agents', agentDef.template),
        path.join(AGENTS_DIR, agentDef.id),
        agentDef
      )

      // Register with openclaw
      await registerAgent(agentDef)

      send({ type: 'agent', agentId: agentDef.id, status: 'complete' })
    } catch (err) {
      send({ type: 'agent', agentId: agentDef.id, status: 'error', error: String(err) })
    }
  }

  send({ type: 'done', created: agentsToCreate.length })
  res.end()
})
```

#### Endpoint: `POST /api/templates/create`

**Request:**
```json
{
  "name": "my-custom-team",
  "description": "Our proven team structure",
  "version": "1.0.0",
  "agentIds": ["engineer", "product-manager", "qa-engineer"],
  "detectStructure": true
}
```

**Response:**
```json
{
  "ok": true,
  "templatePath": "TEMPLATES/my-custom-team",
  "structure": {
    "communities": 2,
    "groups": 3,
    "agents": 3
  }
}
```

### Frontend Components

#### 1. `TemplatesPage.tsx`
- Grid of available templates
- Search/filter templates
- View template details
- Launch instantiation wizard

#### 2. `TemplateInstantiationWizard.tsx`
- Multi-step wizard (Configure → Review → Provision)
- Variable configuration form
- Agent selection checkboxes
- SSE progress tracking

#### 3. `CreateTemplateWizard.tsx`
- Select agents to include
- Auto-detect group/community structure
- Edit template metadata
- Export to TEMPLATES/

### Variable Resolution

**Template variables support:**
- `{{instance_name}}` - User-provided prefix
- `{{index}}` - Auto-increment for arrays
- `{{agent_name}}` - Resolved agent name
- `{{tags}}` - Comma-separated tags
- Custom variables from `variables:` block

**Resolution engine:**
```typescript
function resolveVariables(structure: any, vars: Record<string, any>): any {
  return JSON.parse(
    JSON.stringify(structure).replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return vars[key] ?? key
    })
  )
}
```

### Template Metadata Storage

Each instantiated agent stores template metadata:

```json
// AGENTS/{agent-id}/.openclaw/template.json
{
  "templateName": "dev-team",
  "templateVersion": "1.0.0",
  "instanceName": "platform-team",
  "createdAt": "2026-02-19T12:00:00Z",
  "variables": {
    "backend_team_size": 2,
    "default_model": "openai/gpt-4o"
  }
}
```

**Benefits:**
- Track which agents came from which template
- Support template upgrades
- Show "Created from template" badge in UI
- Enable template-based bulk operations

## Implementation Plan

### Phase 1: Core Infrastructure (1.5 hours)

**Backend (45 min):**
- [ ] Create TEMPLATES/ directory structure
- [ ] Implement template YAML parser
- [ ] Create `GET /api/templates` endpoint
- [ ] Create `POST /api/templates/instantiate` endpoint with SSE
- [ ] Implement variable resolution engine
- [ ] Add template metadata storage (.openclaw/template.json)

**Frontend (45 min):**
- [ ] Create TemplatesPage.tsx component
- [ ] Create template card components
- [ ] Add "Templates" tab to dashboard navigation
- [ ] Implement template listing with metadata

### Phase 2: Instantiation Wizard (1.5 hours)

**Frontend (1.5 hours):**
- [ ] Create TemplateInstantiationWizard.tsx
- [ ] Step 1: Configuration form with variables
- [ ] Step 2: Review screen with agent selection
- [ ] Step 3: Provisioning with SSE progress
- [ ] Integration with agents page
- [ ] Error handling and retry logic

### Phase 3: Built-in Templates (30 min)

**Content creation:**
- [ ] Create `dev-team` template
  - structure.yaml
  - TEMPLATE.md
  - 7 agent definitions
- [ ] Create `product-org` template
  - structure.yaml
  - TEMPLATE.md
  - 5 agent definitions
- [ ] Create `customer-success` template
  - structure.yaml
  - TEMPLATE.md
  - 6 agent definitions
- [ ] Update TEMPLATES/README.md

### Phase 4: Template Creation (1 hour - Optional)

**Backend (30 min):**
- [ ] Create `POST /api/templates/create` endpoint
- [ ] Implement structure detection from existing agents
- [ ] Export template files to TEMPLATES/

**Frontend (30 min):**
- [ ] Create CreateTemplateWizard.tsx
- [ ] Agent multi-select
- [ ] Metadata form
- [ ] Structure preview
- [ ] Export functionality

### Phase 5: Enhanced Features (30 min - Optional)

- [ ] Template version comparison
- [ ] "Update available" notifications
- [ ] Template search/filter
- [ ] Template tags/categories
- [ ] Template preview (dry-run)
- [ ] Bulk agent operations by template

## Edge Cases & Considerations

### 1. Agent ID Conflicts
**Problem:** Template wants to create `backend-dev-1` but it already exists
**Solutions:**
- Auto-increment: `backend-dev-1` → `backend-dev-2`
- Prefix with instance name: `platform-backend-dev-1`
- Show error, let user rename
**Recommendation:** Use instance name prefix (clearest)

### 2. Partial Instantiation Failures
**Problem:** 3 of 7 agents created successfully, then error
**Solution:**
- Continue creating remaining agents (log errors)
- Show summary: "5/7 created, 2 failed"
- Provide retry for failed agents
- Don't rollback successful agents

### 3. Template Version Evolution
**Problem:** Template updated to v1.1.0, user has v1.0.0 instance
**Solution:**
- Store template version in agent metadata
- Show "Update available" badge
- Provide upgrade wizard (opt-in only)
- Document breaking changes

### 4. Variable Validation
**Problem:** User enters invalid variable (e.g., team_size = -1)
**Solution:**
- Define validation rules in structure.yaml (min/max/type)
- Validate in wizard before allowing "Next"
- Show helpful error messages

### 5. WhatsApp Number Scarcity
**Problem:** Template requires WhatsApp numbers, user doesn't have enough
**Solution:**
- Make WhatsApp optional in templates
- Skip routing setup if numbers not provided
- Show warning: "WhatsApp routing not configured"

### 6. Large Template Instantiation
**Problem:** 50-agent template takes 10+ minutes
**Solution:**
- Show realistic time estimate before starting
- Allow cancellation mid-process
- Implement parallel creation (careful with rate limits)
- Resume capability if interrupted

## Integration with Other Features

### Multiagent Group Chat
**Synergy:**
- Template defines groups
- One-click "Chat with Backend Team" for template instances
- Preset group chats based on template structure
- Template groups → dashboard group chat presets

**Example:**
```
Template: dev-team
└─ Groups:
   ├─ Backend Team → [Quick Group Chat]
   ├─ Frontend Team → [Quick Group Chat]
   └─ DevOps → [Quick Group Chat]
```

### Agent Cloning
**Relationship:**
- Template instantiation uses agent cloning under the hood
- Each template agent is a "clone source"
- Variables customize the clone
- Templates = structured bulk cloning

### Dashboard Views
**Template-aware views:**
- Filter agents by template instance
- Show template badge on agent cards
- "View template source" button
- Template-based organization in agent list

## Success Metrics

- [ ] Users create 3+ template instances
- [ ] 50%+ of new agents come from templates (vs manual creation)
- [ ] Average template instantiation time: <3 minutes
- [ ] Template reuse across projects/teams
- [ ] Community creates custom templates
- [ ] Template marketplace requests (signals demand)

## Future Enhancements

### V2: Template Inheritance
```yaml
# Inherits from base template
extends: templates/base-team

# Override specific agents
overrides:
  agents:
    - id: specialized-backend-dev
      template: agents/ml-engineer  # Different from base
```

### V3: Template Marketplace
- Community-contributed templates
- Template discovery/search
- Rating and reviews
- One-click install from gallery
- Template categories (dev, product, support, etc.)

### V4: Template Composition
```yaml
# Composite template
includes:
  - template: dev-team
    prefix: platform-
  - template: product-org
    prefix: product-
  - template: customer-success
    prefix: support-
```

### V5: Template Workflows
- Multi-step templates (onboarding, project setup)
- Conditional agent creation based on choices
- Post-instantiation automation (run scripts, configure tools)

## Open Questions & Decisions

### 1. Template Storage Location
**Options:**
- Git-versioned in TEMPLATES/ (current plan)
- Database for faster querying
- Hybrid: metadata in DB, files in git

**Decision:** Git-versioned ✅
- Easy version control
- Portable across installs
- Supports community contributions

### 2. Naming Conflicts Resolution
**Options:**
- Auto-increment numeric suffix
- Prefix with instance name
- Prompt user to resolve manually

**Decision:** Instance name prefix ✅
- Most explicit and clear
- Prevents collisions naturally
- User controls naming

### 3. Partial Agent Selection
**Should users be able to skip some agents from template?**

**Decision:** Yes ✅
- Flexibility for customization
- Use checkboxes in review step
- Maintain group structure even if partial

### 4. WhatsApp Integration
**Auto-configure WhatsApp routing from template?**

**Decision:** Optional, user provides numbers ✅
- Template can specify routing structure
- User maps their numbers during instantiation
- Skip if no numbers available

### 5. Template Updates
**How to handle template upgrades for existing instances?**

**Decision:** Opt-in upgrade wizard ✅
- Show "Update available" notification
- User reviews changes before applying
- Document breaking changes in template
- Support rollback

## References

- Agent cloning: `server/routes/agents.ts` (cloneAgentFiles)
- Agent creation wizard: `client/src/components/AddAgentWizard.tsx`
- YAML parsing: Use `js-yaml` library
- SSE implementation: `server/routes/agents.ts` (provision endpoint)

## Example Templates to Ship

### 1. dev-team
- Full-stack development team
- 3 groups, 7 agents
- Production-ready for web/mobile apps

### 2. product-org
- Complete product organization
- Research, design, PM
- 3 groups, 5 agents

### 3. customer-success
- Multi-tier support structure
- T1, T2, account management
- 3 groups, 6 agents

### 4. startup-mvp
- Minimum viable team for startups
- Product, engineering, growth
- 3 groups, 5 agents

### 5. data-team
- Data science and analytics
- Data engineers, analysts, ML engineers
- 2 groups, 5 agents

---

**Ready to implement! Let's build this. 🚀**
