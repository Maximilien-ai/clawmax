# TEMPLATE.md Specification

> **Version:** 1.0.0
> **Status:** Draft — stabilizing before public release (target: after April 4, 2026)
> **Format:** YAML frontmatter + structured Markdown body

## Overview

TEMPLATE.md defines a multiagent team template in a human-readable format. It describes the agents, communication channels, and workflows that make up a deployable team.

Templates can be defined as either `template.json` (JSON) or `TEMPLATE.md` (Markdown). Both are equivalent — the system auto-detects the format.

## Format

### YAML Frontmatter (minimal metadata)

```yaml
---
name: Dev Team
type: organization
version: "1.0.0"
category: technical
author: ClawMax Team
tags: [engineering, software, devops]
parameters:
  - agentId: engineer
    label: Number of Engineers
    default: 3
    min: 1
    max: 10
---
```

#### Agent & Workflow Template References

Agents in an org template can reference an **agent template** by adding a `template` field:

```markdown
| id | name | role | tags | skills | template |
|----|------|------|------|--------|----------|
| tech-lead | Tech Lead | Technical leadership | lead | github | senior-engineer |
```

When applied, the system looks up `TEMPLATES/agents/{template}/` for pre-built files (IDENTITY.md, SOUL.md, TOOLS.md). If the template exists, those files are copied to the new agent. If not, files are generated from the role/tags.

Similarly, workflows can reference **workflow templates** stored in `WORKFLOWS/templates/`:

```markdown
### PR Review
- **Template:** pr-review-standard
```

This allows reusable workflow definitions across multiple org templates.

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable template name |
| `type` | `"organization"` or `"agent"` | Template type |

#### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | `"1.0.0"` | Semantic version (X.Y.Z) |
| `category` | string | — | `"business"`, `"technical"`, or `"personal"` |
| `author` | string | — | Template author |
| `tags` | string[] | `[]` | Searchable tags |
| `parameters` | object[] | — | Scalable agent parameters (agentId, label, default, min, max) |

### Markdown Body (structured sections)

The body starts with a description paragraph, followed by structured sections.

#### Description

Free text before the first `##` heading. Becomes the template description.

```markdown
A multiagent software development team with engineering, QA, and DevOps roles.
```

#### ## Agents

Agent definitions as a Markdown table:

```markdown
## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| tech-lead | Tech Lead | Technical leadership | lead, engineering | github, gh-issues |
| engineer | Software Engineer | Feature development | engineering | github |
```

**Columns:** `id` (required, kebab-case), `name`, `role`, `tags` (comma-separated), `skills` (comma-separated)

Alternative bullet format:
```markdown
- **tech-lead**: Technical leadership (tags: lead, engineering) (skills: github)
```

#### ## Communities

```markdown
## Communities

- **Dev Team** — All engineering team coordination
```

Format: `- **Name** — Description`

#### ## Groups

```markdown
## Groups

- **Engineering** — Feature development and code review (Dev Team)
- **QA** — Test plans and bug reports (Dev Team)
```

Format: `- **Name** — Description (Parent Community)`

#### ## Workflows

Each workflow is a `###` subsection with metadata and content:

```markdown
## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: tech-lead)
- **Targets:** agents: tech-lead

# Dev Team Kickoff

You are the Tech Lead. Your team just came online.
...
```

**Metadata lines** (parsed from `- **Key:** value`):
- `Schedule`: cron expression, `manual`, or `once`
- `Mode`: `automated` or `managed (owner: agent-id)`
- `Targets`: `agents: a, b; groups: g1; tags: t1`

**Content**: Everything after the metadata lines until the next `###` workflow.

## Validation

On import, the template is validated against the organization template JSON schema:
- `name` must be non-empty
- `type` must be `"organization"` or `"agent"`
- `agents` must have at least one entry with a valid `id`
- Agent IDs must be kebab-case (`^[a-z][a-z0-9-]*$`)
- `version` must be semantic (X.Y.Z)

## Compatibility

- **template.json** takes priority when both exist in a directory
- **TEMPLATE.md v1** (everything in frontmatter) is still supported for backward compatibility
- The system auto-detects the format: if frontmatter has `agents` array, it uses v1; if body has `## Agents`, it uses v2

## File Location

Templates are stored in directories:
```
TEMPLATES/organizations/{slug}/
  template.json    # JSON format (primary)
  TEMPLATE.md      # Markdown format (equivalent)
  agents/          # Optional: pre-built agent files (IDENTITY.md, SOUL.md, etc.)
```
