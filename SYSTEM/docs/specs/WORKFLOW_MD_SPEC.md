# WORKFLOW.md Specification

> **Version:** 1.0.0
> **Status:** Draft — stabilizing before public release (target: after April 4, 2026)
> **Format:** YAML frontmatter + Markdown body

## Overview

WORKFLOW.md defines a workflow (scheduled or manual task) for multiagent teams. The YAML frontmatter contains metadata (schedule, targeting, execution mode) and the Markdown body contains the instructions sent to agents.

Workflows are the primary coordination mechanism — they tell agents what to do, when, and who participates.

## Format

### YAML Frontmatter (metadata)

```yaml
---
id: daily-standup
name: Daily Standup
description: Async daily standup — what was done, what's planned, blockers
schedule: "30 9 * * *"
enabled: true
executionMode: automated
targeting:
  communities: []
  groups:
    - Status
  tags: []
  agents: []
author: ClawMax Team
created: "2026-03-27T21:39:36.091Z"
modified: "2026-03-27T21:39:36.091Z"
---
```

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable workflow name (1-200 chars) |
| `description` | string | What the workflow does (1-1000 chars) |
| `schedule` | string | Cron expression, `"manual"`, or `"once"` |
| `content` | — | The Markdown body (1-10000 chars) |

#### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | auto-generated | Lowercase alphanumeric + dashes |
| `enabled` | boolean | `true` | Whether the workflow is active |
| `executionMode` | string | `"automated"` | `"automated"` or `"managed"` |
| `owner` | string | — | Agent ID. Required when `executionMode` is `"managed"` |
| `author` | string | — | Who created the workflow |
| `maxRuns` | integer | `0` | Max executions before auto-disable (0 = unlimited) |
| `targeting` | object | — | Which agents receive the workflow |

#### Targeting Object

```yaml
targeting:
  communities: []     # Target all agents in these communities
  groups: [Status]    # Target all agents in these groups
  tags: [lead]        # Target agents with these tags
  agents: [tech-lead] # Target specific agent IDs
```

At least one targeting field should have entries. Multiple fields are OR'd (union).

### Markdown Body (instructions)

The body is the workflow content — markdown instructions sent to participating agents when the workflow executes.

```markdown
# Daily Standup

Each team member: post in Status group with three items:
1. What you completed since last standup
2. What you plan to work on today
3. Any blockers or questions

Tech lead: review blockers and assign help if needed.
```

Best practices:
- Start with a `#` heading matching the workflow name
- Use numbered lists for sequential steps
- Reference specific agents or roles for clarity
- Include a "Project Configuration" section with `[placeholder]` fields for user customization in kickoff workflows

## Schedule Formats

| Value | Meaning | Example |
|-------|---------|---------|
| `"manual"` | Triggered manually only | User clicks "Run" |
| `"once"` | Runs once (e.g., on template apply) | Kickoff workflows |
| Cron expression | Recurring schedule | `"0 9 * * *"` = daily 9am |

### Cron Examples

| Expression | Meaning |
|-----------|---------|
| `0 9 * * *` | Daily at 9:00 AM |
| `0 */2 * * *` | Every 2 hours |
| `*/30 * * * *` | Every 30 minutes |
| `0 10 * * 1` | Weekly Monday at 10:00 AM |
| `0 14 * * 5` | Weekly Friday at 2:00 PM |

## Execution Modes

| Mode | Description |
|------|-------------|
| `automated` | Runs without oversight. All targeted agents receive instructions. |
| `managed` | Requires an `owner` agent. Owner coordinates execution and reports results. |

## Validation

On import, workflows are validated against the workflow JSON schema:
- `name`, `description`, `schedule`, and `content` are required
- `schedule` must be a valid cron expression, `"manual"`, or `"once"`
- If `executionMode` is `"managed"`, `owner` must be set
- `id` must be lowercase alphanumeric with dashes
- Agent IDs in targeting must be lowercase alphanumeric with dashes/underscores

## File Location

Workflows are stored as individual `.md` files:
```
WORKSPACE/WORKFLOWS/
  daily-standup.md
  pr-review.md
  kickoff.md
  executions/        # Execution history
    daily-standup/
      2026-03-28T09-00-00.json
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflows` | GET | List all workflows |
| `/api/workflows/:id` | GET | Get single workflow |
| `/api/workflows` | POST | Create workflow (JSON body) |
| `/api/workflows/:id` | PUT | Update workflow |
| `/api/workflows/:id` | DELETE | Delete workflow |
| `/api/workflows/:id/export-md` | GET | Export as WORKFLOW.md |
| `/api/workflows/import-md` | POST | Import from WORKFLOW.md content |
| `/api/workflows/:id/trigger` | POST | Manually trigger execution |
