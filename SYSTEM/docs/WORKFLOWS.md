# Workflows System Design

**Version:** 1.0
**Status:** Design Review
**Last Updated:** 2026-03-04

---

## Purpose

Workflows enable scheduled, recurring tasks to be executed across one or more agents in the ClawMax organization. Examples include:
- Daily standup reports from all agents
- Weekly progress summaries
- Periodic health checks
- Scheduled maintenance tasks
- Coordinated multi-agent actions

---

## Design Principles

1. **File-based storage** - Workflows stored as markdown files with YAML frontmatter (same pattern as agent docs)
2. **Agent targeting flexibility** - Target agents by communities, groups, tags, or individual IDs
3. **Human-readable** - Workflows are plain text, editable in any text editor
4. **Cron-based scheduling** - Standard cron syntax for scheduling
5. **No execution engine (v1)** - v0.9.0 stores workflows only; execution engine in future release

---

## File Structure

### Workspace Layout
```
~/.openclaw/workspace/
├── WORKFLOWS/
│   ├── daily-standup.md
│   ├── weekly-summary.md
│   ├── health-check.md
│   └── ...
├── AGENTS/
│   ├── max0/
│   ├── max1/
│   └── ...
└── openclaw.json
```

### Workflow File Format

Each workflow is a markdown file with YAML frontmatter:

```yaml
---
id: daily-standup
name: Daily Standup Report
description: Collect daily standup reports from all engineering agents
schedule: "0 9 * * 1-5"  # 9am Mon-Fri
enabled: true
targeting:
  communities: []
  groups: ["engineering"]
  tags: ["developer", "qa"]
  agents: []
created: 2026-03-04T10:00:00Z
modified: 2026-03-04T10:00:00Z
author: max
---

# Daily Standup Report

Generate a brief standup report covering:
1. What you accomplished yesterday
2. What you're working on today
3. Any blockers or concerns

Keep it concise (3-5 sentences total).
```

---

## Data Model

### TypeScript Interfaces

```typescript
interface Workflow {
  id: string                    // Unique identifier (slug from filename)
  name: string                  // Display name
  description: string           // Human-readable description
  schedule: string              // Cron expression
  enabled: boolean              // Active/inactive toggle
  targeting: AgentTargeting     // How to select agents
  created: string               // ISO timestamp
  modified: string              // ISO timestamp
  author: string                // Creator username
  content: string               // Markdown body (the actual task)
}

interface AgentTargeting {
  communities: string[]         // Community IDs (e.g., ["maximilien"])
  groups: string[]              // Group names (e.g., ["engineering", "operations"])
  tags: string[]                // Agent tags (e.g., ["developer", "qa"])
  agents: string[]              // Specific agent IDs (e.g., ["max0", "max1"])
}

interface WorkflowParticipant {
  agentId: string
  agentName: string
  reason: string                // "community:maximilien" | "group:engineering" | "tag:developer" | "agent:max0"
}
```

---

## Agent Targeting Resolution

Workflows target agents using **OR logic**:
- Include agent if it matches ANY of: communities, groups, tags, or agents list

### Resolution Algorithm

```typescript
function resolveParticipants(workflow: Workflow, allAgents: Agent[]): WorkflowParticipant[] {
  const participants: WorkflowParticipant[] = []

  for (const agent of allAgents) {
    const reasons: string[] = []

    // Check communities
    if (workflow.targeting.communities.length > 0) {
      for (const community of agent.communities || []) {
        if (workflow.targeting.communities.includes(community)) {
          reasons.push(`community:${community}`)
        }
      }
    }

    // Check groups
    if (workflow.targeting.groups.length > 0) {
      for (const group of agent.groups || []) {
        if (workflow.targeting.groups.includes(group)) {
          reasons.push(`group:${group}`)
        }
      }
    }

    // Check tags
    if (workflow.targeting.tags.length > 0) {
      for (const tag of agent.tags || []) {
        if (workflow.targeting.tags.includes(tag)) {
          reasons.push(`tag:${tag}`)
        }
      }
    }

    // Check specific agent IDs
    if (workflow.targeting.agents.length > 0) {
      if (workflow.targeting.agents.includes(agent.id)) {
        reasons.push(`agent:${agent.id}`)
      }
    }

    // If matched for any reason, include
    if (reasons.length > 0) {
      participants.push({
        agentId: agent.id,
        agentName: agent.name,
        reason: reasons.join(', ')
      })
    }
  }

  return participants
}
```

### Targeting Examples

**Example 1: All engineering agents**
```yaml
targeting:
  communities: []
  groups: ["engineering"]
  tags: []
  agents: []
```

**Example 2: Specific agents only**
```yaml
targeting:
  communities: []
  groups: []
  tags: []
  agents: ["max0", "max1", "max5"]
```

**Example 3: All developers and QA**
```yaml
targeting:
  communities: []
  groups: []
  tags: ["developer", "qa"]
  agents: []
```

**Example 4: Entire organization**
```yaml
targeting:
  communities: ["maximilien"]
  groups: []
  tags: []
  agents: []
```

**Example 5: Mixed targeting (OR logic)**
```yaml
targeting:
  communities: []
  groups: ["engineering"]
  tags: ["ops"]
  agents: ["max0"]  # Includes engineering group + ops-tagged agents + max0
```

---

## API Endpoints

### 1. List All Workflows
```
GET /api/workflows
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "daily-standup",
      "name": "Daily Standup Report",
      "description": "Collect daily standup reports...",
      "schedule": "0 9 * * 1-5",
      "enabled": true,
      "created": "2026-03-04T10:00:00Z",
      "modified": "2026-03-04T10:00:00Z",
      "participantCount": 12
    }
  ]
}
```

### 2. Get Workflow Details
```
GET /api/workflows/:id
```

**Response:**
```json
{
  "id": "daily-standup",
  "name": "Daily Standup Report",
  "description": "Collect daily standup reports...",
  "schedule": "0 9 * * 1-5",
  "enabled": true,
  "targeting": {
    "communities": [],
    "groups": ["engineering"],
    "tags": [],
    "agents": []
  },
  "created": "2026-03-04T10:00:00Z",
  "modified": "2026-03-04T10:00:00Z",
  "author": "max",
  "content": "# Daily Standup Report\n\nGenerate a brief..."
}
```

### 3. Create Workflow
```
POST /api/workflows
Content-Type: application/json

{
  "name": "Weekly Summary",
  "description": "Weekly progress summary",
  "schedule": "0 17 * * 5",
  "enabled": true,
  "targeting": {
    "communities": [],
    "groups": ["engineering"],
    "tags": [],
    "agents": []
  },
  "content": "# Weekly Summary\n\nSummarize your week..."
}
```

**Response:**
```json
{
  "id": "weekly-summary",
  "message": "Workflow created successfully"
}
```

### 4. Update Workflow
```
PUT /api/workflows/:id
Content-Type: application/json

{
  "name": "Weekly Summary (Updated)",
  "description": "Updated description",
  "schedule": "0 18 * * 5",
  "enabled": false,
  "targeting": { ... },
  "content": "..."
}
```

**Response:**
```json
{
  "message": "Workflow updated successfully"
}
```

### 5. Delete Workflow
```
DELETE /api/workflows/:id
```

**Response:**
```json
{
  "message": "Workflow deleted successfully"
}
```

### 6. Resolve Participants
```
GET /api/workflows/:id/participants
```

**Response:**
```json
{
  "workflowId": "daily-standup",
  "participants": [
    {
      "agentId": "max0",
      "agentName": "Hernan",
      "reason": "group:engineering"
    },
    {
      "agentId": "max1",
      "agentName": "Alice",
      "reason": "group:engineering"
    },
    {
      "agentId": "max5",
      "agentName": "Bob",
      "reason": "tag:developer"
    }
  ],
  "count": 3
}
```

---

## Implementation Plan

### Phase 1: Backend (v0.8.9) - Tomorrow (Mar 4)

**1. Directory Structure**
- Create `~/.openclaw/workspace/WORKFLOWS/` directory
- Add `.gitkeep` or README

**2. Library: `server/lib/workflows.ts`**
- Install `gray-matter` dependency
- Implement workflow file parser (YAML frontmatter + markdown)
- CRUD operations:
  - `listWorkflows()` - Read all .md files from WORKFLOWS/
  - `getWorkflow(id)` - Read and parse single workflow
  - `createWorkflow(data)` - Generate ID from name, write file
  - `updateWorkflow(id, data)` - Update existing file
  - `deleteWorkflow(id)` - Delete file
- Agent targeting resolution:
  - `resolveParticipants(workflow, agents)` - Apply OR logic
- Validation:
  - Validate cron expression syntax
  - Validate required fields
  - Check for duplicate IDs

**3. API Routes: `server/routes/workflows.ts`**
- Implement 6 endpoints (see API section)
- Error handling (404, 400, 500)
- Input validation with TypeScript types
- Integration with `lib/workflows.ts`

**4. Testing**
- API integration tests for all 6 endpoints
- Test CRUD operations
- Test agent targeting resolution (all scenarios)
- Test cron validation
- Test error cases

### Phase 2: UI (v0.9.0) - Thursday (Mar 5)

**1. Workflows Page: `client/src/pages/Workflows.tsx`**
- New top-level tab in dashboard navigation
- List view of all workflows (WorkflowCard components)
- "Create Workflow" button
- Search/filter bar
- Empty state when no workflows

**2. Components**

**WorkflowCard:**
- Display: name, description, schedule (human-readable), participant count
- Enabled/disabled toggle
- Actions: Edit, Delete, View Details
- Status indicator (next run time)

**WorkflowDetailPanel (slide-out):**
- Full workflow details
- Participant list with reasons
- Markdown content preview
- Actions: Edit, Delete, Duplicate

**WorkflowEditorDialog (modal):**
- Form fields:
  - Name (text input)
  - Description (textarea)
  - Schedule (CronScheduleBuilder component)
  - Enabled (toggle)
  - Agent Targeting (multi-select components)
  - Content (markdown editor)
- Save/Cancel buttons
- Validation feedback

**CronScheduleBuilder:**
- Visual cron builder (dropdowns for common patterns)
- Raw cron input (for advanced users)
- Human-readable preview ("Every weekday at 9am")
- Validation feedback

**AgentTargetingUI:**
- Communities multi-select
- Groups multi-select
- Tags multi-select
- Individual agents multi-select
- Live participant count preview

**3. Integration**
- Add "Workflows" to top navigation (between Organizations and Activity)
- Integrate into AgentDetailPanel (show workflows agent participates in)
- Integrate into Groups/Communities panels (show workflows targeting them)

### Phase 3: Import/Export (v0.9.0) - Friday (Mar 6)

**Organization Template Export:**
- Include workflows in template export
- Bundle WORKFLOWS/ directory into .tar.gz
- Add workflows to manifest.json

**Organization Template Import:**
- Extract WORKFLOWS/ directory from .tar.gz
- Create workflows in target workspace
- Handle ID conflicts (rename if needed)

**Agent Import:**
- No workflow changes needed (agents are independent)

### Phase 4: Polish + Security - Saturday (Mar 7)

**Polish:**
- Loading states for all operations
- Error handling and user feedback
- Empty states with helpful messages
- Responsive design
- Keyboard shortcuts (e.g., Cmd+K to create workflow)

**Essential Security:**
- Rate limiting on workflow APIs (30/minute)
- Input validation and sanitization
- File path validation (prevent directory traversal)
- Cron injection prevention

---

## UI Mockups (Text)

### Workflows Page
```
┌─────────────────────────────────────────────────────────┐
│ ClawMax Dashboard                                       │
│ [Agents] [Skills] [Docs] [Comms] [Activity] [Templates]│
│ [Organizations] [►Workflows◄]                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Workflows                          [+ Create Workflow] │
│  ───────────────────────────────────────────────────    │
│                                                          │
│  [Search workflows...]                    🔍            │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Daily Standup Report                     [ON]   │   │
│  │ 9am Mon-Fri • 12 agents                         │   │
│  │ Collect daily standup reports from engineering  │   │
│  │ [View Details] [Edit] [Delete]                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Weekly Summary                           [OFF]  │   │
│  │ 5pm Fridays • 8 agents                          │   │
│  │ Weekly progress summary for all teams           │   │
│  │ [View Details] [Edit] [Delete]                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Workflow Editor Dialog
```
┌─────────────────────────────────────────────────────────┐
│ Create Workflow                                    [✕]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Name                                                    │
│  [Daily Standup Report                            ]     │
│                                                          │
│  Description                                             │
│  [Collect daily standup reports from engineering  ]     │
│                                                          │
│  Schedule                                                │
│  [Preset: ▼ Weekdays at 9am      ]                     │
│  Cron: [0 9 * * 1-5               ]                     │
│  Preview: Every weekday at 9:00 AM                      │
│                                                          │
│  Target Agents                                           │
│  Communities: [Select...                         ▼]     │
│  Groups:      [☑ engineering                     ▼]     │
│  Tags:        [Select...                         ▼]     │
│  Agents:      [Select specific agents...         ▼]     │
│  → Will run on 12 agents                                │
│                                                          │
│  Workflow Content (Markdown)                             │
│  ┌────────────────────────────────────────────────┐    │
│  │ # Daily Standup Report                         │    │
│  │                                                 │    │
│  │ Generate a brief standup report covering:      │    │
│  │ 1. What you accomplished yesterday             │    │
│  │ 2. What you're working on today                │    │
│  │                                                 │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Enabled: [☑ Yes                                  ]     │
│                                                          │
│                              [Cancel]  [Create Workflow] │
└─────────────────────────────────────────────────────────┘
```

---

## Cron Schedule Presets

Common presets for CronScheduleBuilder:

| Preset | Cron Expression | Description |
|--------|----------------|-------------|
| Every hour | `0 * * * *` | Top of every hour |
| Every day at 9am | `0 9 * * *` | Daily at 9:00 AM |
| Weekdays at 9am | `0 9 * * 1-5` | Mon-Fri at 9:00 AM |
| Every Monday at 9am | `0 9 * * 1` | Weekly on Monday |
| 1st of month at 9am | `0 9 1 * *` | Monthly on 1st |
| Every 15 minutes | `*/15 * * * *` | Every 15 min |
| Custom | (user input) | Advanced users |

---

## Validation Rules

### Workflow Validation

**Required Fields:**
- `name` - 1-100 characters
- `description` - 1-500 characters
- `schedule` - Valid cron expression
- `content` - 1-10,000 characters

**Optional Fields:**
- `enabled` - Boolean (default: true)
- `targeting` - At least one targeting method must be specified
- `author` - String (default: current user)

**Cron Expression Validation:**
- Must have exactly 5 fields (minute, hour, day, month, weekday)
- Each field must be valid cron syntax
- Use a cron parsing library (e.g., `cron-parser` or `cronstrue`)

**ID Generation:**
- Convert name to lowercase slug
- Replace spaces with hyphens
- Remove special characters
- Ensure uniqueness (append -2, -3, etc. if needed)

### File Path Validation

**Security:**
- Workflow IDs must match: `/^[a-z0-9-]+$/`
- Prevent directory traversal: No `..`, `/`, `\` in IDs
- Limit filename length to 100 characters

---

## Error Handling

### API Errors

**404 - Workflow Not Found:**
```json
{
  "error": "Workflow not found",
  "workflowId": "invalid-id"
}
```

**400 - Invalid Input:**
```json
{
  "error": "Invalid workflow data",
  "details": {
    "name": "Name is required",
    "schedule": "Invalid cron expression"
  }
}
```

**409 - Conflict:**
```json
{
  "error": "Workflow already exists",
  "workflowId": "daily-standup"
}
```

**500 - Server Error:**
```json
{
  "error": "Failed to create workflow",
  "message": "Disk write error"
}
```

---

## Future Enhancements (Not v0.9.0)

### Execution Engine (v1.0)
- Cron scheduler daemon
- Execute workflows on schedule
- Send workflow content to targeted agents via gateway
- Collect responses
- Store execution history

### Workflow Results (v1.1)
- Results page showing execution history
- Per-agent responses
- Success/failure tracking
- Retry logic for failed executions

### Workflow Templates (v1.2)
- Pre-built workflow templates library
- Import/export individual workflows
- Workflow marketplace

### Advanced Features (v2.0)
- Conditional execution (only if agent is online)
- Workflow dependencies (run after another workflow)
- Multi-step workflows (sequence of tasks)
- Workflow analytics (execution stats)

---

## Testing Strategy

### Unit Tests
- Workflow file parsing (YAML + markdown)
- ID generation and uniqueness
- Cron validation
- Agent targeting resolution logic

### Integration Tests
- All 6 API endpoints
- CRUD operations end-to-end
- File system operations (create, read, update, delete)
- Error cases (invalid input, missing files, etc.)

### UI Tests
- Create workflow flow
- Edit workflow flow
- Delete workflow with confirmation
- Agent targeting UI
- Cron builder component

### Manual Testing Scenarios
1. Create workflow targeting engineering group → verify correct agents included
2. Create workflow with custom cron → verify validation and preview
3. Edit workflow and change targeting → verify participant count updates
4. Disable workflow → verify status changes
5. Delete workflow → verify file removed
6. Import org template with workflows → verify workflows created

---

## Dependencies

### NPM Packages
- `gray-matter` - YAML frontmatter parsing
- `cronstrue` - Convert cron to human-readable text
- `cron-parser` - Validate cron expressions (optional)

### Existing Systems
- Workspace file system (`~/.openclaw/workspace/`)
- Agent listing API (`/api/agents`)
- Groups/Communities data from `openclaw.json`

---

## Open Questions

1. **Execution Engine Scope:**
   - Should v0.9.0 include basic execution, or just storage?
   - **Decision:** Storage only for v0.9.0. Execution in v1.0.

2. **Workflow Permissions:**
   - Should workflows have owner/creator permissions?
   - **Decision:** No permissions in v0.9.0. Single-user system.

3. **Workflow Versioning:**
   - Should we track workflow edit history?
   - **Decision:** No versioning in v0.9.0. Git handles this.

4. **Agent Offline Handling:**
   - What happens if targeted agent is offline during execution?
   - **Decision:** Deferred to execution engine (v1.0).

---

## Success Criteria

### v0.8.9 (Backend)
- [x] WORKFLOWS directory created
- [x] gray-matter dependency added
- [x] `server/lib/workflows.ts` fully implemented
- [x] All 6 API endpoints working
- [x] Agent targeting resolution tested
- [x] Cron validation working
- [x] API integration tests passing

### v0.9.0 (UI)
- [x] Workflows page accessible from navigation
- [x] Can create, edit, delete workflows via UI
- [x] CronScheduleBuilder working
- [x] Agent targeting UI working
- [x] Participant preview updating live
- [x] Workflows integrated into agent/group panels
- [x] Workflows included in org template export/import

---

**Ready for Review** ✅

Please review this design and provide feedback before implementation begins.
