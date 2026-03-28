---
name: Engineering Team
type: organization
version: 1.1.0
category: technical
author: ClawMax Team
tags:
  - technical
  - engineering
  - software
  - development
parameters:
  - agentId: engineer
    label: Number of Engineers
    default: 2
    min: 1
    max: 20
---

A complete engineering team with 2 engineers, QA engineer, and release engineer. Includes daily standups, code review reminders, and release preparation workflows.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| engineer | Engineer | Software Engineer | engineer, developer | github |
| qa-engineer | QA Engineer | Quality Assurance Engineer | engineer, qa, quality | github |
| release-engineer | Release Engineer | Release Engineer | engineer, release-manager, github | github |

## Communities

- **Engineering Team** — Software development, QA, and release management

## Groups

- **Code Review** — Engineers reviewing code and PRs (Engineering Team)
- **Release Team** — Production release coordination (Engineering Team)
- **Status** — Status updates and progress tracking (Engineering Team)

## Workflows

### Daily Standup
- **Schedule:** 0 9 * * 1-5
- **Mode:** automated

# Engineering Daily Standup

Provide your update:

### Yesterday
- Code completed or PRs merged

### Today
- Tasks in progress

### Blockers
- Anything blocking your work?

### Code Review Reminder
- **Schedule:** 0 10,14 * * 1-5
- **Mode:** automated
- **Targets:** groups: Code Review

# Code Review Reminder

Please review pending pull requests:

1. Check your assigned PRs
2. Prioritize PRs blocking others
3. Provide constructive feedback
4. Approve or request changes

### PR Review
- **Schedule:** manual
- **Mode:** automated
- **Targets:** tags: qa

# PR Review Workflow

## Tasks
1. Check for open pull requests on the repository
2. Review code changes for quality and correctness
3. Verify tests pass and coverage is adequate
4. Check for TypeScript errors and style issues
5. Provide feedback or approve the PR

## Output
- GitHub review comment (approve or request changes)
- Test results summary

### Release Preparation
- **Schedule:** 0 9 * * 3
- **Mode:** managed
- **Targets:** groups: Release Team

# Release Preparation Checklist

## Pre-Release Tasks

1. **Code Freeze**: Are all features merged?
2. **Testing**: QA sign-off complete?
3. **Documentation**: Release notes updated?
4. **Infrastructure**: Deployment plan ready?
5. **Rollback**: Rollback plan documented?

Provide status on each item.
