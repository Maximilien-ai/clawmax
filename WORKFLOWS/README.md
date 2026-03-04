# Workflows

This directory contains workflow definitions for the organization.

## Structure

- `*.md` - Workflow definition files (YAML frontmatter + markdown content)
- `executions/` - Execution history and logs

## Creating Workflows

Workflows can be created via:
1. Dashboard UI (Workflows page)
2. Manually editing markdown files in this directory

### File Format

```yaml
---
id: my-workflow
name: My Workflow Name
description: Brief description
schedule: "0 9 * * 1-5"  # Cron expression
enabled: true
executionMode: automated  # or "managed"
owner: max0  # Optional: for managed workflows
targeting:
  communities: []
  groups: ["engineering"]
  tags: []
  agents: []
created: 2026-03-04T10:00:00Z
modified: 2026-03-04T10:00:00Z
author: max
---

# Workflow Content

Markdown content describing the task for agents...
```

## Execution Modes

- **automated**: Fully automated execution (no owner required)
- **managed**: Agent owner manages execution (requires `owner` field)

## Agent Targeting

Target agents using OR logic (match ANY of):
- `communities`: Community IDs
- `groups`: Group names
- `tags`: Agent tags
- `agents`: Specific agent IDs
