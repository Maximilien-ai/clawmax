---
name: ClawMax System Test
type: organization
version: 2.0.0
category: technical
description: Full platform validation template. Tests agent chat, group chat, workflows, DAG execution, filesystem access, and GitHub coordination.
author: ClawMax Team
tags: [test, system-test, integration, validation]
---

# ClawMax System Test v2

**Purpose:** Validate the entire ClawMax platform. When all tests pass, the install is confirmed working.

## Test Tiers

### Tier 1 — Core (must pass for any deploy)
- **Kickoff**: Agents online, skills listed, groups confirmed
- **Filesystem**: Read/write files in workspace
- **Communications**: Group chat send/receive in the workflow's assigned channel
- **DAG Parallel**: Parallel workflow execution + fan-in

### Tier 2 — Coordination (must pass for templates)
- **GitHub**: Create issues, comment, coordinate via repo

### Test DAG
```
test-kickoff
  → test-filesystem
    → test-comms
      → test-github
      → test-dag-parallel-a
      → test-dag-parallel-b
        → test-report (fan-in)
```

## Agents
- **test-lead**: Orchestrates tests, compiles reports (skills: github, gh-issues, workspace-ls)
- **test-agent1/2**: Execute test tasks, verify outputs (skills: github, gh-issues, workspace-ls)

## Groups
- **Test Status**: Final pass/fail reports
- **Test Chat**: Group messaging tests
- **Test Work**: Workflow execution coordination

## Notes
- Communications and report workflows should use their currently assigned workflow group channel.
- They should not depend on separately bootstrapped session labels in a clean workspace.

## Prerequisites
- OpenClaw CLI installed
- Gateway running (port 18789)
- BYOK or system API keys configured
- GitHub CLI authenticated (for Tier 2)
