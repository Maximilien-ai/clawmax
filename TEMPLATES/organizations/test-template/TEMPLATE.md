---
name: Test Template
type: organization
version: 1.1.0
tags:
  - test
  - minimal
  - fixture
---

Minimal testing fixture with 2 agents, 1 group, 1 community, and a status workflow (runs every 5 min, limited to 5 runs)

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| test1 | test1 | Test Assistant | test, assistant | github |
| test2 | test2 | Test Engineer | test, engineer | github |

## Communities

- **test-community** — Test community for multiagent coordination

## Groups

- **test-group** — Test group for agent communication and status updates (test-community)

## Workflows

### Status Check
- **Schedule:** */5 * * * *
- **Mode:** automated
- **Targets:** groups: test-group

# Status Check

Provide a brief status update:

1. **Current state**: What are you working on?
2. **Any issues**: Anything blocking you?
3. **Next action**: What will you do next?

Keep it concise (2-3 sentences).
