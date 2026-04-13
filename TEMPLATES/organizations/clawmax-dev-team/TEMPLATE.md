---
name: ClawMax Dev Team
type: organization
version: 1.0.0
category: technical
description: Self-managing development team. Agents triage issues, review PRs, run tests, and prepare releases.
author: ClawMax Team
tags: [dev-team, self-management, github, ci-cd]
---

# ClawMax Dev Team

**Purpose:** Autonomous dev team that manages a GitHub repo — triage issues, review PRs, run tests, prepare releases.

## Agents
- **dev-lead**: Architecture decisions, PR approvals, sprint planning
- **qa-engineer**: Test execution, coverage reporting, failure tracking
- **github-triage**: Issue labeling, priority assignment, stale issue detection
- **release-engineer**: Changelogs, version tags, release notes

## Workflow DAG
```
dev-team-kickoff
  → issue-triage (daily 9am)
  → test-run (daily 10am)
    → pr-review (manual, after triage)
      → release-prep (manual, after PR review + tests)
```

## Defaults
- GitHub repo: owner/repo-name
- Main branch: main
- Test command: ./SYSTEM/test.sh
- Release prefix: v

## Groups
- **Dev Status**: Daily standups
- **Code Review**: PR discussions
- **Testing**: Test results and QA
- **Triage**: Issue management
- **Release**: Release planning and deployment
